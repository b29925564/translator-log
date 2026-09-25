// The analytics engine: everything the dashboard, insights, client pages,
// quote helper and year-in-review need, computed from plain arrays.

import { addDays, dateOnly, diffDays, eachDay, monthKey, toISODate, weekday, workingDays, yearOf } from './dates';
import { jobGross, jobGrossBase, jobNetBase, jobWords } from './money';
import type { Client, Job, Session, WorkSettings } from './types';

// ---------- basics ----------

export const isLive = <T extends { deletedAt?: number }>(r: T) => !r.deletedAt;

export const EARNED: Job['status'][] = ['delivered', 'invoiced', 'paid'];
export const isEarned = (j: Job) => EARNED.includes(j.status);
export const isBooked = (j: Job) => j.status === 'active' || isEarned(j);

/** The day a job's income is recognised (accrual basis). */
export const incomeDate = (j: Job): string =>
  dateOnly(j.deliveredAt ?? j.paidAt ?? j.invoicedAt ?? j.dueAt ?? j.receivedAt ?? toISODate(new Date(j.createdAt)));

export const pairKey = (j: Pick<Job, 'sourceLang' | 'targetLang'>) => `${j.sourceLang}>${j.targetLang}`;

export const sessionMs = (s: Session, now = Date.now()) => Math.max(0, (s.end ?? now) - s.start);

export const hoursByJob = (sessions: Session[], now = Date.now()): Map<string, number> => {
  const m = new Map<string, number>();
  for (const s of sessions) {
    if (s.deletedAt) continue;
    m.set(s.jobId, (m.get(s.jobId) || 0) + sessionMs(s, now) / 3_600_000);
  }
  return m;
};

export const inRange = (d: string, from: string, to: string) => d >= from && d <= to;

export interface Totals {
  income: number;
  net: number;
  words: number;
  jobs: number;
  hours: number;
}

export const totals = (jobs: Job[], hours?: Map<string, number>): Totals => {
  const t: Totals = { income: 0, net: 0, words: 0, jobs: 0, hours: 0 };
  for (const j of jobs) {
    t.income += jobGrossBase(j);
    t.net += jobNetBase(j);
    t.words += jobWords(j);
    t.jobs += 1;
    t.hours += hours?.get(j.id) || 0;
  }
  return t;
};

export const earnedBetween = (jobs: Job[], from: string, to: string) =>
  jobs.filter((j) => isEarned(j) && inRange(incomeDate(j), from, to));

export const bookedBetween = (jobs: Job[], from: string, to: string) =>
  jobs.filter((j) => isBooked(j) && inRange(incomeDate(j), from, to));

// ---------- series ----------

export interface MonthPoint {
  month: string; // YYYY-MM
  earned: number;
  projected: number;
  words: number;
  jobs: number;
}

export const monthsBack = (today: string, n: number): string[] => {
  const out: string[] = [];
  const [y, m] = today.split('-').map(Number);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    out.push(toISODate(d).slice(0, 7));
  }
  return out;
};

export const monthsOfYear = (year: number) => Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);

export const monthlySeries = (jobs: Job[], months: string[]): MonthPoint[] => {
  const idx = new Map(months.map((m, i) => [m, i]));
  const pts: MonthPoint[] = months.map((month) => ({ month, earned: 0, projected: 0, words: 0, jobs: 0 }));
  for (const j of jobs) {
    if (!isBooked(j)) continue;
    const i = idx.get(monthKey(incomeDate(j)));
    if (i == null) continue;
    const v = jobGrossBase(j);
    if (isEarned(j)) {
      pts[i].earned += v;
      pts[i].words += jobWords(j);
      pts[i].jobs += 1;
    } else pts[i].projected += v;
  }
  return pts;
};

// ---------- grouping ----------

export interface Group {
  key: string;
  income: number;
  words: number;
  jobs: number;
  hours: number;
  /** base currency per word, over word-based jobs only */
  ratePerWord?: number;
  hourly?: number;
}

export const groupJobs = (jobs: Job[], keyFn: (j: Job) => string | undefined, hours?: Map<string, number>): Group[] => {
  const m = new Map<string, Group & { wIncome: number; wWords: number; hIncome: number }>();
  for (const j of jobs) {
    const key = keyFn(j) ?? '';
    let g = m.get(key);
    if (!g) {
      g = { key, income: 0, words: 0, jobs: 0, hours: 0, wIncome: 0, wWords: 0, hIncome: 0 };
      m.set(key, g);
    }
    const inc = jobGrossBase(j);
    const w = jobWords(j);
    const h = hours?.get(j.id) || 0;
    g.income += inc;
    g.words += w;
    g.jobs += 1;
    g.hours += h;
    if (w > 0 && (j.unit === 'word' || j.unit === 'char')) {
      g.wIncome += inc;
      g.wWords += w;
    }
    if (h > 0) g.hIncome += inc;
  }
  return [...m.values()]
    .map(({ wIncome, wWords, hIncome, ...g }) => ({
      ...g,
      ratePerWord: wWords ? wIncome / wWords : undefined,
      hourly: g.hours > 0.25 ? hIncome / g.hours : undefined,
    }))
    .sort((a, b) => b.income - a.income);
};

