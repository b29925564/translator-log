import { describe, expect, it } from 'vitest';
import { buildResume, clientPublicName } from '../src/domain/resume';
import { buildPortfolio } from '../src/features/portfolio';
import { skylineMonths } from '../src/domain/stats';
import type { Client, Job } from '../src/domain/types';

const client = (over: Partial<Client>): Client => ({ id: 'c1', createdAt: 0, updatedAt: 0, name: 'Acme', kind: 'agency', currency: 'USD', ...over });
const job = (over: Partial<Job> = {}): Job => ({
  id: 'j' + Math.random(),
  createdAt: 0,
  updatedAt: 0,
  title: 'Manual',
  service: 'translation',
  sourceLang: 'en',
  targetLang: 'zh-TW',
  tags: [],
  unit: 'word',
  quantity: 12000,
  rate: 0.1,
  currency: 'USD',
  fxToBase: 32,
  status: 'paid',
  deliveredAt: '2025-06-01',
  clientId: 'c1',
  ...over,
});

describe('anonymous client names', () => {
  it('keeps a label written in the résumé language', () => {
    expect(clientPublicName(client({ publicLabel: '台灣語言服務公司' }), 'anonymous', 'zh')).toBe('台灣語言服務公司');
    expect(clientPublicName(client({ publicLabel: 'IP law firm' }), 'anonymous', 'en')).toBe('IP law firm');
  });

  it('generates one in the right language instead of mixing scripts', () => {
    const c = client({ publicLabel: 'US-based localization provider', country: 'US' });
    expect(clientPublicName(c, 'anonymous', 'zh')).toBe('美國語言服務公司');
    const t = client({ publicLabel: '台灣文學出版社', kind: 'publisher', country: 'TW' });
    expect(clientPublicName(t, 'anonymous', 'en')).toBe('Taiwanese publisher');
  });
});

describe('portfolio site', () => {
  it('escapes everything that came from the user', () => {
    const evil = client({ name: '<script>alert(1)</script>' });
    const jobs = [job({ title: '<img src=x onerror=alert(1)>' })];
    const profile = { name: 'A&B "Studio"', email: 'a@b.co' };
    const opts = { clientMode: 'named' as const, projectCount: 6 };
    const html = buildPortfolio({
      zh: buildResume(jobs, [evil], profile, { ...opts, lang: 'zh' }),
      en: buildResume(jobs, [evil], profile, { ...opts, lang: 'en' }),
      profile,
      skyline: skylineMonths(jobs, '2025-07-01'),
      defaultLang: 'en',
    });
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('A&amp;B &quot;Studio&quot;');
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('mailto:a@b.co');
  });
});
