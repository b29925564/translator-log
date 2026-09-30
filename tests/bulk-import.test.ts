import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { bulkEdited, newJob, splitTags } from '../src/db/repo';
import { planImport, projectFor } from '../src/db/reportApply';
import { DEFAULT_SETTINGS } from '../src/domain/constants';
import { guessMapping } from '../src/domain/csv';
import { jobGross } from '../src/domain/money';
import { gridToReport, rowWords } from '../src/domain/reportImport';

const ctx = { today: '2026-09-29', defaultTargetLang: 'zh-TW' };
const settings = { ...DEFAULT_SETTINGS, baseCurrency: 'TWD' };

describe('weighted and raw words', () => {
  it('guesses the columns from their headers', () => {
    expect(guessMapping(['Job', 'Weighted words', 'Total words', 'Rate'])).toEqual(['title', 'weightedWords', 'rawWords', 'rate']);
    expect(guessMapping(['案名', '加權字數', '原始字數'])).toEqual(['title', 'weightedWords', 'rawWords']);
    expect(guessMapping(['案名', '總字數'])).toEqual(['title', 'rawWords']);
    expect(guessMapping(['Raw', 'Weighted'])).toEqual(['rawWords', 'weightedWords']);
  });

  it('bills the weighted count and keeps the raw one beside it', () => {
    expect(rowWords(undefined, 800, 1000)).toEqual({ quantity: 800, rawWords: 1000 });
    expect(rowWords(undefined, undefined, 1000)).toEqual({ quantity: 1000, rawWords: undefined });
    expect(rowWords(500, undefined, undefined)).toEqual({ quantity: 500, rawWords: undefined });
    expect(rowWords(undefined, 1000, 1000)).toEqual({ quantity: 1000, rawWords: undefined });
  });

  it('imports both and prices on the weighted words', () => {
    const grid = [
      ['Job', 'Weighted words', 'Raw words', 'Rate'],
      ['Manual', '800', '1,000', '0.1'],
    ];
    const r = gridToReport(grid, 0, guessMapping(grid[0]), ctx);
    expect(r.rows[0]).toMatchObject({ quantity: 800, rawWords: 1000 });
    const plan = planImport({ ...r, currency: 'USD' }, [{ jobIds: [], score: 0 }], ['new'], { jobs: [], invoices: [], clients: [], settings, today: ctx.today });
    const j = plan.jobs[0];
    expect(j).toMatchObject({ unit: 'word', quantity: 800, rawWords: 1000, currency: 'USD' });
    expect(jobGross(j)).toBe(80);
  });
});

describe('import currency and project', () => {
  const grid = [
    ['Job', 'Words', 'Amount', '所屬專案'],
    ['Chapter 1', '1000', '100', ''],
    ['Chapter 2', '1000', '100', 'saga'],
  ];
  const r = gridToReport(grid, 0, guessMapping(grid[0]), ctx);
  const projects = [
    { id: 'p1', name: 'Game' },
    { id: 'p2', name: 'Saga ' },
  ];

  it('matches a project column by name, else uses the chosen project', () => {
    expect(projectFor('  SAGA', projects, 'p1')).toBe('p2');
    expect(projectFor('unknown', projects, 'p1')).toBe('p1');
    expect(projectFor(undefined, projects)).toBeUndefined();
  });

  it('gives new jobs the import currency and project', () => {
    const plan = planImport({ ...r, currency: 'JPY' }, r.rows.map(() => ({ jobIds: [], score: 0 })), ['new', 'new'], { jobs: [], invoices: [], clients: [], settings, today: ctx.today, projects, projectId: 'p1' });
    expect(plan.jobs.map((j) => [j.currency, j.projectId])).toEqual([
      ['JPY', 'p1'],
      ['JPY', 'p2'],
    ]);
  });

  it('keeps a row currency over the import currency', () => {
    const g = [
      ['Job', 'Amount', 'Currency'],
      ['A', '10', 'EUR'],
      ['B', '10', ''],
    ];
    const rep = gridToReport(g, 0, guessMapping(g[0]), ctx);
    const plan = planImport({ ...rep, currency: 'USD' }, rep.rows.map(() => ({ jobIds: [], score: 0 })), ['new', 'new'], { jobs: [], invoices: [], clients: [], settings, today: ctx.today });
    expect(plan.jobs.map((j) => j.currency)).toEqual(['EUR', 'USD']);
  });
});