/** Top n groups plus an “other” bucket so charts never need a 9th colour. */
export const topWithOther = (groups: Group[], n: number, otherKey = '__other'): Group[] => {
  if (groups.length <= n) return groups;
  const head = groups.slice(0, n - 1);
  const tail = groups.slice(n - 1);
  const other: Group = { key: otherKey, income: 0, words: 0, jobs: 0, hours: 0 };
  for (const g of tail) {
    other.income += g.income;
    other.words += g.words;
    other.jobs += g.jobs;
    other.hours += g.hours;
  }
  return [...head, other];
};

// ---------- rates ----------

export const quantile = (sorted: number[], q: number) => {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

export interface RateBenchmark {
  n: number;
  p25: number;
  median: number;
  p75: number;
  /** Share of comparable past jobs paid less than the candidate (0–1). */
  percentile?: number;
  scope: 'pair+domain' | 'pair' | 'all';
}

/** Compares a per-word rate (base currency) with your own history. */
export const rateBenchmark = (
  jobs: Job[],
  candidate: { ratePerWordBase?: number; sourceLang?: string; targetLang?: string; domain?: string; unit?: Job['unit'] },
): RateBenchmark | undefined => {
  const wordJobs = jobs.filter((j) => isBooked(j) && (j.unit === 'word' || j.unit === 'char') && jobWords(j) > 0);
  const unitMatch = (j: Job) => !candidate.unit || j.unit === candidate.unit;
  const pairMatch = (j: Job) => j.sourceLang === candidate.sourceLang && j.targetLang === candidate.targetLang;
  const tiers: [RateBenchmark['scope'], Job[]][] = [
    ['pair+domain', wordJobs.filter((j) => unitMatch(j) && pairMatch(j) && !!candidate.domain && j.domain === candidate.domain)],
    ['pair', wordJobs.filter((j) => unitMatch(j) && pairMatch(j))],
    ['all', wordJobs.filter(unitMatch)],
  ];
  const tier = tiers.find(([, list]) => list.length >= 5) ?? tiers.find(([, list]) => list.length > 0);
  if (!tier) return undefined;
  const rates = tier[1].map((j) => jobGrossBase(j) / jobWords(j)).sort((a, b) => a - b);
  const bench: RateBenchmark = {
    n: rates.length,
    p25: quantile(rates, 0.25),
    median: quantile(rates, 0.5),
    p75: quantile(rates, 0.75),
    scope: tier[0],
  };
  if (candidate.ratePerWordBase != null) {
    const below = rates.filter((r) => r < candidate.ratePerWordBase! - 1e-9).length;
    const equal = rates.filter((r) => Math.abs(r - candidate.ratePerWordBase!) <= 1e-9).length;
    bench.percentile = (below + equal / 2) / rates.length;
  }
  return bench;
};

// ---------- speed & workload ----------

/** Characters of CJK text per equivalent English word, for effort estimates. */
export const CHARS_PER_WORD = 1.6;

/** Effort-normalised size of a job in word-equivalents. */
export const workWords = (j: Job) => (j.unit === 'char' ? jobWords(j) / CHARS_PER_WORD : jobWords(j));

/** Words per hour measured from timer sessions (translation-like services only). */
export const measuredSpeed = (jobs: Job[], hours: Map<string, number>): { wph: number; n: number } | undefined => {
  let w = 0;
  let h = 0;
  let n = 0;
  for (const j of jobs) {
    const hh = hours.get(j.id) || 0;
    const ww = workWords(j);
    if (hh >= 0.5 && ww > 0 && ['translation', 'mtpe', 'review', 'transcreation'].includes(j.service) && isEarned(j)) {
      w += ww;
      h += hh;
      n++;
    }
  }
  if (n < 3 || h <= 0) return undefined;
  return { wph: w / h, n };
};

export interface LoadDay {
  date: string;
  capacity: number; // hours
  hours: number;
  jobs: { id: string; hours: number }[];
}

const jobHoursNeeded = (j: Job, wph: number) => {
  if (j.unit === 'hour') return j.quantity || 0;
  if (j.unit === 'minute') return ((j.quantity || 0) * 6) / 60; // ~6 min of work per media minute
  const words = workWords(j) || (j.unit === 'page' ? (j.quantity || 0) * 250 : 0);
  const remaining = words * (1 - (j.progress || 0) / 100);
  const factor = j.service === 'review' || j.service === 'proofreading' ? 0.35 : j.service === 'mtpe' ? 0.6 : 1;
  return (remaining * factor) / Math.max(50, wph);
};

/** Spreads the remaining work of active jobs over working days before each deadline. */
export const workload = (
  jobs: Job[],
  work: WorkSettings,
  today: string,
  days: number,
  wph: number,
  extra?: Job,
): LoadDay[] => {
  const end = addDays(today, days - 1);
  const out: LoadDay[] = eachDay(today, end).map((date) => ({
    date,
    capacity: work.workDays.includes(weekday(date)) ? work.hoursPerDay : 0,
    hours: 0,
    jobs: [],
  }));
  const index = new Map(out.map((d, i) => [d.date, i]));
  const list = jobs.filter((j) => j.status === 'active' && !j.deletedAt);
  if (extra) list.push(extra);
  for (const j of list) {
    const need = jobHoursNeeded(j, wph);
    if (need <= 0) continue;
    const due = dateOnly(j.dueAt ?? addDays(today, 7));
    const last = due < today ? today : due;
    let spread = workingDays(today, last, work.workDays);
    if (!spread.length) spread = [last < today ? today : last];
    if (j.unit === 'hour') spread = [last]; // interpreting happens on the day
    const per = need / spread.length;
    for (const d of spread) {
      const i = index.get(d);
      if (i == null) continue;
      out[i].hours += per;
      out[i].jobs.push({ id: j.id, hours: per });
    }
  }
  return out;
};

/** Earliest date a job needing `hours` could be finished using spare capacity. */
export const earliestFinish = (load: LoadDay[], hours: number): string | undefined => {
  let left = hours;
  for (const d of load) {
    const free = Math.max(0, d.capacity - d.hours);
    left -= free;
    if (left <= 1e-6) return d.date;
  }
  return undefined;
};

export const estimateHours = (j: Job, wph: number) => jobHoursNeeded({ ...j, progress: 0 }, wph);

// ---------- receivables ----------

export type AgingBucket = 'current' | 'd30' | 'd60' | 'd90';

export interface Receivable {
  job: Job;
  amountBase: number;
  amount: number;
  due: string;
  daysOverdue: number;
  bucket: AgingBucket;
}

export const paymentDue = (j: Job, client?: Client): string => {
  if (j.paymentDueAt) return j.paymentDueAt;
  const from = dateOnly(j.invoicedAt ?? j.deliveredAt ?? j.dueAt ?? toISODate(new Date(j.updatedAt)));
  return addDays(from, client?.paymentTermsDays ?? 30);
};

export const receivables = (jobs: Job[], clients: Client[], today: string): Receivable[] => {
  const cmap = new Map(clients.map((c) => [c.id, c]));
  return jobs
    .filter((j) => j.status === 'delivered' || j.status === 'invoiced')
    .map((job) => {
      const due = paymentDue(job, job.clientId ? cmap.get(job.clientId) : undefined);
      const daysOverdue = diffDays(due, today);
      const bucket: AgingBucket = daysOverdue <= 0 ? 'current' : daysOverdue <= 30 ? 'd30' : daysOverdue <= 60 ? 'd60' : 'd90';
      return { job, amount: jobGross(job), amountBase: jobGrossBase(job), due, daysOverdue, bucket };
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
};

// ---------- clients ----------

export interface ClientStats {
  income: number;
  words: number;
  jobs: number;
  hours: number;
  ratePerWord?: number;
  hourly?: number;
  avgDaysToPay?: number;
  onTimeShare?: number;
  firstAt?: string;
  lastAt?: string;
  share: number; // of total income
  score: number;
  grade: 'A' | 'B' | 'C' | 'D';
  scoreParts: { pay: number; rate: number; volume: number; recency: number };
}

export const clientStats = (
  client: Client,
  allJobs: Job[],
  hours: Map<string, number>,
  today: string,
  overallMedianRate?: number,
): ClientStats => {
  const jobs = allJobs.filter((j) => j.clientId === client.id && isBooked(j));
  const g = groupJobs(jobs, () => 'x', hours)[0];
  const totalIncome = allJobs.filter(isBooked).reduce((s, j) => s + jobGrossBase(j), 0) || 1;
  const paid = jobs.filter((j) => j.status === 'paid' && j.paidAt && (j.invoicedAt || j.deliveredAt));
  const pays = paid.map((j) => diffDays(dateOnly(j.invoicedAt ?? j.deliveredAt!), j.paidAt!));
  const onTime = paid.filter((j) => j.paidAt! <= paymentDue(j, client)).length;
  const dates = jobs.map(incomeDate).sort();
  const avgDaysToPay = pays.length ? pays.reduce((a, b) => a + b, 0) / pays.length : undefined;
  const terms = client.paymentTermsDays ?? 30;

  const pay = avgDaysToPay == null ? 25 : Math.max(0, Math.min(40, 40 - Math.max(0, avgDaysToPay - terms) * 1.2));
  const rate =
    g?.ratePerWord && overallMedianRate
      ? Math.max(0, Math.min(30, 15 + ((g.ratePerWord - overallMedianRate) / overallMedianRate) * 60))
      : 18;
  const share = (g?.income || 0) / totalIncome;
  const volume = Math.min(20, Math.log10(1 + share * 100) * 10);
  const lastAt = dates[dates.length - 1];
  const recency = lastAt && diffDays(lastAt, today) <= 180 ? 10 : lastAt && diffDays(lastAt, today) <= 365 ? 5 : 0;
  const score = Math.round(pay + rate + volume + recency);
  return {
    income: g?.income || 0,
    words: g?.words || 0,
    jobs: g?.jobs || 0,
    hours: g?.hours || 0,
    ratePerWord: g?.ratePerWord,
    hourly: g?.hourly,
    avgDaysToPay,
    onTimeShare: paid.length ? onTime / paid.length : undefined,
    firstAt: dates[0],
    lastAt,
    share,
    score,
    grade: score >= 75 ? 'A' : score >= 58 ? 'B' : score >= 40 ? 'C' : 'D',
    scoreParts: { pay: Math.round(pay), rate: Math.round(rate), volume: Math.round(volume), recency },
  };
};

// ---------- daily output, streaks ----------

/**
 * Words per day. Timer sessions decide where the words land when present;
 * otherwise a job's words are spread over the working days it was open.
 */
export const dailyWords = (jobs: Job[], sessions: Session[], today: string, workDays: number[] = [1, 2, 3, 4, 5]): Map<string, number> => {
  const byJob = new Map<string, Session[]>();
  for (const s of sessions) {
    if (s.deletedAt) continue;
    const arr = byJob.get(s.jobId) ?? [];
    arr.push(s);
    byJob.set(s.jobId, arr);
  }
  const out = new Map<string, number>();
  const add = (d: string, v: number) => out.set(d, (out.get(d) || 0) + v);
  for (const j of jobs) {
    if (!(isEarned(j) || j.status === 'active')) continue;
    const words = jobWords(j) * (j.status === 'active' ? (j.progress || 0) / 100 : 1);
    if (words <= 0) continue;
    const ss = byJob.get(j.id);
    if (ss?.length) {
      const total = ss.reduce((a, s) => a + sessionMs(s), 0);
      if (total > 0) {
        for (const s of ss) add(toISODate(new Date(s.start)), (words * sessionMs(s)) / total);
        continue;
      }
    }
    const end = j.status === 'active' ? today : incomeDate(j);
    let start = dateOnly(j.receivedAt ?? addDays(end, -Math.max(1, Math.ceil(jobWords(j) / 3000))));
    if (start > end) start = end;
    if (diffDays(start, end) > 60) start = addDays(end, -60);
    let span = workingDays(start, end, workDays);
    if (!span.length) span = [end];
    for (const d of span) add(d, words / span.length);
  }
  return out;
};

export const streaks = (daily: Map<string, number>, today: string, workDays: number[]) => {
  const days = [...daily.keys()].filter((d) => (daily.get(d) || 0) > 0).sort();
  if (!days.length) return { current: 0, longest: 0 };
  const set = new Set(days);
  // a streak counts consecutive working days; weekends never break it
  let longest = 0;
  let run = 0;
  let cur = days[0];
  const last = days[days.length - 1] > today ? days[days.length - 1] : today;
  while (cur <= last) {
    const isWork = workDays.includes(weekday(cur));
    if (set.has(cur)) run++;
    else if (isWork && cur < today) run = 0;
    longest = Math.max(longest, run);
    cur = addDays(cur, 1);
  }
  let current = 0;
  let d = today;
  let guard = 0;
  while (guard++ < 2000) {
    if (set.has(d)) current++;
    else if (workDays.includes(weekday(d)) && d !== today) break;
    d = addDays(d, -1);
  }
  return { current, longest };
};

// ---------- milestones ----------

export interface Milestone {
  id: string;
  kind: 'words' | 'jobs' | 'clients' | 'domains' | 'pairs' | 'income' | 'bigjob';
  target: number;
  achievedAt?: string;
  progress: number; // 0–1
}

const WORD_STEPS = [10_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 2_000_000, 3_000_000, 5_000_000, 10_000_000];
const JOB_STEPS = [1, 10, 50, 100, 250, 500, 1000];
const CLIENT_STEPS = [3, 5, 10, 25, 50];
const DOMAIN_STEPS = [3, 5, 8];
const PAIR_STEPS = [2, 3, 5];
const INCOME_STEPS_TWD = [100_000, 500_000, 1_000_000, 3_000_000, 5_000_000, 10_000_000];
const BIGJOB_STEPS = [10_000, 50_000, 100_000];

export const milestones = (jobs: Job[], twdPerBase = 1): Milestone[] => {
  const done = jobs.filter(isEarned).sort((a, b) => incomeDate(a).localeCompare(incomeDate(b)));
  const out: Milestone[] = [];
  const track = (kind: Milestone['kind'], steps: number[], valueAt: (i: number) => number) => {
    const final = done.length ? valueAt(done.length - 1) : 0;
    for (const target of steps) {
      let achievedAt: string | undefined;
      for (let i = 0; i < done.length; i++) {
        if (valueAt(i) >= target) {
          achievedAt = incomeDate(done[i]);
          break;
        }
      }
      out.push({ id: `${kind}-${target}`, kind, target, achievedAt, progress: Math.min(1, final / target) });
    }
  };
  let words = 0;
  let income = 0;
  let big = 0;
  const cum = done.map((j) => {
    words += jobWords(j);
    income += jobGrossBase(j) * twdPerBase;
    big = Math.max(big, jobWords(j));
    return { words, income, big };
  });
  const clientsAt: number[] = [];
  const domainsAt: number[] = [];
  const pairsAt: number[] = [];
  const cs = new Set<string>();
  const ds = new Set<string>();
  const ps = new Set<string>();
  done.forEach((j) => {
    if (j.clientId) cs.add(j.clientId);
    if (j.domain) ds.add(j.domain);
    ps.add(pairKey(j));
    clientsAt.push(cs.size);
    domainsAt.push(ds.size);
    pairsAt.push(ps.size);
  });
  track('words', WORD_STEPS, (i) => cum[i].words);
  track('jobs', JOB_STEPS, (i) => i + 1);
  track('income', INCOME_STEPS_TWD, (i) => cum[i].income);
  track('clients', CLIENT_STEPS, (i) => clientsAt[i]);
  track('domains', DOMAIN_STEPS, (i) => domainsAt[i]);
  track('pairs', PAIR_STEPS, (i) => pairsAt[i]);
  track('bigjob', BIGJOB_STEPS, (i) => cum[i].big);
  return out;
};

// ---------- year in review ----------

export type Persona =
  | 'medical' | 'legal' | 'patent' | 'games' | 'media' | 'literary' | 'marketing' | 'tech' | 'finance' | 'academic' | 'default';

export const personaFor = (domain?: string): Persona => {
  switch (domain) {
    case 'medical':
    case 'pharma':
      return 'medical';
    case 'legal':
      return 'legal';
    case 'patent':
      return 'patent';
    case 'games':
      return 'games';
    case 'media':
      return 'media';
    case 'literary':
      return 'literary';
    case 'marketing':
    case 'fashion':
    case 'ecommerce':
    case 'tourism':
      return 'marketing';
    case 'tech':
    case 'software':
    case 'engineering':
      return 'tech';
    case 'finance':
      return 'finance';
    case 'academic':
      return 'academic';
    default:
      return 'default';
  }
};

export interface YearReview {
  year: number;
  inProgress: boolean;
  totals: Totals;
  prevIncome: number;
  prevWords: number;
  clients: number;
  newClients: number;
  topClient?: { id: string; income: number; jobs: number };
  topDomain?: { key: string; words: number; share: number };
  domains: Group[];
  pairs: Group[];
  busiestMonth?: { month: string; words: number };
  biggestJob?: Job;
  fastestJob?: { job: Job; wordsPerDay: number };
  hourly?: number;
  ratePerWord?: number;
  prevRatePerWord?: number;
  activeDays: number;
  longestStreak: number;
  daily: Map<string, number>;
  months: MonthPoint[];
  persona: Persona;
  trait?: 'nightOwl' | 'earlyBird' | 'marathoner' | 'sprinter' | 'explorer';
  novels: number;
  a4Pages: number;
  stackCm: number;
}

export const yearReview = (jobs: Job[], sessions: Session[], year: number, today: string, workDays: number[]): YearReview => {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const hours = hoursByJob(sessions);
  const cur = earnedBetween(jobs, from, to);
  // a year still in progress is compared with the same stretch of last year
  const inProgress = yearOf(today) === year;
  const prevTo = inProgress ? `${year - 1}${today.slice(4)}` : `${year - 1}-12-31`;
  const prev = earnedBetween(jobs, `${year - 1}-01-01`, prevTo);
  const t = totals(cur, hours);
  const pt = totals(prev, hours);

  const byClient = groupJobs(cur.filter((j) => j.clientId), (j) => j.clientId, hours);
  const firstYearOf = new Map<string, number>();
  for (const j of jobs.filter(isEarned)) {
    if (!j.clientId) continue;
    const y = yearOf(incomeDate(j));
    firstYearOf.set(j.clientId, Math.min(firstYearOf.get(j.clientId) ?? 9999, y));
  }
  const newClients = byClient.filter((g) => firstYearOf.get(g.key) === year).length;

  const domains = groupJobs(cur, (j) => j.domain ?? 'general', hours).sort((a, b) => b.words - a.words);
  const pairs = groupJobs(cur, pairKey, hours);
  const months = monthlySeries(cur, monthsOfYear(year));
  const busiest = [...months].sort((a, b) => b.words - a.words)[0];
  const biggestJob = [...cur].sort((a, b) => jobWords(b) - jobWords(a))[0];
  const fastest = cur
    .filter((j) => j.receivedAt && j.deliveredAt && jobWords(j) >= 1000)
    .map((j) => ({ job: j, wordsPerDay: jobWords(j) / Math.max(1, diffDays(j.receivedAt!, j.deliveredAt!) + 1) }))
    .sort((a, b) => b.wordsPerDay - a.wordsPerDay)[0];

  const wordBased = (list: Job[]) => {
    const wj = list.filter((j) => (j.unit === 'word' || j.unit === 'char') && jobWords(j) > 0);
    const w = wj.reduce((s, j) => s + jobWords(j), 0);
    return w ? wj.reduce((s, j) => s + jobGrossBase(j), 0) / w : undefined;
  };

  const allDaily = dailyWords(jobs, sessions, today, workDays);
  const daily = new Map([...allDaily].filter(([d]) => d >= from && d <= to));
  const st = streaks(daily, to < today ? to : today, workDays);

  // working-hour habits from timer sessions
  let night = 0;
  let early = 0;
  let totalMin = 0;
  for (const s of sessions) {
    if (s.deletedAt || !s.end) continue;
    const d = new Date(s.start);
    if (d.getFullYear() !== year) continue;
    const min = (s.end - s.start) / 60000;
    totalMin += min;
    const h = d.getHours();
    if (h >= 22 || h < 4) night += min;
    if (h >= 4 && h < 8) early += min;
  }
  let trait: YearReview['trait'];
  if (totalMin > 600 && night / totalMin > 0.25) trait = 'nightOwl';
  else if (totalMin > 600 && early / totalMin > 0.2) trait = 'earlyBird';
  else if (biggestJob && jobWords(biggestJob) >= 50_000) trait = 'marathoner';
  else if (domains.length >= 5) trait = 'explorer';
  else if (fastest && fastest.wordsPerDay >= 4000) trait = 'sprinter';

  const topDomain = domains[0] && t.words ? { key: domains[0].key, words: domains[0].words, share: domains[0].words / t.words } : undefined;
  const hourlyJobs = cur.filter((j) => (hours.get(j.id) || 0) > 0.25);
  const hSum = hourlyJobs.reduce((s, j) => s + (hours.get(j.id) || 0), 0);

  return {
    year,
    inProgress,
    totals: t,
    prevIncome: pt.income,
    prevWords: pt.words,
    clients: byClient.length,
    newClients,
    topClient: byClient[0] ? { id: byClient[0].key, income: byClient[0].income, jobs: byClient[0].jobs } : undefined,
    topDomain,
    domains,
    pairs,
    busiestMonth: busiest && busiest.words > 0 ? { month: busiest.month, words: busiest.words } : undefined,
    biggestJob,
    fastestJob: fastest,
    hourly: hSum > 1 ? hourlyJobs.reduce((s, j) => s + jobGrossBase(j), 0) / hSum : undefined,
    ratePerWord: wordBased(cur),
    prevRatePerWord: wordBased(prev),
    activeDays: [...daily.values()].filter((v) => v > 0).length,
    longestStreak: st.longest,
    daily,
    months,
    persona: personaFor(topDomain?.key),
    trait,
    novels: t.words / 100_000,
    a4Pages: t.words / 500,
    stackCm: (t.words / 500) * 0.01,
  };
};

// ---------- insights ----------

export interface Insight {
  kind:
    | 'rateUp'
    | 'rateDown'
    | 'concentration'
    | 'slowPayer'
    | 'overdue'
    | 'crunch'
    | 'bestHourly'
    | 'goalPace'
    | 'streak';
  tone: 'good' | 'warn' | 'info';
  params: Record<string, string | number>;
}

export const insights = (args: {
  jobs: Job[];
  clients: Client[];
  sessions: Session[];
  today: string;
  work: WorkSettings;
  yearGoal?: number;
}): Insight[] => {
  const { jobs, clients, sessions, today, work } = args;
  const out: Insight[] = [];
  const hours = hoursByJob(sessions);
  const year = yearOf(today);
  const ytd = earnedBetween(jobs, `${year}-01-01`, today);
  const last12 = earnedBetween(jobs, addDays(today, -365), today);
  const prev12 = earnedBetween(jobs, addDays(today, -730), addDays(today, -366));

  // rate trend (per word, base currency)
  const rpw = (list: Job[]) => groupJobs(list, () => 'x')[0]?.ratePerWord;
  const r1 = rpw(last12);
  const r0 = rpw(prev12);
  if (r1 && r0) {
    const ch = (r1 - r0) / r0;
    if (ch >= 0.03) out.push({ kind: 'rateUp', tone: 'good', params: { pct: ch } });
    else if (ch <= -0.03) out.push({ kind: 'rateDown', tone: 'warn', params: { pct: -ch } });
  }

  // client concentration
  const byClient = groupJobs(last12.filter((j) => j.clientId), (j) => j.clientId);
  const total = byClient.reduce((s, g) => s + g.income, 0);
  if (total > 0 && byClient[0] && byClient[0].income / total >= 0.45 && byClient.length >= 2) {
    out.push({ kind: 'concentration', tone: 'warn', params: { clientId: byClient[0].key, share: byClient[0].income / total } });
  }

  // overdue receivables
  const rec = receivables(jobs, clients, today).filter((r) => r.daysOverdue > 0);
  if (rec.length) {
    out.push({ kind: 'overdue', tone: 'warn', params: { count: rec.length, amount: rec.reduce((s, r) => s + r.amountBase, 0) } });
  }

  // slow payer
  const median = (() => {
    const rates = jobs
      .filter((j) => isBooked(j) && (j.unit === 'word' || j.unit === 'char') && jobWords(j) > 0)
      .map((j) => jobGrossBase(j) / jobWords(j))
      .sort((a, b) => a - b);
    return rates.length ? quantile(rates, 0.5) : undefined;
  })();
  const slow = clients
    .filter((c) => !c.deletedAt)
    .map((c) => ({ c, s: clientStats(c, jobs, hours, today, median) }))
    .filter(({ c, s }) => s.avgDaysToPay != null && s.avgDaysToPay > (c.paymentTermsDays ?? 30) + 10 && s.jobs >= 2)
    .sort((a, b) => b.s.avgDaysToPay! - a.s.avgDaysToPay!)[0];
  if (slow) out.push({ kind: 'slowPayer', tone: 'warn', params: { clientId: slow.c.id, days: Math.round(slow.s.avgDaysToPay!) } });

  // deadline crunch in the next 7 days
  const speed = measuredSpeed(jobs, hours)?.wph ?? work.wordsPerHour;
  const load = workload(jobs, work, today, 7, speed);
  const over = load.filter((d) => d.capacity > 0 && d.hours > d.capacity * 1.1);
  if (over.length) out.push({ kind: 'crunch', tone: 'warn', params: { date: over[0].date, hours: Math.round(over[0].hours * 10) / 10 } });

  // best effective hourly client
  const hourly = groupJobs(last12.filter((j) => j.clientId && (hours.get(j.id) || 0) > 0), (j) => j.clientId, hours)
    .filter((g) => g.hourly && g.hours >= 3)
    .sort((a, b) => (b.hourly || 0) - (a.hourly || 0));
  if (hourly.length >= 2) out.push({ kind: 'bestHourly', tone: 'good', params: { clientId: hourly[0].key, hourly: hourly[0].hourly! } });

  // goal pace
  if (args.yearGoal) {
    const earned = ytd.reduce((s, j) => s + jobGrossBase(j), 0);
    const dayOfYear = diffDays(`${year}-01-01`, today) + 1;
    const projected = (earned / dayOfYear) * 365;
    out.push({ kind: 'goalPace', tone: projected >= args.yearGoal ? 'good' : 'info', params: { projected, goal: args.yearGoal, pct: projected / args.yearGoal } });
  }

  // current streak
  const st = streaks(dailyWords(jobs, sessions, today, work.workDays), today, work.workDays);
  if (st.current >= 5) out.push({ kind: 'streak', tone: 'good', params: { days: st.current } });

  return out;
};

// ---------- career skyline ----------

export interface SkylineMonth {
  month: string; // YYYY-MM
  words: number;
  jobs: number;
  income: number;
  /** Words of active jobs, drawn as scaffolding on the current month. */
  pending: number;
  /** Months merged into this tower (3 for a quarter). */
  span?: number;
}

/** Merges months into calendar quarters for narrow screens; `month` stays the quarter's first month. */
export const skylineQuarters = (months: SkylineMonth[]): SkylineMonth[] => {
  const out: SkylineMonth[] = [];
  for (const m of months) {
    const [y, mm] = m.month.split('-').map(Number);
    const key = `${y}-${String(Math.floor((mm - 1) / 3) * 3 + 1).padStart(2, '0')}`;
    const last = out[out.length - 1];
    if (last && last.month === key) {
      last.words += m.words;
      last.jobs += m.jobs;
      last.income += m.income;
      last.pending += m.pending;
    } else out.push({ ...m, month: key, span: 3 });
  }
  return out;
};

/** One entry per calendar month from the first earned job to `today`, gaps included. */
export const skylineMonths = (jobs: Job[], today: string): SkylineMonth[] => {
  const earned = jobs.filter((j) => isEarned(j) && !j.deletedAt);
  const current = monthKey(today);
  if (!earned.length) {
    const pending = jobs.filter((j) => j.status === 'active' && !j.deletedAt).reduce((s, j) => s + jobWords(j), 0);
    return pending > 0 ? [{ month: current, words: 0, jobs: 0, income: 0, pending }] : [];
  }
  const first = earned.reduce((m, j) => (monthKey(incomeDate(j)) < m ? monthKey(incomeDate(j)) : m), current);
  const out: SkylineMonth[] = [];
  const idx = new Map<string, number>();
  let [y, m] = first.split('-').map(Number);
  // cap at 20 years so a stray date can't explode the chart
  for (let guard = 0; guard < 240; guard++) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    idx.set(key, out.length);
    out.push({ month: key, words: 0, jobs: 0, income: 0, pending: 0 });
    if (key >= current) break;
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  for (const j of earned) {
    const i = idx.get(monthKey(incomeDate(j)));
    if (i == null) continue;
    out[i].words += jobWords(j);
    out[i].jobs += 1;
    out[i].income += jobGrossBase(j);
  }
  const last = out[out.length - 1];
  for (const j of jobs) if (j.status === 'active' && !j.deletedAt) last.pending += jobWords(j) * (1 - (j.progress || 0) / 100);
  return out;
};

// ---------- today plan ----------

export type PlanState = 'overdue' | 'today' | 'tight' | 'ok' | 'rest' | 'event';

export interface PlanItem {
  job: Job;
  /** What the amounts below are counted in. */
  unit: 'word' | 'char' | 'minute';
  total: number;
  /** Left at the start of today. */
  remaining: number;
  /** Suggested for today to stay on schedule. */
  target: number;
  doneToday: number;
  hours: number;
  /** Working days left including today, when today is one. */
  daysLeft: number;
  due?: string;
  state: PlanState;
}

export interface TodayPlan {
  items: PlanItem[];
  hours: number;
  capacity: number;
  /** Share of today's targets already done, 0–1. */
  progress: number;
  isWorkDay: boolean;
}

const planHours = (j: Job, amount: number, unit: PlanItem['unit'], wph: number) => {
  if (unit === 'minute') return (amount * 6) / 60;
  const w = unit === 'char' ? amount / CHARS_PER_WORD : amount;
  const factor = j.service === 'review' || j.service === 'proofreading' ? 0.35 : j.service === 'mtpe' ? 0.6 : 1;
  return (w * factor) / Math.max(50, wph);
};

/** Splits each active job's remaining work evenly over the working days before its deadline. */
export const todayPlan = (jobs: Job[], work: WorkSettings, today: string, wph: number): TodayPlan => {
  const isWorkDay = work.workDays.includes(weekday(today));
  const items: PlanItem[] = [];
  for (const j of jobs) {
    if (j.status !== 'active' || j.deletedAt) continue;
    const due = j.dueAt ? dateOnly(j.dueAt) : undefined;
    if (j.unit === 'hour') {
      items.push({ job: j, unit: 'minute', total: 0, remaining: 0, target: 0, doneToday: 0, hours: due === today ? j.quantity || 0 : 0, daysLeft: 0, due, state: 'event' });
      continue;
    }
    const unit: PlanItem['unit'] = j.unit === 'minute' ? 'minute' : j.unit === 'char' ? 'char' : 'word';
    const total = j.unit === 'minute' ? j.quantity || 0 : jobWords(j) || (j.unit === 'page' ? (j.quantity || 0) * 250 : 0);
    const now = j.progress || 0;
    const base = j.dayStart?.date === today ? j.dayStart.progress : now;
    const remaining = Math.max(0, total * (1 - base / 100));
    const doneToday = Math.max(0, (total * (now - base)) / 100);
    const end = due ?? addDays(today, 7);
    const days = end < today ? [] : workingDays(today, end, work.workDays);
    let state: PlanState;
    let target: number;
    if (end < today) {
      state = 'overdue';
      target = remaining;
    } else if (end === today) {
      state = 'today';
      target = remaining;
    } else if (!days.length) {
      // no working day before the deadline: it has to happen anyway
      state = 'tight';
      target = remaining / (diffDays(today, end) + 1);
    } else if (!isWorkDay) {
      state = 'rest';
      target = 0;
    } else {
      state = 'ok';
      target = remaining / days.length;
    }
    items.push({ job: j, unit, total, remaining, target, doneToday, hours: planHours(j, target, unit, wph), daysLeft: days.length, due, state });
  }
  const rank: Record<PlanState, number> = { overdue: 0, today: 1, event: 2, tight: 3, ok: 4, rest: 5 };
  items.sort((a, b) => rank[a.state] - rank[b.state] || (a.job.dueAt ?? '9999').localeCompare(b.job.dueAt ?? '9999'));
  const hours = items.reduce((s, x) => s + x.hours, 0);
  const capacity = isWorkDay ? work.hoursPerDay : 0;
  if (hours > work.hoursPerDay) for (const x of items) if (x.state === 'ok') x.state = 'tight';
  const want = items.reduce((s, x) => s + planHours(x.job, x.target, x.unit, wph), 0);
  const got = items.reduce((s, x) => s + planHours(x.job, Math.min(x.doneToday, x.target || x.doneToday), x.unit, wph), 0);
  return { items, hours, capacity, progress: want > 0 ? Math.min(1, got / want) : items.length && items.every((x) => x.target === 0) ? 1 : 0, isWorkDay };
};
