import { describe, expect, it } from 'vitest';
import { backfillSessions, donePercent } from '../src/domain/backfill';

let n = 0;
const id = () => `s${n++}`;
const base = { jobId: 'j1', createdAt: 0, updatedAt: 0 };
const hours = (ss: { start: number; end?: number }[]) => ss.reduce((a, s) => a + ((s.end ?? 0) - s.start), 0) / 3_600_000;

describe('backfilling time', () => {
  it('exact times make one entry, past midnight when the end is earlier', () => {
    const [s] = backfillSessions({ kind: 'times', date: '2026-09-24', start: '22:00', end: '01:00' }, base, id);
    expect(hours([s])).toBe(3);
    expect(s.approx).toBeUndefined();
  });
  it('hours over a range are split evenly, one guessed entry a day', () => {
    const ss = backfillSessions({ kind: 'range', from: '2026-09-21', to: '2026-09-24', hours: 10 }, base, id);
    expect(ss).toHaveLength(4);
    expect(hours(ss)).toBeCloseTo(10);
    expect(ss.every((s) => s.approx)).toBe(true);
    expect(new Date(ss[3].start).getDate()).toBe(24);
  });
  it('a reversed range still works, and no hours means nothing', () => {
    expect(backfillSessions({ kind: 'range', from: '2026-09-24', to: '2026-09-23', hours: 2 }, base, id)).toHaveLength(2);
    expect(backfillSessions({ kind: 'range', from: '2026-09-21', to: '2026-09-24', hours: 0 }, base, id)).toEqual([]);
  });
  it('words done count as a share of the job', () => {
    expect(donePercent(2500, 'words', 10000)).toBe(25);
    expect(donePercent(12, 'pct', 10000)).toBe(12);
    expect(donePercent(500, 'words', 0)).toBe(0);
  });
});
