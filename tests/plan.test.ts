import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/domain/constants';
import { skylineMonths, skylineQuarters, todayPlan } from '../src/domain/stats';
import type { Job } from '../src/domain/types';

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
  rate: 1,
  currency: 'TWD',
  fxToBase: 1,
  status: 'delivered',
  ...over,
});

const work = { ...DEFAULT_SETTINGS.work, workDays: [1, 2, 3, 4, 5], hoursPerDay: 6 };

describe('skylineMonths', () => {
  it('fills every month from the first job to today, gaps included', () => {
    const s = skylineMonths(
      [job({ deliveredAt: '2025-11-10', quantity: 2000 }), job({ deliveredAt: '2026-02-03', quantity: 500 }), job({ deliveredAt: '2026-02-20', quantity: 700 })],
      '2026-03-05',
    );
    expect(s.map((m) => m.month)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02', '2026-03']);
    expect(s[0]).toMatchObject({ words: 2000, jobs: 1 });
    expect(s[1]).toMatchObject({ words: 0, jobs: 0 });
    expect(s[3]).toMatchObject({ words: 1200, jobs: 2, income: 1200 });
  });

  it('puts the unfinished part of active jobs on the current month as scaffolding', () => {
    const s = skylineMonths([job({ deliveredAt: '2026-03-01' }), job({ status: 'active', quantity: 4000, progress: 25 })], '2026-03-05');
    expect(s[s.length - 1].pending).toBe(3000);
  });

  it('is empty for a brand-new log', () => {
    expect(skylineMonths([], '2026-03-05')).toEqual([]);
  });
});

describe('todayPlan', () => {
  // 2026-03-02 is a Monday
  const today = '2026-03-02';

  it('spreads remaining work evenly over the working days to the deadline', () => {
    const p = todayPlan([job({ status: 'active', quantity: 5000, progress: 0, dueAt: '2026-03-06' })], work, today, 500);
    expect(p.items[0].daysLeft).toBe(5);
    expect(p.items[0].target).toBe(1000);
    expect(p.items[0].hours).toBe(2);
    expect(p.items[0].state).toBe('ok');
  });

  it('keeps the day’s target fixed while progress is logged during the day', () => {
    const j = job({ status: 'active', quantity: 5000, progress: 10, dayStart: { date: today, progress: 0 }, dueAt: '2026-03-06' });
    const p = todayPlan([j], work, today, 500);
    expect(p.items[0].target).toBe(1000);
    expect(p.items[0].doneToday).toBe(500);
    expect(p.progress).toBeCloseTo(0.5);
  });

  it('asks for everything today when the job is due today or late', () => {
    const p = todayPlan(
      [job({ status: 'active', quantity: 800, progress: 50, dueAt: '2026-02-27' }), job({ status: 'active', quantity: 600, progress: 0, dueAt: `${today}T18:00` })],
      work,
      today,
      500,
    );
    expect(p.items.map((x) => x.state)).toEqual(['overdue', 'today']);
    expect(p.items[0].target).toBe(400);
    expect(p.items[1].target).toBe(600);
  });

  it('lets weekends rest unless a deadline falls before the next working day', () => {
    const saturday = '2026-03-07';
    const p = todayPlan(
      [job({ status: 'active', quantity: 3000, dueAt: '2026-03-13' }), job({ status: 'active', quantity: 1000, dueAt: '2026-03-08' })],
      work,
      saturday,
      500,
    );
    const byDue = Object.fromEntries(p.items.map((x) => [x.due, x]));
    expect(byDue['2026-03-13'].state).toBe('rest');
    expect(byDue['2026-03-13'].target).toBe(0);
    expect(byDue['2026-03-08'].state).toBe('tight');
    expect(byDue['2026-03-08'].target).toBe(500);
  });

  it('flags a day that needs more hours than the working day has', () => {
    const p = todayPlan([job({ status: 'active', quantity: 4000, dueAt: today })], work, today, 500);
    expect(p.hours).toBe(8);
    expect(p.hours).toBeGreaterThan(p.capacity);
  });
});

describe('skylineQuarters', () => {
  it('merges months into calendar quarters', () => {
    const m = (month: string, words: number, jobs = 1) => ({ month, words, jobs, income: words, pending: 0 });
    const q = skylineQuarters([m('2025-11', 100), m('2025-12', 50), m('2026-01', 10), m('2026-02', 20, 2), m('2026-03', 30), m('2026-04', 5)]);
    expect(q.map((x) => [x.month, x.words, x.jobs])).toEqual([
      ['2025-10', 150, 2],
      ['2026-01', 60, 4],
      ['2026-04', 5, 1],
    ]);
  });
});
