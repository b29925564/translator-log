import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// In-memory stand-in for the GitHub Gist API.
const gists = new Map<string, { description: string; files: Record<string, { content: string }> }>();
let seq = 0;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeAll(() => {
  (globalThis as unknown as { location: unknown }).location = { origin: 'https://wordtrail.test', pathname: '/app/' };
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
    if (auth !== 'Bearer good-token') return json({ message: 'Bad credentials' }, 401);
    const method = init?.method ?? 'GET';
    if (u.pathname === '/user') return json({ login: 'translator' });
    if (u.pathname === '/gists' && method === 'GET') return json([...gists.entries()].map(([id, g]) => ({ id, ...g, updated_at: '' })));
    if (u.pathname === '/gists' && method === 'POST') {
      const body = JSON.parse(String(init!.body));
      const id = 'g' + ++seq;
      gists.set(id, { description: body.description, files: body.files });
      return json({ id, ...gists.get(id), updated_at: '' }, 201);
    }
    const m = /^\/gists\/(\w+)$/.exec(u.pathname);
    if (m) {
      const g = gists.get(m[1]);
      if (!g) return json({ message: 'Not Found' }, 404);
      if (method === 'PATCH') {
        const body = JSON.parse(String(init!.body));
        g.files = { ...g.files, ...body.files };
      }
      return json({ id: m[1], ...g, updated_at: '' });
    }
    return json({ message: 'unexpected ' + url }, 500);
  });
});

describe('encrypted gist sync', () => {
  it('connects, pairs a second device, and merges edits both ways', async () => {
    const { db } = await import('../src/db/db');
    const repo = await import('../src/db/repo');
    const engine = await import('../src/sync/engine');
    const { decryptJSON, deriveKey } = await import('../src/sync/crypto');

    // device A has one job and turns sync on
    const a = repo.newJob({ title: 'Device A job', quantity: 1000, rate: 1 });
    await repo.saveJob(a);
    await expect(engine.connect('bad-token', 'correct horse')).rejects.toBeTruthy();
    const r = await engine.connect('good-token', 'correct horse');
    expect(r.created).toBe(true);
    expect(gists.size).toBe(1);
    const stored = JSON.parse([...gists.values()][0].files['wordtrail.json'].content);
    expect(stored.ct).not.toContain('Device A job'); // only ciphertext leaves the device
    const link = await engine.pairingLink();
    expect(link).toMatch(/^https:\/\/wordtrail\.test\/app\/#\/pair\//);

    // device B starts empty and pairs with the link + passphrase
    await engine.disconnect();
    await repo.wipeAll();
    expect(await db.jobs.count()).toBe(0);
    const payload = link!.split('#/pair/')[1];
    await expect(engine.acceptPairing(payload, 'wrong pass')).rejects.toBeTruthy();
    await engine.acceptPairing(payload, 'correct horse');
    expect((await db.jobs.toArray()).map((j) => j.title)).toEqual(['Device A job']);

    // device B adds a job and edits A's job; the gist ends up with both changes
    const b = repo.newJob({ title: 'Device B job' });
    await repo.saveJob(b);
    const aOnB = (await db.jobs.get(a.id))!;
    await new Promise((res) => setTimeout(res, 5));
    await repo.saveJob({ ...aOnB, title: 'Edited on B' });
    await engine.syncNow();
    const env = JSON.parse([...gists.values()][0].files['wordtrail.json'].content);
    const key = await deriveKey('correct horse', env.kdf.salt, env.kdf.iter);
    const snap = await decryptJSON<{ jobs: { id: string; title: string }[] }>(env, key);
    expect(snap.jobs.map((j) => j.title).sort()).toEqual(['Device B job', 'Edited on B']);
    expect(engine.useSync.getState().status).toBe('idle');

    // replacing everything from a backup sticks: the next sync does not bring the old jobs back
    const backup = await repo.exportBackup();
    const kept = backup.data.jobs.find((j) => j.id === b.id)!;
    await repo.saveJob(repo.newJob({ title: 'Made after the backup' }));
    await engine.syncNow();
    await repo.importBackup({ ...backup, data: { ...backup.data, jobs: [kept] } }, 'replace');
    await engine.syncNow();
    const live = (await db.jobs.toArray()).filter((j) => !j.deletedAt).map((j) => j.title);
    expect(live).toEqual(['Device B job']);
  }, 60_000);
});
