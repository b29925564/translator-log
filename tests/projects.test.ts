import { describe, expect, it } from 'vitest';
import { generateDemo } from '../src/domain/demo';
import { mergeSnapshots, emptySnapshot } from '../src/domain/merge';
import { candidateJobs, isOngoing, partKind, partLabel, partTitle, projectDone, projectStats, queriesText, shortPartName, sortQueries, templateFor } from '../src/domain/projects';
import type { Job, Project } from '../src/domain/types';

const job = (over: Partial<Job> = {}): Job => ({
  id: 'j' + Math.random(),
  createdAt: 0,
  updatedAt: 0,
  title: 't',
  service: 'translation',
  sourceLang: 'en',
  targetLang: 'zh-TW',
  tags: [],
  unit: 'word',
  quantity: 1000,
  rate: 0.1,
  currency: 'USD',
  fxToBase: 30,
  status: 'quote',
  ...over,
});

const project = (over: Partial<Project> = {}): Project => ({ id: 'p1', createdAt: 0, updatedAt: 0, name: 'Starfall', kind: 'game', links: [], queries: [], ...over });

describe('part names', () => {
  it('numbers episodes and chapters in both languages', () => {
    expect(partLabel(partKind('episode')!, 'zh-TW', 3)).toBe('第 3 集');
    expect(partLabel(partKind('chapter')!, 'en', 12)).toBe('Chapter 12');
    expect(partLabel(partKind('trailer')!, 'en')).toBe('Trailer subtitles');
  });
  it('prefixes the project name and strips it again', () => {
    expect(partTitle('Starfall', 'Cutscenes', 'en')).toBe('Starfall — Cutscenes');
    expect(shortPartName('Starfall — Cutscenes', 'Starfall')).toBe('Cutscenes');
    expect(shortPartName('《星墜紀元》｜劇情對話', '《星墜紀元》')).toBe('劇情對話');
    expect(shortPartName('Something else', 'Starfall')).toBe('Something else');
  });
});

describe('projectStats', () => {
  it('weighs progress by effort, so a big part counts more than a small one', () => {
    const parts = [
      job({ status: 'delivered', quantity: 1000 }), // done
      job({ status: 'active', quantity: 9000, progress: 50 }),
    ];
    const s = projectStats(project(), parts, '2026-03-02', 500);
    // 1000 done + 4500 of 9000 → 5500 / 10000
    expect(s.progress).toBeCloseTo(0.55, 2);
    expect(s.parts).toBe(2);
    expect(s.done).toBe(1);
    expect(s.words).toBe(10000);
    expect(s.value).toBeCloseTo(10000 * 0.1 * 30);
  });

  it('keeps minutes and hours apart from words and finds the next deadline', () => {
    const parts = [
      job({ unit: 'minute', quantity: 3, rate: 18, dueAt: '2026-03-10' }),
      job({ unit: 'hour', quantity: 16, rate: 35, dueAt: '2026-04-01' }),
      job({ quantity: 4000, dueAt: '2026-03-05', status: 'active' }),
      job({ status: 'cancelled', quantity: 99999 }),
    ];
    const s = projectStats(project({ dueAt: '2026-04-15' }), parts, '2026-03-02');
    expect(s.words).toBe(4000);
    expect(s.minutes).toBe(3);
    expect(s.hours).toBe(16);
    expect(s.parts).toBe(3);
    expect(s.nextDue?.date).toBe('2026-03-05');
    expect(s.end).toBe('2026-04-15');
  });
});

describe('query log', () => {
  it('turns open questions into a numbered list for the client', () => {
    const cut = job({ title: 'Starfall — Cutscenes' });
    const p = project({
      queries: [
        { id: 'a', text: 'Keep “Aria” in English?', jobId: cut.id, ref: 'CS_014', status: 'open', createdAt: 2 },
        { id: 'b', text: 'Glossary shared?', status: 'answered', answer: 'Yes', createdAt: 1 },
        { id: 'c', text: 'Max length for Respec?', status: 'sent', createdAt: 3 },
      ],
    });
    expect(queriesText(p, [cut], 'en')).toBe('Questions on Starfall (2)\n\n1. [Cutscenes · CS_014] Keep “Aria” in English?\n2. Max length for Respec?');
    expect(sortQueries(p.queries).map((q) => q.id)).toEqual(['a', 'c', 'b']);
  });
});

