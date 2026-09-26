// Progress by day. Each job keeps a short log of the days its progress moved,
// so 翻譯足跡 can put words on the day they were done instead of spreading a
// job's whole progress evenly from the day it came in. Progress without a
// date (work done before the job was entered, a jump to 100% on delivery,
// edits from an older app version) is still spread, but only inside its own
// window, so it never drifts onto later days.

import { addDays, toISODate } from './dates';
import type { DayMark, Job } from './types';

export const createdDay = (j: Pick<Job, 'createdAt'>) => toISODate(new Date(j.createdAt));

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * The log an active job had before logs existed, rebuilt from what the
 * job already stores. Pure, so every device derives the same thing.
 */
export const legacyDayLog = (j: Job): DayMark[] => {
  const p = j.progress ?? 0;
  const made = createdDay(j);
  if (!j.dayStart || j.dayStart.date <= made) return p > 0 ? [{ date: made, from: p, to: p }] : [];
  return [{ date: j.dayStart.date, from: j.dayStart.progress, to: p }];
};

/** The log to read for a job; undefined means the job predates logs and is not active. */
export const dayLogOf = (j: Job): DayMark[] | undefined => j.dayLog ?? (j.status === 'active' ? legacyDayLog(j) : undefined);

export interface LogOpts {
  /** Day the work was done (defaults to today). */
  date?: string;
  /** The work was done over since…date. */
  since?: string;
}

/**
 * The job's log after a save. Progress on a new job, or on a job that just
 * started, is work done before it was entered; later changes land on the
 * day they are logged.
 */
export const nextDayLog = (prev: Job | undefined, job: Job, today: string, opts: LogOpts = {}): DayMark[] | undefined => {
  const p = job.progress ?? 0;
  const starting = job.status === 'active' && (!prev || prev.status !== 'active');
  if (!prev || starting) {
    const kept = prev?.dayLog;
    if (kept?.length) return kept;
    return p > 0 && job.status === 'active' ? [{ date: today, from: p, to: p }] : undefined;
  }
  const before = prev.progress ?? 0;
  if (job.status !== 'active' || prev.status !== 'active' || before === p) return prev.dayLog ?? job.dayLog;
  const log = [...(prev.dayLog ?? legacyDayLog(prev))];
  const date = opts.date ?? today;
  const since = opts.since && opts.since < date ? opts.since : undefined;
  const last = log[log.length - 1];
  if (last && last.date === date && !last.since && !since && last.to === before) log[log.length - 1] = { ...last, to: round(p) };
  else log.push({ date, from: round(before), to: round(p), ...(since ? { since } : {}) });
  // keep the log short; old marks matter less than recent ones
  return log.length > 120 ? log.slice(-120) : log;
};

/** Day of the latest mark, or undefined if the job has none. */
export const lastMarkDate = (j: Job) => {
  const log = dayLogOf(j);
  return log?.length ? log[log.length - 1].date : undefined;
};

export interface Piece {
  /** Share of the job, in percent. */
  pct: number;
  from: string;
  to: string;
  /** True when the days are a guess (spread over a window). */
  estimate: boolean;
}

/**
 * Splits a job's done progress into dated pieces. `end` is today for an
 * active job and the income date for an earned one; `target` is how far the
 * job has got (its progress, or 100 once earned).
 */
export const progressPieces = (log: DayMark[], start: string, end: string, target: number, made: string): Piece[] => {
  const out: Piece[] = [];
  // lowering progress takes words back from the most recent pieces
  const take = (pct: number) => {
    let left = pct;
    while (left > 1e-9 && out.length) {
      const last = out[out.length - 1];
      const t = Math.min(last.pct, left);
      last.pct -= t;
      left -= t;
      if (last.pct <= 1e-9) out.pop();
    }
  };
  const add = (pct: number, from: string, to: string, estimate: boolean) => {
    if (pct > 0) out.push({ pct, from: from > to ? to : from, to, estimate: estimate && from < to });
    else if (pct < 0) take(-pct);
  };
  let level = 0;
  let windowFrom = start;
  for (const m of log) {
    if (m.date < made) continue;
    add(m.from - level, windowFrom, m.date, true);
    add(m.to - m.from, m.since ?? m.date, m.date, !!m.since);
    level = m.to;
    windowFrom = addDays(m.date, 1);
  }
  add(target - level, windowFrom > end ? end : windowFrom, end, true);
  return out;
};
