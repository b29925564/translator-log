import { describe, expect, it } from 'vitest';
import { jobFromParse } from '../src/features/jobFactory';
import { DEFAULT_SETTINGS } from '../src/domain/constants';
import { clientPrice, matchClientRate, nextRateRow, rateLabel } from '../src/domain/rates';
import type { Client, ClientRate } from '../src/domain/types';

const rates: ClientRate[] = [
  { id: 'a', service: 'translation', sourceLang: 'en', targetLang: 'zh-TW', unit: 'word', rate: 1.1 },
  { id: 'b', service: 'proofreading', sourceLang: 'en', targetLang: 'zh-TW', unit: 'word', rate: 0.4, minimumFee: 500 },
  { id: 'c', service: 'mtpe', unit: 'word', rate: 0.6 },
  { id: 'd', service: 'mtpe', sourceLang: 'en', targetLang: 'zh-TW', unit: 'word', rate: 0.55 },
  { id: 'e', service: 'translation', sourceLang: 'zh-TW', targetLang: 'en', unit: 'char', rate: 1.6 },
  { id: 'f', service: 'lqa', unit: 'hour', rate: 800 },
];
const client = (over: Partial<Client> = {}): Client => ({ id: 'c1', createdAt: 0, updatedAt: 0, name: '藍海', kind: 'agency', currency: 'TWD', rates, ...over });

describe('client rate card', () => {
  it('picks the rate for the service and direction', () => {
    expect(matchClientRate(client(), { service: 'translation', sourceLang: 'en', targetLang: 'zh-TW' })?.rate).toBe(1.1);
    expect(matchClientRate(client(), { service: 'translation', sourceLang: 'zh-TW', targetLang: 'en' })?.rate).toBe(1.6);
    expect(matchClientRate(client(), { service: 'proofreading', sourceLang: 'en', targetLang: 'zh-TW' })?.minimumFee).toBe(500);
  });

  it('prefers a rate for the exact pair over one for any language', () => {
    expect(matchClientRate(client(), { service: 'mtpe', sourceLang: 'en', targetLang: 'zh-TW' })?.id).toBe('d');
    expect(matchClientRate(client(), { service: 'mtpe', sourceLang: 'ja', targetLang: 'zh-TW' })?.id).toBe('c');
  });

  it('has no match for an unlisted service or pair', () => {
    expect(matchClientRate(client(), { service: 'proofreading', sourceLang: 'ja', targetLang: 'zh-TW' })).toBeUndefined();
    expect(matchClientRate(client(), { service: 'subtitling', sourceLang: 'en', targetLang: 'zh-TW' })).toBeUndefined();
  });

  it('honours a required unit', () => {
    expect(matchClientRate(client(), { service: 'translation', sourceLang: 'zh-TW', targetLang: 'en', unit: 'word', strictUnit: true })).toBeUndefined();
    expect(matchClientRate(client(), { service: 'lqa', unit: 'hour', strictUnit: true })?.rate).toBe(800);
  });

  it('falls back to the default rate for anything not listed', () => {
    const c = client({ defaultRate: 1, defaultUnit: 'word' });
    expect(clientPrice(c, { service: 'subtitling', sourceLang: 'en', targetLang: 'zh-TW' })).toEqual({ unit: 'word', rate: 1 });
    expect(clientPrice(c, { service: 'subtitling', unit: 'minute', strictUnit: true })).toBeUndefined();
    expect(clientPrice(client(), { service: 'subtitling' })).toBeUndefined();
    expect(clientPrice(c, { service: 'proofreading', sourceLang: 'en', targetLang: 'zh-TW' })?.rate).toBe(0.4);
  });

  it('labels rates in both languages', () => {
    expect(rateLabel(rates[1], 'zh-TW')).toBe('校對 · EN → ZH-TW');
    expect(rateLabel(rates[2], 'en')).toBe('MT Post-editing');
    expect(rateLabel({ service: 'review', sourceLang: 'en' }, 'en')).toBe('Review / Editing · EN → Any');
  });

  it('suggests the next common service for a new row', () => {
    const first = nextRateRow({ defaultRate: 1.2, defaultUnit: 'char' }, { sourceLang: 'en', targetLang: 'zh-TW' }, 'x');
    expect(first).toMatchObject({ service: 'translation', sourceLang: 'en', targetLang: 'zh-TW', unit: 'char', rate: 1.2 });
    const second = nextRateRow({ rates: [first] }, { sourceLang: 'en', targetLang: 'zh-TW' }, 'y');
    expect(second).toMatchObject({ service: 'proofreading', unit: 'char', rate: 0 });
  });
});

describe('quick add uses the rate card', () => {
  const settings = { ...DEFAULT_SETTINGS, baseCurrency: 'TWD' };
  const ctx = { clients: [client({ defaultRate: 1, defaultUnit: 'word' })], jobs: [], settings, today: '2026-09-25' };

  it('fills the proofreading rate and minimum fee', () => {
    const { job } = jobFromParse({ title: '', tokens: [], clientId: 'c1', service: 'proofreading', sourceLang: 'en', targetLang: 'zh-TW', quantity: 800 }, ctx);
    expect(job.rate).toBe(0.4);
    expect(job.minimumFee).toBe(500);
    expect(job.unit).toBe('word');
  });

  it('keeps a rate typed in the message', () => {
    const { job } = jobFromParse({ title: '', tokens: [], clientId: 'c1', service: 'proofreading', sourceLang: 'en', targetLang: 'zh-TW', quantity: 800, rate: 0.5 }, ctx);
    expect(job.rate).toBe(0.5);
    expect(job.minimumFee).toBeUndefined();
  });

  it('uses the per-character rate for Chinese to English', () => {
    const { job } = jobFromParse({ title: '', tokens: [], clientId: 'c1', service: 'translation', sourceLang: 'zh-TW', targetLang: 'en', quantity: 3000 }, ctx);
    expect(job.unit).toBe('char');
    expect(job.rate).toBe(1.6);
  });
});
