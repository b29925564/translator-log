import { describe, expect, it } from 'vitest';
import { legacyDayLog, nextDayLog, progressPieces } from '../src/domain/progress';
import { dailyWords } from '../src/domain/stats';
import type { Job, Session } from '../src/domain/types';

const at = (d: string) => new Date(`${d}T10:00:00`).getTime();

const job = (over: Partial<Job> = {}): Job => ({
  id: 'j1',
  createdAt: at('2026-09-25'),
  updatedAt: 0,
  title: 'cutscene',
  service: 'translation',
  sourceLang: 'en',
  targetLang: 'zh-TW',
  tags: [],
  unit: 'word',
  quantity: 10000,
  rate: 0,
  currency: 'TWD',
  fxToBase: 1,
  status: 'active',
  receivedAt: '2026-09-21',
  progress: 50,
  ...over,
});

const days = (m: Map<string, number>) => Object.fromEntries([...m.entries()].filter(([, v]) => v > 0.01).map(([d, v]) => [d, Math.round(v)]));

describe('the reported job: received Mon 9/21, entered Fri 9/25 at 50%', () => {
  it('spreads the earlier half over Mon–Fri only, marked as an estimate, and stops there', () => {
    const j = job({ dayStart: { date: '2026-09-25', progress: 0 } });
    const guessed = new Map<string, number>();
    const d = dailyWords([j], [], '2026-09-29', [1, 2, 3, 4, 5], guessed);
    expect(days(d)).toEqual({ '2026-09-21': 1000, '2026-09-22': 1000, '2026-09-23': 1000, '2026-09-24': 1000, '2026-09-25': 1000 });
    expect(days(guessed)).toEqual(days(d));
  });
  it('a later timer session does not pull the earlier half onto its day', () => {
    const j = job();
    const s: Session = { id: 's', jobId: 'j1', start: at('2026-09-28'), end: at('2026-09-28') + 3_600_000, createdAt: 0, updatedAt: 0 };
    const d = dailyWords([j], [s], '2026-09-28');
    expect(d.get('2026-09-28') ?? 0).toBe(0);
  });
});

describe('logging progress', () => {
  const start = job();
  const saved = { ...start, dayLog: nextDayLog(undefined, start, '2026-09-25') };

  it('treats progress on a new job as work done before it was entered', () => {
    expect(saved.dayLog).toEqual([{ date: '2026-09-25', from: 50, to: 50 }]);
  });
  it('puts later progress on the day it is logged, and merges logs on the same day', () => {
    const mon = { ...saved, progress: 60 };
    const log1 = nextDayLog(saved, mon, '2026-09-28')!;
    const log2 = nextDayLog({ ...mon, dayLog: log1 }, { ...mon, progress: 70 }, '2026-09-28')!;
    expect(log2).toEqual([
      { date: '2026-09-25', from: 50, to: 50 },
      { date: '2026-09-28', from: 50, to: 70 },
    ]);
    const d = dailyWords([{ ...mon, progress: 70, dayLog: log2 }], [], '2026-09-29');
    expect(d.get('2026-09-28')).toBeCloseTo(2000);
    expect(d.get('2026-09-29') ?? 0).toBe(0);
  });
  it('can log yesterday, or spread over the days since the last log', () => {
    const y = nextDayLog(saved, { ...saved, progress: 60 }, '2026-09-29', { date: '2026-09-28' })!;
    expect(y.at(-1)).toEqual({ date: '2026-09-28', from: 50, to: 60 });
    const sp = nextDayLog(saved, { ...saved, progress: 80 }, '2026-10-01', { since: '2026-09-28' })!;
    const guessed = new Map<string, number>();
    const d = dailyWords([{ ...saved, progress: 80, dayLog: sp }], [], '2026-10-01', [1, 2, 3, 4, 5], guessed);
    expect(days(d)).toMatchObject({ '2026-09-28': 750, '2026-09-29': 750, '2026-09-30': 750, '2026-10-01': 750 });
    expect(guessed.get('2026-09-28')).toBeCloseTo(750);
  });
  it('lowering progress takes words back from the latest days, never below zero', () => {
    const pieces = progressPieces(
      [
        { date: '2026-09-25', from: 50, to: 50 },
        { date: '2026-09-28', from: 50, to: 60 },
        { date: '2026-09-29', from: 60, to: 45 },
      ],
      '2026-09-21',
      '2026-09-29',
      45,
      '2026-09-25',
    );
    expect(pieces.reduce((s, p) => s + p.pct, 0)).toBeCloseTo(45);
    expect(pieces.every((p) => p.pct > 0)).toBe(true);
    expect(pieces.some((p) => p.from === '2026-09-28')).toBe(false);
  });
  it('spreads the untracked rest of a delivered job after the last log, up to delivery', () => {
    const dl = [{ date: '2026-09-25', from: 50, to: 50 }, { date: '2026-09-28', from: 50, to: 70 }];
    const done = job({ status: 'delivered', progress: 100, deliveredAt: '2026-09-30', dayLog: dl });
    const d = dailyWords([done], [], '2026-10-02');
    expect(days(d)).toMatchObject({ '2026-09-28': 2000, '2026-09-29': 1500, '2026-09-30': 1500 });
    expect(d.get('2026-10-01') ?? 0).toBe(0);
  });
});

describe('older jobs', () => {
  it('rebuild a log from the day the job was created and the last day progress moved', () => {
    expect(legacyDayLog(job({ dayStart: { date: '2026-09-28', progress: 40 } }))).toEqual([{ date: '2026-09-28', from: 40, to: 50 }]);
    expect(legacyDayLog(job({ progress: 0 }))).toEqual([]);
  });
  it('keep the old whole-job spread once earned, so past history does not move', () => {
    const old = job({ status: 'paid', progress: 100, deliveredAt: '2026-09-25', paidAt: '2026-09-30' });
    const d = dailyWords([old], [], '2026-10-02');
    expect(Math.round([...d.values()].reduce((a, b) => a + b, 0))).toBe(10000);
    expect(d.get('2026-09-21')).toBeGreaterThan(0);
  });
});
