import { domainLabel, serviceLabel, unitInfo } from '../domain/constants';
import { dateOnly, diffDays, fmtDate, fmtDateLong, parseISO } from '../domain/dates';
import { fmtCompact, fmtMoney, fmtNum, fmtPct, fmtRate } from '../domain/money';
import type { ServiceType, Unit } from '../domain/types';
import { getLang, tx } from '../i18n';

export const money = (v: number, cur: string, opts?: { compact?: boolean; decimals?: number; sign?: boolean }) => fmtMoney(v, cur, getLang(), opts);
export const rate = (v: number, cur: string) => fmtRate(v, cur, getLang());
export const num = (v: number, maxFrac = 0) => fmtNum(v, getLang(), maxFrac);
export const compact = (v: number) => fmtCompact(v, getLang());
export const pct = (v: number, digits = 0, sign = false) => fmtPct(v, getLang(), digits, sign);
export const date = (iso?: string, opts?: Intl.DateTimeFormatOptions) => fmtDate(iso, getLang(), opts);
export const dateLong = (iso?: string) => fmtDateLong(iso, getLang());
export const domain = (id?: string) => domainLabel(id, getLang());
export const service = (id: ServiceType) => serviceLabel(id, getLang());
export const unitPer = (u: Unit) => (getLang() === 'en' ? unitInfo(u).per.en : unitInfo(u).per.zh);
export const unitName = (u: Unit) => (getLang() === 'en' ? unitInfo(u).en : unitInfo(u).zh);

/** Word/char counts read naturally: “12,500 字” / “12,500 words”. */
export const words = (n: number, unit: Unit = 'word') => {
  if (getLang() === 'en') return `${num(n)} ${unit === 'char' ? 'chars' : 'words'}`;
  return `${num(n)} 字`;
};

export const qty = (n: number, unit: Unit) => {
  if (unit === 'word' || unit === 'char') return words(n, unit);
  if (unit === 'flat') return tx('整案', 'Flat');
  return `${num(n, 1)} ${unitPer(unit)}`;
};

export interface DueInfo {
  text: string;
  tone: 'bad' | 'warn' | 'info' | 'muted';
  days: number;
}

export const dueInfo = (due: string | undefined, today: string): DueInfo | undefined => {
  if (!due) return undefined;
  const d = diffDays(today, dateOnly(due));
  const time = due.includes('T') ? ' ' + due.slice(11, 16) : '';
  if (d < 0) return { text: tx(`逾期 ${-d} 天`, `${-d}d overdue`), tone: 'bad', days: d };
  if (d === 0) return { text: tx(`今天${time}`, `Today${time}`), tone: 'bad', days: d };
  if (d === 1) return { text: tx(`明天${time}`, `Tomorrow${time}`), tone: 'warn', days: d };
  if (d <= 6) {
    const wd = new Intl.DateTimeFormat(getLang() === 'en' ? 'en-US' : 'zh-TW', { weekday: 'short' }).format(parseISO(dateOnly(due)));
    return { text: tx(`${d} 天後（${wd}）`, `In ${d}d (${wd})`), tone: 'info', days: d };
  }
  return { text: date(due), tone: 'muted', days: d };
};

export const greeting = () => {
  const h = new Date().getHours();
  if (h < 5) return tx('夜深了', 'Working late');
  if (h < 11) return tx('早安', 'Good morning');
  if (h < 14) return tx('午安', 'Good afternoon');
  if (h < 18) return tx('午安', 'Good afternoon');
  return tx('晚安', 'Good evening');
};

export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export { dateOnly };