describe('bulkEdited', () => {
  const fx = { fxToBase: (c: string) => (c === 'USD' ? 32 : 1), today: '2026-09-29' };
  const j = newJob({ title: 'A', clientId: 'c1', projectId: 'p1', currency: 'TWD', status: 'delivered', deliveredAt: '2026-09-01' });

  it('changes only the fields that were set', () => {
    const out = bulkEdited(j, { currency: 'USD' }, fx);
    expect(out).toMatchObject({ currency: 'USD', fxToBase: 32, clientId: 'c1', projectId: 'p1', status: 'delivered' });
  });

  it('clears client and project with null', () => {
    const out = bulkEdited(j, { clientId: null, projectId: null }, fx);
    expect(out.clientId).toBeUndefined();
    expect(out.projectId).toBeUndefined();
  });

  it('marks paid on the chosen date and moves status along', () => {
    const out = bulkEdited(j, { paidAt: '2026-09-20' }, fx);
    expect(out).toMatchObject({ status: 'paid', paidAt: '2026-09-20', invoicedAt: '2026-09-20' });
    expect(bulkEdited(j, { status: 'active' }, fx)).toMatchObject({ status: 'active', deliveredAt: undefined });
  });
});

describe('bulk edit of shared fields', () => {
  const fx = { fxToBase: () => 1, today: '2026-09-29' };
  const j = newJob({ title: 'B', tags: ['a'], notes: 'first', unit: 'word', quantity: 1200, currency: 'TWD', domain: 'legal', catTool: 'memoQ' });

  it('sets domain, CAT tool, service, pair and rate', () => {
    const out = bulkEdited(j, { domain: 'games', catTool: 'Trados Studio', service: 'review', sourceLang: 'ja', targetLang: 'zh-TW', rate: 0.5 }, fx);
    expect(out).toMatchObject({ domain: 'games', catTool: 'Trados Studio', service: 'review', sourceLang: 'ja', targetLang: 'zh-TW', rate: 0.5 });
    expect(bulkEdited(j, { domain: null, catTool: null }, fx)).toMatchObject({ domain: undefined, catTool: undefined });
  });

  it('appends or replaces tags and notes', () => {
    expect(bulkEdited(j, { tags: { mode: 'append', values: splitTags('b, a、c') }, notes: { mode: 'append', text: 'second' } }, fx)).toMatchObject({ tags: ['a', 'b', 'c'], notes: 'first\nsecond' });
    expect(bulkEdited(j, { tags: { mode: 'replace', values: ['x'] }, notes: { mode: 'replace', text: '' } }, fx)).toMatchObject({ tags: ['x'], notes: undefined });
  });

  it('keeps the word count when switching to a flat fee', () => {
    expect(bulkEdited(j, { unit: 'flat' }, fx)).toMatchObject({ unit: 'flat', quantity: 1, words: 1200 });
  });

  it('dates can be set or cleared', () => {
    expect(bulkEdited(j, { dueAt: '2026-10-01', receivedAt: null }, fx)).toMatchObject({ dueAt: '2026-10-01', receivedAt: undefined });
  });
});

describe('projects named in a report', () => {
  const grid = [
    ['Job', 'Amount', '所屬專案'],
    ['A1', '10', 'Atlas'],
    ['A2', '10', 'atlas '],
    ['B1', '10', 'Borealis'],
    ['C1', '10', 'Game'],
  ];
  const r = gridToReport(grid, 0, guessMapping(grid[0]), ctx);

  it('creates each unknown name once, as an ongoing project of the client', () => {
    const plan = planImport({ ...r, client: 'Acme' }, r.rows.map(() => ({ jobIds: [], score: 0 })), ['new', 'new', 'new', 'new'], { jobs: [], invoices: [], clients: [], settings, today: ctx.today, projects: [{ id: 'p1', name: 'Game' }] });
    expect(plan.projects.map((p) => [p.name, p.kind])).toEqual([
      ['Atlas', 'ongoing'],
      ['Borealis', 'ongoing'],
    ]);
    expect(plan.projects.every((p) => p.clientId === plan.clients[0].id)).toBe(true);
    const [atlas, borealis] = plan.projects;
    expect(plan.jobs.map((j) => j.projectId)).toEqual([atlas.id, atlas.id, borealis.id, 'p1']);
  });

  it('makes no project for skipped rows or jobs that already have one', () => {
    const existing = newJob({ title: 'A1', projectId: 'p1' });
    const plan = planImport(r, [{ jobIds: [existing.id], score: 1 }, { jobIds: [], score: 0 }, { jobIds: [], score: 0 }, { jobIds: [], score: 0 }], ['update', 'skip', 'skip', 'skip'], { jobs: [existing], invoices: [], clients: [], settings, today: ctx.today, projects: [] });
    expect(plan.projects).toEqual([]);
  });
});
