import { describe, expect, it } from 'vitest';
import { parseQuickAdd, type QuickContext } from '../src/domain/quickadd';

const ctx: QuickContext = {
  clients: [
    { id: 'c1', name: '藍海翻譯社', currency: 'TWD' },
    { id: 'c2', name: 'Lumina Localization', currency: 'USD' },
  ],
  today: '2026-09-25', // Friday
  baseCurrency: 'TWD',
  defaultTargetLang: 'zh-TW',
};

describe('parseQuickAdd', () => {
  it('parses a typical Chinese one-liner', () => {
    const r = parseQuickAdd('藍海翻譯社 醫療器材說明書 英翻中 12,500字 每字0.9 10/20交', ctx);
    expect(r.clientId).toBe('c1');
    expect(r.sourceLang).toBe('en');
    expect(r.targetLang).toBe('zh-TW');
    expect(r.quantity).toBe(12500);
    expect(r.unit).toBe('word');
    expect(r.rate).toBe(0.9);
    expect(r.currency).toBe('TWD');
    expect(r.dueAt).toBe('2026-10-20');
    expect(r.domain).toBe('medical');
    expect(r.title).toBe('醫療器材說明書');
    const rate = r.tokens.find((t) => t.kind === 'rate')!;
    expect('藍海翻譯社 醫療器材說明書 英翻中 12,500字 每字0.9 10/20交'.slice(rate.start, rate.end)).toBe('每字0.9');
    for (let i = 1; i < r.tokens.length; i++) expect(r.tokens[i].start).toBeGreaterThanOrEqual(r.tokens[i - 1].end);
  });

  it('parses an English line with $ rate and weekday', () => {
    const r = parseQuickAdd('Lumina Localization marketing brochure EN>ZH-TW 3.2k words @ $0.08/word due fri', ctx);
    expect(r.clientId).toBe('c2');
    expect(r.sourceLang).toBe('en');
    expect(r.targetLang).toBe('zh-TW');
    expect(r.quantity).toBe(3200);
    expect(r.rate).toBe(0.08);
    expect(r.currency).toBe('USD');
    expect(r.dueAt).toBe('2026-10-02');
    expect(r.domain).toBe('marketing');
    expect(r.title).toBe('marketing brochure');
  });

  it('uses characters for CJK source and understands 萬', () => {
    const r = parseQuickAdd('日翻中 輕小說 1.2萬字 0.6元/字 下週三', ctx);
    expect(r.sourceLang).toBe('ja');
    expect(r.unit).toBe('char');
    expect(r.quantity).toBe(12000);
    expect(r.rate).toBe(0.6);
    expect(r.currency).toBe('TWD');
    expect(r.dueAt).toBe('2026-09-30');
    expect(r.domain).toBe('literary');
  });

  it('handles hourly interpreting with time of day', () => {
    const r = parseQuickAdd('星河科技 產品發表會 口譯 3小時 每小時3000元 明天下午2點', ctx);
    expect(r.service).toBe('interpreting');
    expect(r.unit).toBe('hour');
    expect(r.quantity).toBe(3);
    expect(r.rate).toBe(3000);
    expect(r.dueAt).toBe('2026-09-26T14:00');
    expect(r.newClientName).toBeUndefined();
  });

  it('detects flat fees and new client names', () => {
    const r = parseQuickAdd('青禾出版社 繪本翻譯 英譯中 稿費 1.5萬 月底交', ctx);
    expect(r.newClientName).toBe('青禾出版社');
    expect(r.flatFee).toBe(15000);
    expect(r.unit).toBe('flat');
    expect(r.dueAt).toBe('2026-09-30');
    expect(r.title).toBe('繪本翻譯');
  });

  it('treats a tiny bare amount next to a word count as the rate', () => {
    const r = parseQuickAdd('合約 中譯英 5000字 1.8元', ctx);
    expect(r.sourceLang).toBe('zh-TW');
    expect(r.targetLang).toBe('en');
    expect(r.unit).toBe('char');
    expect(r.rate).toBe(1.8);
    expect(r.flatFee).toBeUndefined();
    expect(r.domain).toBe('legal');
  });

  it('recognises cents, MTPE and status words', () => {
    const r = parseQuickAdd('Acme Games UI strings MTPE en-ja 8000 words 4 cents/word 已交', ctx);
    expect(r.service).toBe('mtpe');
    expect(r.rate).toBeCloseTo(0.04);
    expect(r.currency).toBe('USD');
    expect(r.status).toBe('delivered');
    expect(r.targetLang).toBe('ja');
    expect(r.newClientName).toBe('Acme Games');
  });

  it('keeps words that end in 案 intact', () => {
    const r = parseQuickAdd('森田翻訳 手遊活動文案 日翻中 8000字 7円/字 下週三', ctx);
    expect(r.title).toBe('手遊活動文案');
    expect(r.newClientName).toBe('森田翻訳');
    expect(r.currency).toBe('JPY');
  });

  it('picks the nearest year for month/day dates', () => {
    expect(parseQuickAdd('test 1/10', ctx).dueAt).toBe('2027-01-10');
    expect(parseQuickAdd('test 8/1', ctx).dueAt).toBe('2026-08-01');
    expect(parseQuickAdd('test 2026-12-01', ctx).dueAt).toBe('2026-12-01');
  });
});
