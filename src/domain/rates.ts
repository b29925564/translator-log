import { langInfo, serviceLabel, SERVICES } from './constants';
import type { Client, ClientRate, ServiceType, Unit } from './types';

export interface RateQuery {
  service: ServiceType;
  sourceLang?: string;
  targetLang?: string;
  /** Preferred unit; with `strictUnit`, only rates in this unit qualify. */
  unit?: Unit;
  strictUnit?: boolean;
}

export interface ClientPrice {
  unit?: Unit;
  rate: number;
  minimumFee?: number;
  /** The rate-card entry used, or undefined when the client's default rate was used. */
  entry?: ClientRate;
}

/**
 * Finds the client's rate for a service and language pair. An entry that
 * names a language beats one that leaves it open (“any”), and an entry in the
 * preferred unit beats one in another unit; ties go to the earlier entry.
 */
export const matchClientRate = (client: Client | undefined, q: RateQuery): ClientRate | undefined => {
  let best: ClientRate | undefined;
  let bestScore = -1;
  for (const r of client?.rates ?? []) {
    if (r.service !== q.service || !(r.rate > 0)) continue;
    if (r.sourceLang && r.sourceLang !== q.sourceLang) continue;
    if (r.targetLang && r.targetLang !== q.targetLang) continue;
    if (q.strictUnit && q.unit && r.unit !== q.unit) continue;
    const score = (r.sourceLang ? 2 : 0) + (r.targetLang ? 2 : 0) + (q.unit && r.unit === q.unit ? 1 : 0);
    if (score > bestScore) {
      best = r;
      bestScore = score;
    }
  }
  return best;
};

/** The price to pre-fill for a job: the matching rate-card entry, else the client's default rate. */
export const clientPrice = (client: Client | undefined, q: RateQuery): ClientPrice | undefined => {
  if (!client) return undefined;
  const entry = matchClientRate(client, q);
  if (entry) return { unit: entry.unit, rate: entry.rate, minimumFee: entry.minimumFee, entry };
  if (!client.defaultRate) return undefined;
  if (q.strictUnit && q.unit && client.defaultUnit && client.defaultUnit !== q.unit) return undefined;
  if (q.strictUnit && q.unit && !client.defaultUnit) return undefined;
  return { unit: client.defaultUnit, rate: client.defaultRate };
};

/** “Proofreading · EN → ZH-TW”, with “any” for an open language. */
export const rateLabel = (r: Pick<ClientRate, 'service' | 'sourceLang' | 'targetLang'>, lang: 'zh-TW' | 'en') => {
  const any = lang === 'en' ? 'Any' : '不限';
  const side = (code?: string) => (code ? langInfo(code).short : any);
  const pair = r.sourceLang || r.targetLang ? ` · ${side(r.sourceLang)} → ${side(r.targetLang)}` : '';
  return serviceLabel(r.service, lang) + pair;
};

const SUGGESTED_ORDER: ServiceType[] = ['translation', 'proofreading', 'mtpe', 'review', 'lqa', 'transcreation', 'subtitling'];

/** A sensible next row for the rate card: the next common service not listed yet, same pair and unit as the last row. */
export const nextRateRow = (client: Pick<Client, 'rates' | 'defaultRate' | 'defaultUnit'>, fallback: { sourceLang: string; targetLang: string }, id: string): ClientRate => {
  const rows = client.rates ?? [];
  const last = rows[rows.length - 1];
  const used = new Set(rows.filter((r) => !last || (r.sourceLang === last.sourceLang && r.targetLang === last.targetLang)).map((r) => r.service));
  const service = [...SUGGESTED_ORDER, ...SERVICES.map((s) => s.id)].find((s) => !used.has(s)) ?? 'other';
  return {
    id,
    service,
    sourceLang: last ? last.sourceLang : fallback.sourceLang,
    targetLang: last ? last.targetLang : fallback.targetLang,
    unit: last?.unit ?? client.defaultUnit ?? 'word',
    rate: !last && service === 'translation' ? client.defaultRate ?? 0 : 0,
  };
};