describe('projects in sync and demo data', () => {
  it('merges with a device that predates projects', () => {
    const local = { ...emptySnapshot(), projects: [project({ updatedAt: 5 })] };
    const old = { jobs: [], clients: [], sessions: [], invoices: [], prefs: [] } as unknown as ReturnType<typeof emptySnapshot>;
    const r = mergeSnapshots(local, old);
    expect(r.merged.projects).toHaveLength(1);
    expect(r.remoteStale).toBe(true);
    expect(r.toLocal.projects).toHaveLength(0);
  });

  it('ships a game project whose parts all point back to it', () => {
    const d = generateDemo('2026-03-02');
    expect(d.projects).toHaveLength(1);
    const parts = d.jobs.filter((j) => j.projectId === d.projects[0].id);
    expect(parts.length).toBeGreaterThanOrEqual(6);
    expect(new Set(parts.map((j) => j.part))).toContain('cutscene');
    expect(d.projects[0].queries.some((q) => q.status === 'open')).toBe(true);
  });
});

describe('résumé', () => {
  it('lists a multi-part project once, with its parts added up', async () => {
    const { buildResume } = await import('../src/domain/resume');
    const p = project({ name: 'Starfall', confidential: true, publicTitle: 'Fantasy RPG localisation' });
    const jobs = [
      job({ projectId: 'p1', status: 'paid', quantity: 4000, deliveredAt: '2026-01-10', domain: 'games' }),
      job({ projectId: 'p1', status: 'paid', quantity: 20000, deliveredAt: '2026-02-10', domain: 'games' }),
      job({ status: 'paid', quantity: 3000, deliveredAt: '2025-05-10', title: 'Solo job' }),
    ];
    const r = buildResume(jobs, [], { name: 'A' }, { lang: 'en', clientMode: 'hidden', projectCount: 6, projects: [p] });
    expect(r.projects).toHaveLength(2);
    expect(r.projects[0]).toMatchObject({ title: 'Fantasy RPG localisation', words: 24000, year: 2026 });
    expect(r.projects[0].detail).toContain('2 parts');
    expect(r.stats.jobs).toBe(3);
  });
});

describe('ongoing projects', () => {
  it('start with no parts and stay open when every job so far is done', () => {
    const p = project({ kind: 'ongoing' });
    expect(isOngoing(p)).toBe(true);
    expect(templateFor('ongoing').selected).toEqual([]);
    const s = projectStats(p, [job({ projectId: 'p1', status: 'paid' })], '2026-09-25');
    expect(projectDone(p, s)).toBe(false);
    expect(projectDone({ ...p, archived: true }, s)).toBe(true);
    expect(projectDone(project(), s)).toBe(true);
  });
  it('offers unfiled jobs, likely matches first', () => {
    const jobs = [
      job({ id: 'old', title: 'Unrelated', receivedAt: '2026-09-20' }),
      job({ id: 'filed', title: 'Starfall patch', projectId: 'other' }),
      job({ id: 'gone', title: 'Starfall store page', deletedAt: 1 }),
      job({ id: 'client', title: 'Batch 7', clientId: 'c1', receivedAt: '2026-01-01' }),
      job({ id: 'name', title: '《Starfall》 dialogue batch 2', receivedAt: '2026-02-01' }),
    ];
    const out = candidateJobs({ name: 'Starfall', clientId: 'c1' }, jobs);
    expect(out.map((x) => x.job.id)).toEqual(['name', 'client', 'old']);
    expect(out.map((x) => x.likely)).toEqual([true, true, false]);
  });
});
