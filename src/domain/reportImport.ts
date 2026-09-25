// Company reports → rows → matches. A report is either a list of jobs
// (a vendor-portal export, a monthly PO list) or a payment statement
// (remittance advice, payout report). Rows are matched to existing jobs and
// invoices so a statement can mark work paid instead of duplicating it.

import { guessMapping, parseDate, parseNumber, parsePair, parseStatus, parseUnit, type ImportField } from './csv';
import { dateOnly, diffDays } from './dates';
import { jobGross } from './money';
import type { Grid } from './sheets';
import type { Client, Invoice, Job, JobStatus, Unit } from './types';

export type ReportKind = 'jobs' | 'payments';

export interface ReportRow {
  title?: string;
  client?: string;
  /** PO, job, order or invoice number. */
  ref?: string;
  /** Delivery or work date. */
  date?: string;
  receivedAt?: string;
  dueAt?: string;
  paidAt?: string;
  sourceLang?: string;
  targetLang?: string;
  quantity?: number;
  unit?: Unit;
  rate?: number;
  amount?: number;
  currency?: string;
  status?: JobStatus;
  domain?: string;
  service?: string;
  catTool?: string;
  notes?: string;
}

export interface ParsedReport {
  kind: ReportKind;
  /** Client named in the report header, applied to rows that name none. */
  client?: string;
  currency?: string;
  /** Payment date printed once for the whole statement. */
  paidAt?: string;
  rows: ReportRow[];
}

const PAYMENT_WORDS = /(remittance|payment|paid|payout|settlement|匯款|付款|入帳|撥款|收款|支付)/i;
const TOTAL_ROW = /^(total|sub\s*total|grand\s*total|合計|總計|小計|總額|共計)(?![a-z])/i;

/** The row most likely to be the header: the one with the most recognisable column names near the top. */
export const findHeaderRow = (grid: Grid): number => {
  let best = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.min(grid.length, 20); i++) {
    const cells = grid[i].filter((c) => c && c.trim());
    if (cells.length < 2) continue;
    const score = guessMapping(grid[i]).filter((f) => f !== 'ignore').length;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  }
  return bestScore >= 2 ? best : 0;
};

const lastDate = (grid: Grid, rows: number) => {
  for (let i = 0; i < rows; i++) for (const c of grid[i] ?? []) if (c && PAYMENT_WORDS.test(c)) {
    const d = (grid[i] ?? []).map((x) => parseDate(x) ?? parseDate(x?.replace(/^.*?[:：]\s*/, ''))).find(Boolean);
    if (d) return d;
  }
  return undefined;
};

/** Rows of a table under a column mapping; skips blank and total lines. */
export const gridToReport = (grid: Grid, header: number, mapping: ImportField[], ctx: { today: string; defaultTargetLang: string }): ParsedReport => {
  const rows: ReportRow[] = [];
  for (const r of grid.slice(header + 1)) {
    const get = (f: ImportField) => {
      const i = mapping.indexOf(f);
      const v = i >= 0 ? r[i]?.trim() : undefined;
      return v || undefined;
    };
    if (!r.some((c) => c && c.trim())) continue;
    const first = r.find((c) => c && c.trim())?.trim() ?? '';
    if (TOTAL_ROW.test(first)) continue;
    const pair = parsePair(get('pair'), ctx.today, ctx.defaultTargetLang);
    const paidAt = parseDate(get('paidAt'));
    const row: ReportRow = {
      title: get('title'),
      client: get('client'),
      ref: get('ref'),
      date: parseDate(get('deliveredAt')) ?? parseDate(get('date')),
      receivedAt: parseDate(get('receivedAt')),
      dueAt: parseDate(get('dueAt')),
      paidAt,
      sourceLang: pair.sourceLang ?? get('sourceLang'),
      targetLang: pair.targetLang ?? get('targetLang'),
      quantity: parseNumber(get('quantity')),
      unit: parseUnit(get('unit')),
      rate: parseNumber(get('rate')),
      amount: parseNumber(get('amount')),
      currency: get('currency')?.toUpperCase().replace('NTD', 'TWD'),
      status: get('status') || paidAt ? parseStatus(get('status'), paidAt) : undefined,
      domain: get('domain'),
      service: get('service'),
      catTool: get('catTool'),
      notes: get('notes'),
    };
    // a row that says nothing we can use
    if (!row.title && !row.ref && row.amount == null && row.quantity == null) continue;
    rows.push(row);
  }
  const headerText = grid.slice(0, header + 1).flat().join(' ');
  const payments = PAYMENT_WORDS.test(headerText) && !mapping.includes('quantity');
  return { kind: payments ? 'payments' : 'jobs', rows, paidAt: lastDate(grid, header) };
};

// ---------- matching ----------

const norm = (s: string) => s.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '');

/** Word tokens plus CJK bigrams, so “醫療器材說明書” matches “說明書 醫療器材”. */
const tokens = (s: string) => {
  const out = new Set<string>();
  for (const w of s.toLowerCase().normalize('NFKC').split(/[^\p{L}\p{N}]+/u)) {
    if (!w) continue;
    if (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}/u.test(w)) for (let i = 0; i < w.length - 1; i++) out.add(w.slice(i, i + 2));
    else if (w.length > 1) out.add(w);
  }
  return out;
};

export const similarity = (a: string, b: string) => {
  const x = tokens(a);
  const y = tokens(b);
  if (!x.size || !y.size) return 0;
  // portals cut long titles, so “onboard” still counts for “onboarding”
  const near = (t: string) => y.has(t) || (t.length >= 4 && [...y].some((u) => u.length >= 4 && (u.startsWith(t) || t.startsWith(u))));
  let both = 0;
  for (const t of x) if (near(t)) both++;
  return both / Math.min(x.size, y.size);
};

