import { describe, expect, it } from 'vitest';
import { paceNeeded } from '../src/domain/progress';
import type { Job } from '../src/domain/types';

const WD = [1, 2, 3, 4, 5];
// 2026-09-28 is a Monday
const job = (over: Partial<Job> = {}) => ({ status: 'active', unit: 'word', quantity: 5000, progress: 0, dueAt: '2026-10-02', ...over }) as Job;

describe('paceNeeded', () => {
  it('splits remaining words over working days, today included', () => {
    const p = paceNeeded(job(), '2026-09-28', { workdays: WD })!;
    expect(p.daysLeft).toBe(5);
    expect(p.perDay).toBe(1000);
    expect(p.status).toBe('on-track');
  });
  it('puts everything on today when due today', () => {
    const p = paceNeeded(job({ dueAt: '2026-09-28T17:00', progress: 60 }), '2026-09-28', { workdays: WD })!;
    expect(p).toEqual({ perDay: 2000, daysLeft: 1, status: 'on-track' });
  });
  it('is behind once overdue', () => {
    const p = paceNeeded(job({ dueAt: '2026-09-25' }), '2026-09-28', { workdays: WD })!;
    expect(p.daysLeft).toBe(0);
    expect(p.status).toBe('behind');
    expect(p.perDay).toBe(5000);
  });
  it('skips weekends', () => {
    // Friday → next Tuesday: Fri, Mon, Tue
    const p = paceNeeded(job({ quantity: 3000, dueAt: '2026-10-06' }), '2026-10-02', { workdays: WD })!;
    expect(p.daysLeft).toBe(3);
    expect(p.perDay).toBe(1000);
  });
  it('is not applicable with nothing left, no words or no deadline', () => {
    expect(paceNeeded(job({ progress: 100 }), '2026-09-28', { workdays: WD })).toBeUndefined();
    expect(paceNeeded(job({ quantity: 0 }), '2026-09-28', { workdays: WD })).toBeUndefined();
    expect(paceNeeded(job({ dueAt: undefined }), '2026-09-28', { workdays: WD })).toBeUndefined();
    expect(paceNeeded(job({ status: 'delivered' }), '2026-09-28', { workdays: WD })).toBeUndefined();
  });
  it('classifies against the recent pace', () => {
    const at = (recentPerDay: number) => paceNeeded(job(), '2026-09-28', { workdays: WD, recentPerDay })!.status;
    expect(at(1500)).toBe('ahead');
    expect(at(1000)).toBe('on-track');
    expect(at(400)).toBe('behind');
  });
});
