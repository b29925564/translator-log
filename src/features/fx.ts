import { CURRENCIES } from '../domain/constants';

/** Fetches current rates per 1 USD from free, CORS-enabled sources. */
export const fetchRates = async (): Promise<{ rates: Record<string, number>; source: string }> => {
  const wanted = CURRENCIES.map((c) => c.code);
  const pick = (all: Record<string, number>, lower = false) => {
    const out: Record<string, number> = { USD: 1 };
    for (const c of wanted) {
      const v = all[lower ? c.toLowerCase() : c];
      if (typeof v === 'number' && v > 0) out[c] = v;
    }
    return out;
  };
  const errors: string[] = [];
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', { cache: 'no-store' });
    const j = await res.json();
    if (j?.result === 'success' && j.rates) return { rates: pick(j.rates), source: 'open.er-api.com' };
    errors.push('er-api');
  } catch {
    errors.push('er-api');
  }
  for (const url of [
    'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json',
    'https://latest.currency-api.pages.dev/v1/currencies/usd.min.json',
  ]) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      const j = await res.json();
      if (j?.usd) return { rates: pick(j.usd, true), source: 'fawazahmed0/currency-api' };
    } catch {
      errors.push(url);
    }
  }
  throw new Error('rates-unavailable');
};