export const findClient = (name: string | undefined, clients: Client[]) => {
  if (!name) return undefined;
  const n = norm(name);
  if (!n) return undefined;
  return clients.find((c) => norm(c.name) === n) ?? clients.find((c) => n.includes(norm(c.name)) || norm(c.name).includes(n));
};

/** A known client named anywhere in free text, such as a report's title block; longest name wins. */
export const clientMentioned = (text: string, clients: Client[]) => {
  const t = norm(text);
  if (!t) return undefined;
  return clients
    .filter((c) => !c.deletedAt && norm(c.name).length >= 3 && t.includes(norm(c.name)))
    .sort((a, b) => norm(b.name).length - norm(a.name).length)[0];
};

export interface RowMatch {
  jobIds: string[];
  invoiceId?: string;
  /** How sure the match is, 0–1. */
  score: number;
  why?: 'invoice' | 'ref' | 'amount' | 'title';
}

/**
 * Finds the existing job (or invoice) each row refers to. Each job is used
 * at most once, strongest evidence first: invoice number, PO number, then
 * the same amount near the same date, then a similar title.
 */
export const matchReport = (report: ParsedReport, ctx: { jobs: Job[]; invoices: Invoice[]; clients: Client[] }): RowMatch[] => {
  const jobs = ctx.jobs.filter((j) => !j.deletedAt && j.status !== 'cancelled');
  const used = new Set<string>();
  const out: RowMatch[] = report.rows.map(() => ({ jobIds: [], score: 0 }));
  const clientOf = (r: ReportRow) => findClient(r.client ?? report.client, ctx.clients);

  // pass 1: references
  report.rows.forEach((r, i) => {
    if (!r.ref) return;
    const ref = norm(r.ref);
    if (!ref) return;
    const inv = ctx.invoices.find((v) => !v.deletedAt && norm(v.number) === ref);
    if (inv) {
      const ids = inv.jobIds.filter((id) => !used.has(id));
      ids.forEach((id) => used.add(id));
      out[i] = { jobIds: ids, invoiceId: inv.id, score: 1, why: 'invoice' };
      return;
    }
    const j = jobs.find((x) => !used.has(x.id) && x.poNumber && norm(x.poNumber) === ref);
    if (j) {
      used.add(j.id);
      out[i] = { jobIds: [j.id], score: 1, why: 'ref' };
    }
  });

  // pass 2: amount + date, then title
  report.rows.forEach((r, i) => {
    if (out[i].score) return;
    const client = clientOf(r);
    // a payment settles unpaid work; paid jobs only match by an exact reference
    const pool = jobs.filter((j) => !used.has(j.id) && (report.kind !== 'payments' || j.status !== 'paid') && (!client || j.clientId === client.id) && (!r.currency || !report.currency || j.currency === (r.currency ?? report.currency)));
    const when = r.date ?? r.paidAt ?? report.paidAt;
    let best: { j: Job; score: number; why: RowMatch['why'] } | undefined;
    for (const j of pool) {
      let score = 0;
      let why: RowMatch['why'];
      const cur = r.currency ?? report.currency;
      if (r.amount != null && (!cur || cur === j.currency)) {
        const g = jobGross(j);
        if (g > 0 && Math.abs(g - r.amount) <= Math.max(0.5, r.amount * 0.01)) {
          const jd = j.deliveredAt ?? j.dueAt ?? j.receivedAt;
          const near = !when || !jd || Math.abs(diffDays(dateOnly(jd), when)) <= 75;
          if (near) {
            score = client ? 0.8 : 0.65;
            why = 'amount';
          }
        }
      }
      if (r.title) {
        const sim = similarity(r.title, j.title);
        const ts = sim >= 0.6 ? 0.55 + sim * 0.3 + (client ? 0.1 : 0) : 0;
        if (ts > score) {
          score = ts;
          why = 'title';
        } else if (score && sim >= 0.4) score = Math.min(0.95, score + 0.1);
      }
      if (score > (best?.score ?? 0)) best = { j, score, why };
    }
    if (best && best.score >= 0.6) {
      used.add(best.j.id);
      out[i] = { jobIds: [best.j.id], score: best.score, why: best.why };
    }
  });
  return out;
};

export type RowAction = 'paid' | 'update' | 'new' | 'skip';

/** What to do with each row by default. */
export const defaultAction = (kind: ReportKind, m: RowMatch, jobs: Map<string, Job>): RowAction => {
  if (!m.jobIds.length) return kind === 'payments' ? 'skip' : 'new';
  if (kind === 'payments') return m.jobIds.every((id) => jobs.get(id)?.status === 'paid') ? 'skip' : 'paid';
  return 'update';
};

/** Fields from the row that the existing job lacks; nothing already on the job is overwritten. */
export const fillFromRow = (j: Job, r: ReportRow): Partial<Job> => {
  const patch: Partial<Job> = {};
  if (r.ref && !j.poNumber) patch.poNumber = r.ref;
  if (r.quantity && !j.quantity && j.unit !== 'flat') patch.quantity = r.quantity;
  if (r.rate && !j.rate) patch.rate = r.rate;
  if (r.dueAt && !j.dueAt) patch.dueAt = r.dueAt;
  if (r.date && !j.deliveredAt && (j.status === 'delivered' || j.status === 'invoiced' || j.status === 'paid')) patch.deliveredAt = r.date;
  return patch;
};
