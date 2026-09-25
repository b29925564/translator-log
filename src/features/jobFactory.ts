import { newClient, newJob, saveClient, withStatus } from '../db/repo';
import { domainLabel, serviceLabel } from '../domain/constants';
import { fxRate, jobGross, suggestDeductions } from '../domain/money';
import type { QuickParse } from '../domain/quickadd';
import { clientPrice } from '../domain/rates';
import type { Client, Job, Settings } from '../domain/types';
import { getLang } from '../i18n';
import { clientHabits } from './common';

/** Builds a complete job from a quick-add parse plus what we know about the client. */
export const jobFromParse = (p: QuickParse, ctx: { clients: Client[]; jobs: Job[]; settings: Settings; today: string }): { job: Job; newClient?: Client } => {
  const { settings } = ctx;
  let client = ctx.clients.find((c) => c.id === p.clientId);
  let created: Client | undefined;
  if (!client && p.newClientName) {
    created = newClient({ name: p.newClientName, currency: p.currency ?? settings.baseCurrency, kind: /出版/.test(p.newClientName) ? 'publisher' : /翻譯|Transl|Locali|Language/i.test(p.newClientName) ? 'agency' : 'direct' });
    client = created;
  }
  const habits = clientHabits(client?.id, ctx.jobs);
  const service = p.service ?? habits?.service ?? 'translation';
  const sourceLang = p.sourceLang ?? habits?.sourceLang ?? settings.defaultSourceLang;
  const targetLang = p.targetLang ?? habits?.targetLang ?? settings.defaultTargetLang;
  // the client's rate for this service and pair; a unit typed in the message must match it
  const price = clientPrice(client, { service, sourceLang, targetLang, unit: p.unit, strictUnit: p.unit != null });
  const unit = p.unit ?? price?.unit ?? client?.defaultUnit ?? habits?.unit ?? 'word';
  const currency = p.currency ?? client?.currency ?? settings.baseCurrency;
  let rate = p.rate ?? (unit === 'flat' ? p.flatFee : undefined) ?? price?.rate ?? habits?.rate ?? 0;
  if (unit === 'flat' && p.flatFee != null) rate = p.flatFee;
  const minimumFee = p.rate == null && p.flatFee == null ? price?.minimumFee : undefined;
  const domain = p.domain ?? habits?.domain;
  const lang = getLang();
  let job = newJob({
    title: p.title || [domain ? domainLabel(domain, lang) : '', serviceLabel(service, lang)].filter(Boolean).join(' '),
    clientId: client?.id,
    service,
    sourceLang,
    targetLang,
    minimumFee,
    domain,
    unit,
    quantity: unit === 'flat' ? 1 : p.quantity ?? 0,
    words: unit === 'flat' ? p.quantity : undefined,
    rate,
    currency,
    amountOverride: p.flatFee != null && unit !== 'flat' && p.rate == null ? p.flatFee : undefined,
    fxToBase: fxRate(currency, settings.baseCurrency, settings.fx.rates),
    dueAt: p.dueAt,
    catTool: p.catTool ?? habits?.catTool,
    poNumber: p.poNumber,
    status: p.status ?? 'active',
    receivedAt: ctx.today,
    progress: 0,
    incomeCategory: '9B',
    confidential: client?.kind === 'agency',
  });
  if (job.status !== 'active' && job.status !== 'quote') job = withStatus(job, job.status, ctx.today);
  const d = suggestDeductions(jobGross(job), job.currency, client, settings.tax);
  if (d.withholding) job.withholding = d.withholding;
  if (d.nhi) job.nhi = d.nhi;
  return { job, newClient: created };
};

export const persistNewClient = async (c?: Client) => {
  if (c) await saveClient(c);
};
