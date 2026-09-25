// Turns a reviewed report into records: rows marked paid settle their jobs
// (and invoices), matched rows fill in what the job lacks, the rest become
// new jobs. The plan is computed first so the review screen can count it.

import { BUILTIN_DOMAINS, SERVICES } from '../domain/constants';
import { fxRate } from '../domain/money';
import { fillFromRow, findClient, type ParsedReport, type ReportRow, type RowAction, type RowMatch } from '../domain/reportImport';
import type { Client, Invoice, Job, Settings } from '../domain/types';
import { tx } from '../i18n';
import { applyRecords, changeBus, newClient, newJob, withStatus } from './repo';

export interface ImportPlan {
  jobs: Job[];
  clients: Client[];
  invoices: Invoice[];
  counts: { paid: number; updated: number; created: number };
}

const serviceOf = (s: string | undefined) => {
  if (!s) return undefined;
  const t = s.toLowerCase();
  return SERVICES.find((x) => x.id === t || x.zh === s || x.en.toLowerCase() === t)?.id;
};

const domainOf = (s: string | undefined) => (s ? BUILTIN_DOMAINS.find((d) => d.zh === s || d.en.toLowerCase() === s.toLowerCase() || d.id === s)?.id ?? s : undefined);

/** A new job from a report row. */
export const jobFromRow = (r: ReportRow, ctx: { clientId?: string; currency: string; paidAt?: string; settings: Settings; today: string }): Job => {
  const quantity = r.quantity ?? 0;
  const amount = r.amount;
  let rate = r.rate;
  let unit = r.unit ?? (quantity ? 'word' : 'flat');
  if (!rate && amount != null && quantity) rate = Math.round((amount / quantity) * 10000) / 10000;
  if (!quantity && amount != null) unit = 'flat';
  const paid = r.paidAt ?? ctx.paidAt;
  const status = paid ? 'paid' : r.status ?? 'delivered';
  const delivered = r.date ?? (status === 'paid' ? paid : undefined);
  return newJob({
    title: r.title || r.notes || (r.ref ? `#${r.ref}` : tx('匯入的案件', 'Imported job')),
    clientId: ctx.clientId,
    poNumber: r.ref,
    service: serviceOf(r.service) ?? 'translation',
    sourceLang: r.sourceLang ?? ctx.settings.defaultSourceLang,
    targetLang: r.targetLang ?? ctx.settings.defaultTargetLang,
    unit,
    quantity: unit === 'flat' ? 1 : quantity,
    words: unit === 'flat' && quantity ? quantity : undefined,
    rate: unit === 'flat' ? amount ?? rate ?? 0 : rate ?? 0,
    amountOverride: unit !== 'flat' && amount != null && r.rate == null && rate == null ? amount : undefined,
    currency: ctx.currency,
    fxToBase: fxRate(ctx.currency, ctx.settings.baseCurrency, ctx.settings.fx.rates),
    status,
    receivedAt: r.receivedAt ?? delivered ?? ctx.today,
    dueAt: r.dueAt,
    deliveredAt: status === 'active' || status === 'quote' ? undefined : delivered ?? ctx.today,
    invoicedAt: status === 'invoiced' || status === 'paid' ? delivered ?? paid : undefined,
    paidAt: status === 'paid' ? paid ?? delivered : undefined,
    domain: domainOf(r.domain),
    catTool: r.catTool,
    notes: r.notes && r.notes !== r.title ? r.notes : undefined,
    progress: status === 'active' || status === 'quote' ? 0 : 100,
  });
};

export const planImport = (
  report: ParsedReport,
  matches: RowMatch[],
  actions: RowAction[],
  ctx: { jobs: Job[]; invoices: Invoice[]; clients: Client[]; settings: Settings; today: string },
): ImportPlan => {
  const jobMap = new Map(ctx.jobs.map((j) => [j.id, j]));
  const touched = new Map<string, Job>();
  const invoices = new Map<string, Invoice>();
  const created = new Map<string, Client>();
  const newJobs: Job[] = [];
  const counts = { paid: 0, updated: 0, created: 0 };
  const cur = (id: string) => touched.get(id) ?? jobMap.get(id);

  const clientFor = (r: ReportRow, currency: string) => {
    const name = (r.client ?? report.client)?.trim();
    if (!name) return undefined;
    const known = findClient(name, ctx.clients) ?? created.get(name.toLowerCase());
    if (known) return known.id;
    const c = newClient({ name, currency });
    created.set(name.toLowerCase(), c);
    return c.id;
  };

  report.rows.forEach((r, i) => {
    const a = actions[i];
    const m = matches[i];
    const paidAt = r.paidAt ?? report.paidAt ?? ctx.today;
    if (a === 'paid') {
      for (const id of m.jobIds) {
        const j = cur(id);
        if (!j || j.status === 'paid') continue;
        touched.set(id, withStatus({ ...j, ...fillFromRow(j, r), paidAt }, 'paid', paidAt));
        counts.paid++;
      }
      const inv = m.invoiceId ? ctx.invoices.find((v) => v.id === m.invoiceId) : undefined;
      if (inv && inv.status !== 'paid') invoices.set(inv.id, { ...inv, status: 'paid', paidAt });
    } else if (a === 'update') {
      for (const id of m.jobIds) {
        const j = cur(id);
        if (!j) continue;
        let next: Job = { ...j, ...fillFromRow(j, r) };
        if (r.paidAt && j.status !== 'paid') next = withStatus({ ...next, paidAt: r.paidAt }, 'paid', r.paidAt);
        touched.set(id, next);
        counts.updated++;
      }
    } else if (a === 'new') {
      const knownClient = findClient(r.client ?? report.client, ctx.clients);
      const currency = (r.currency ?? report.currency ?? knownClient?.currency ?? ctx.settings.baseCurrency).toUpperCase();
      const paid = report.kind === 'payments' ? paidAt : r.paidAt;
      newJobs.push(jobFromRow(r, { clientId: clientFor(r, currency), currency, paidAt: paid, settings: ctx.settings, today: ctx.today }));
      counts.created++;
    }
  });
  return { jobs: [...touched.values(), ...newJobs], clients: [...created.values()], invoices: [...invoices.values()], counts };
};

export const applyImport = async (plan: ImportPlan) => {
  const t = Date.now();
  const stamp = <T extends object>(x: T): T => Object.fromEntries(Object.entries({ ...x, updatedAt: t }).filter(([, v]) => v !== undefined)) as T;
  await applyRecords({ jobs: plan.jobs.map(stamp), clients: plan.clients, invoices: plan.invoices.map(stamp) });
  changeBus.dispatchEvent(new Event('change'));
};
