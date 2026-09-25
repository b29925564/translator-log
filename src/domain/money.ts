import { currencyInfo } from './constants';
import type { Client, Job, TaxSettings } from './types';
import { weightedWords } from './cat';

export const round = (v: number, decimals = 2) => {
  const f = 10 ** decimals;
  return Math.round((v + Number.EPSILON) * f) / f;
};

/** Converts using a table of rates expressed per 1 USD. */
export const fxRate = (from: string, to: string, ratesPerUsd: Record<string, number>): number => {
  if (from === to) return 1;
  const rf = ratesPerUsd[from];
  const rt = ratesPerUsd[to];
  if (!rf || !rt) return 1;
  return rt / rf;
};

export const convert = (amount: number, from: string, to: string, ratesPerUsd: Record<string, number>) =>
  amount * fxRate(from, to, ratesPerUsd);

/** Billable quantity after CAT weighting. */
export const billableQuantity = (job: Pick<Job, 'unit' | 'quantity' | 'cat'>): number => {
  if (job.unit === 'flat') return 1;
  if (job.cat && (job.unit === 'word' || job.unit === 'char')) return weightedWords(job.cat.counts, job.cat.grid);
  return job.quantity || 0;
};

/** Gross amount in the job currency. */
export const jobGross = (
  job: Pick<Job, 'unit' | 'quantity' | 'cat' | 'rate' | 'surchargePct' | 'minimumFee' | 'amountOverride' | 'currency'>,
): number => {
  if (job.amountOverride != null && !Number.isNaN(job.amountOverride)) return job.amountOverride;
  const qty = billableQuantity(job);
  let amount = job.unit === 'flat' ? job.rate || 0 : qty * (job.rate || 0);
  if (job.surchargePct) amount *= 1 + job.surchargePct / 100;
  if (job.minimumFee && amount < job.minimumFee) amount = job.minimumFee;
  return round(amount, currencyInfo(job.currency).decimals === 0 ? 0 : 2);
};

export const jobDeductions = (job: Pick<Job, 'withholding' | 'nhi' | 'fees'>) =>
  (job.withholding || 0) + (job.nhi || 0) + (job.fees || 0);

export const jobNet = (job: Job) => jobGross(job) - jobDeductions(job);

export const jobGrossBase = (job: Job) => jobGross(job) * (job.fxToBase || 1);
export const jobNetBase = (job: Job) => jobNet(job) * (job.fxToBase || 1);

/** Word count used for statistics. */
export const jobWords = (job: Pick<Job, 'unit' | 'quantity' | 'words' | 'cat'>): number => {
  if (job.unit === 'word' || job.unit === 'char') return job.quantity || 0;
  return job.words || 0;
};

/** Base-currency price per word, or undefined when the job is not word-based. */
export const jobRatePerWordBase = (job: Job): number | undefined => {
  const w = jobWords(job);
  if (!w) return undefined;
  return jobGrossBase(job) / w;
};

export interface DeductionSuggestion {
  withholding: number;
  nhi: number;
}

/**
 * Taiwan freelance payments: 10% income-tax withholding for single payments
 * above NT$20,000 and a 2.11% NHI supplementary premium for payments of
 * NT$20,000 or more. Only applies to domestic TWD payers that withhold.
 */
export const suggestDeductions = (
  gross: number,
  currency: string,
  client: Pick<Client, 'withholds'> | undefined,
  tax: TaxSettings,
): DeductionSuggestion => {
  if (tax.region !== 'TW' || currency !== 'TWD' || !client?.withholds) return { withholding: 0, nhi: 0 };
  const withholding = gross > tax.withholdingThreshold ? Math.round(gross * tax.withholdingRate) : 0;
  const nhi = gross >= tax.nhiThreshold ? Math.round(gross * tax.nhiRate) : 0;
  return { withholding, nhi };
};

// ---------- formatting ----------

const nf = (lang: string, opts: Intl.NumberFormatOptions) => new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'zh-TW', opts);

export const fmtNum = (v: number, lang: string, maxFrac = 0) => nf(lang, { maximumFractionDigits: maxFrac }).format(v || 0);

export const fmtCompact = (v: number, lang: string) =>
  nf(lang, { notation: 'compact', maximumFractionDigits: Math.abs(v) >= 1000 ? 1 : 0 }).format(v || 0);

export const fmtMoney = (
  v: number,
  currency: string,
  lang: string,
  opts: { compact?: boolean; decimals?: number; sign?: boolean } = {},
) => {
  const info = currencyInfo(currency);
  const decimals = opts.decimals ?? info.decimals;
  const abs = Math.abs(v || 0);
  const body = opts.compact && abs >= 10000
    ? nf(lang, { notation: 'compact', maximumFractionDigits: 1 }).format(abs)
    : nf(lang, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(abs);
  const sign = v < 0 ? '−' : opts.sign && v > 0 ? '+' : '';
  return `${sign}${info.symbol}${body}`;
};

/** Formats a per-unit rate with enough precision for small values like 0.085. */
export const fmtRate = (v: number, currency: string, lang: string) => {
  const info = currencyInfo(currency);
  const decimals = v >= 100 ? 0 : v >= 10 ? 1 : v >= 1 ? 2 : 3;
  const s = nf(lang, { minimumFractionDigits: 0, maximumFractionDigits: Math.max(decimals, info.decimals === 0 ? decimals : 2) }).format(v || 0);
  return `${info.symbol}${s}`;
};

export const fmtPct = (v: number, lang: string, digits = 0, sign = false) => {
  const s = nf(lang, { style: 'percent', maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(Math.abs(v));
  return `${v < 0 ? '−' : sign && v > 0 ? '+' : ''}${s}`;
};
