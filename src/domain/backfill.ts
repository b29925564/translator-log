// Time added after the fact. Exact times make one entry; a range of days
// with a total number of hours is split evenly over the days, with the
// times marked as a guess.

import { eachDay } from './dates';
import type { Session } from './types';

export type Backfill =
  | { kind: 'times'; date: string; start: string; end: string }
  | { kind: 'range'; from: string; to: string; hours: number };

const DAY_START = '09:00';

export const backfillSessions = (b: Backfill, base: Omit<Session, 'start' | 'end' | 'id'>, id: () => string): Session[] => {
  if (b.kind === 'times') {
    const start = new Date(`${b.date}T${b.start}:00`).getTime();
    let end = new Date(`${b.date}T${b.end}:00`).getTime();
    if (Number.isNaN(start) || Number.isNaN(end)) return [];
    if (end <= start) end += 86_400_000;
    return [{ ...base, id: id(), start, end }];
  }
  const [from, to] = b.from <= b.to ? [b.from, b.to] : [b.to, b.from];
  const days = eachDay(from, to);
  if (!days.length || !(b.hours > 0)) return [];
  const each = Math.round((b.hours * 3_600_000) / days.length);
  return days.map((d) => {
    const start = new Date(`${d}T${DAY_START}:00`).getTime();
    return { ...base, id: id(), start, end: start + each, approx: true };
  });
};

/** Percent of the job a logged amount stands for. */
export const donePercent = (amount: number, kind: 'pct' | 'words', jobWords: number) => {
  if (!(amount > 0)) return 0;
  if (kind === 'pct') return amount;
  return jobWords > 0 ? (amount / jobWords) * 100 : 0;
};
