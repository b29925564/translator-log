// Taiwan tax helper. Estimates only: it organises what you received so
// filing season is quick, it does not replace the tax bureau's figures.

import { dateOnly } from './dates';
import { jobGross } from './money';
import type { IncomeCategory, Job, TaxSettings } from './types';

export interface TaxLine {
  category: IncomeCategory;
  gross: number;
  withheld: number;
  nhi: number;
  fees: number;
  count: number;
}

export interface TaxYear {
  year: number;
  lines: TaxLine[];
  gross: number;
  withheld: number;
  nhi: number;
  fees: number;
  net: number;
  /** Income received without withholding (often overseas clients): must be self-reported. */
  unwithheld: number;
  unwithheldCount: number;
  /** 9B taxable estimate: (9B income − exemption) × (1 − expense rate). */
  taxable9B: number;
  byPayer: { clientId?: string; gross: number; withheld: number; nhi: number; count: number }[];
  pendingCount: number;
}

export const defaultCategory = (job: Job): IncomeCategory => job.incomeCategory ?? '9B';

/** Tax is based on the day the money arrives, converted at the job's frozen rate. */
export const taxYear = (jobs: Job[], year: number, tax: TaxSettings): TaxYear => {
  const paid = jobs.filter((j) => !j.deletedAt && j.status === 'paid' && j.paidAt && dateOnly(j.paidAt).startsWith(String(year)));
  const pending = jobs.filter(
    (j) => !j.deletedAt && (j.status === 'delivered' || j.status === 'invoiced') && (j.deliveredAt ?? '').startsWith(String(year)),
  );
  const lines = new Map<IncomeCategory, TaxLine>();
  const payers = new Map<string, TaxYear['byPayer'][number]>();
  let unwithheld = 0;
  let unwithheldCount = 0;
  for (const j of paid) {
    const fx = j.fxToBase || 1;
    const gross = jobGross(j) * fx;
    const withheld = (j.withholding || 0) * fx;
    const nhi = (j.nhi || 0) * fx;
    const fees = (j.fees || 0) * fx;
    const cat = defaultCategory(j);
    const line = lines.get(cat) ?? { category: cat, gross: 0, withheld: 0, nhi: 0, fees: 0, count: 0 };
    line.gross += gross;
    line.withheld += withheld;
    line.nhi += nhi;
    line.fees += fees;
    line.count++;
    lines.set(cat, line);
    if (!withheld) {
      unwithheld += gross;
      unwithheldCount++;
    }
    const key = j.clientId ?? '';
    const p = payers.get(key) ?? { clientId: j.clientId, gross: 0, withheld: 0, nhi: 0, count: 0 };
    p.gross += gross;
    p.withheld += withheld;
    p.nhi += nhi;
    p.count++;
    payers.set(key, p);
  }
  const all = [...lines.values()];
  const sum = (k: keyof Omit<TaxLine, 'category'>) => all.reduce((s, l) => s + l[k], 0);
  const g9b = lines.get('9B')?.gross ?? 0;
  return {
    year,
    lines: all.sort((a, b) => b.gross - a.gross),
    gross: sum('gross'),
    withheld: sum('withheld'),
    nhi: sum('nhi'),
    fees: sum('fees'),
    net: sum('gross') - sum('withheld') - sum('nhi') - sum('fees'),
    unwithheld,
    unwithheldCount,
    taxable9B: Math.max(0, g9b - tax.exemption9B) * (1 - tax.expenseRate9B),
    byPayer: [...payers.values()].sort((a, b) => b.gross - a.gross),
    pendingCount: pending.length,
  };
};
