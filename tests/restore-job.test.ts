import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { db } from '../src/db/db';
import { deleteJob, deleteSession, restoreJob, sessionsToRestore } from '../src/db/repo';
import type { Job, Session } from '../src/domain/types';

const session = (id: string, deletedAt?: number) => ({ id, jobId: 'j1', start: 0, end: 60_000, updatedAt: 1, deletedAt }) as Session;

describe('sessionsToRestore', () => {
  it('only brings back sessions that share the job tombstone', () => {
    const picked = sessionsToRestore({ deletedAt: 500 }, [session('a', 500), session('b', 200), session('c')]);
    expect(picked.map((s) => s.id)).toEqual(['a']);
  });
  it('restores nothing for a job that is not deleted', () => {
    expect(sessionsToRestore({}, [session('a', 500)])).toEqual([]);
  });
});

describe('restoreJob', () => {
  it('leaves a session deleted before the job deleted', async () => {
    await db.jobs.put({ id: 'j1', title: 'Manual', status: 'active', updatedAt: 1 } as unknown as Job);
    await db.sessions.bulkPut([session('s1'), session('s2')]);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_000);
    await deleteSession('s1');
    vi.setSystemTime(2_000);
    await deleteJob('j1');
    vi.setSystemTime(3_000);
    await restoreJob('j1');
    vi.useRealTimers();
    expect((await db.jobs.get('j1'))?.deletedAt).toBeUndefined();
    expect((await db.sessions.get('s1'))?.deletedAt).toBe(1_000);
    expect((await db.sessions.get('s2'))?.deletedAt).toBeUndefined();
  });
});
