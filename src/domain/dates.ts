// Calendar helpers working on local-time ISO dates (YYYY-MM-DD).

const pad = (n: number) => String(n).padStart(2, '0');

export const toISODate = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const todayISO = (): string => toISODate(new Date());

/** Parses YYYY-MM-DD (optionally with THH:mm) as a local date. */
export const parseISO = (s: string): Date => {
  const [datePart, timePart] = s.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  if (timePart) {
    const [hh, mm] = timePart.split(':').map(Number);
    return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0);
  }
  return new Date(y, (m || 1) - 1, d || 1);
};

export const dateOnly = (s: string): string => s.slice(0, 10);

export const addDays = (iso: string, n: number): string => {
  const d = parseISO(dateOnly(iso));
  d.setDate(d.getDate() + n);
  return toISODate(d);
};

export const addMonths = (iso: string, n: number): string => {
  const d = parseISO(dateOnly(iso));
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toISODate(d);
};

/** Whole days from a to b (b − a). */
export const diffDays = (a: string, b: string): number => {
  const da = parseISO(dateOnly(a));
  const db = parseISO(dateOnly(b));
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
};

export const monthKey = (iso: string): string => iso.slice(0, 7);
export const yearOf = (iso: string): number => Number(iso.slice(0, 4));

export const startOfMonth = (iso: string) => iso.slice(0, 7) + '-01';
export const endOfMonth = (iso: string) => {
  const d = parseISO(startOfMonth(iso));
  return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
};

export const weekday = (iso: string): number => parseISO(dateOnly(iso)).getDay();

export const eachDay = (from: string, to: string): string[] => {
  const out: string[] = [];
  let cur = dateOnly(from);
  const end = dateOnly(to);
  let guard = 0;
  while (cur <= end && guard++ < 4000) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
};

export const workingDays = (from: string, to: string, workDays: number[]): string[] =>
  eachDay(from, to).filter((d) => workDays.includes(weekday(d)));

export const isValidISODate = (s: string | undefined): s is string =>
  !!s && /^\d{4}-\d{2}-\d{2}/.test(s) && !Number.isNaN(parseISO(s).getTime());

export const fmtDate = (iso: string | undefined, lang: string, opts?: Intl.DateTimeFormatOptions): string => {
  if (!iso) return '';
  const d = parseISO(iso);
  const hasTime = iso.includes('T');
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'zh-TW', {
    month: 'short',
    day: 'numeric',
    ...(hasTime && !opts ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
    ...opts,
  }).format(d);
};

export const fmtDateLong = (iso: string | undefined, lang: string) =>
  fmtDate(iso, lang, { year: 'numeric', month: lang === 'en' ? 'short' : 'long', day: 'numeric' });

export const fmtMonth = (key: string, lang: string, style: 'short' | 'long' = 'short') => {
  const d = parseISO(key + '-01');
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'zh-TW', {
    month: style,
    ...(style === 'long' ? { year: 'numeric' } : {}),
  }).format(d);
};

export const fmtDuration = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${pad(m)}:${pad(s)}`;
};

export const fmtHours = (hours: number, lang: string): string => {
  if (hours < 1) return lang === 'en' ? `${Math.round(hours * 60)} min` : `${Math.round(hours * 60)} 分`;
  const v = hours >= 10 ? Math.round(hours) : Math.round(hours * 10) / 10;
  return lang === 'en' ? `${v} h` : `${v} 小時`;
};
