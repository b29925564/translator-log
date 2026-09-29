import { describe, expect, it } from 'vitest';
import { looksLikeTable, ocrWordsToItems, pdfItemsToGrid, pdfItemsToText, type PdfItem } from '../src/domain/pdfTable';

/** Lays out rows of [x, text] at a baseline, 10pt type, CJK at 10pt per character. */
const row = (page: number, y: number, cells: [number, string][]): PdfItem[] =>
  cells.map(([x, str]) => ({ str, x, y, width: [...str].reduce((w, ch) => w + (/[　-鿿＀-￯]/.test(ch) ? 10 : 5.5), 0), height: 10, page }));

describe('pdfItemsToGrid', () => {
  it('rebuilds a two-page CJK statement, dropping the running header and footer', () => {
    const page = (p: number, data: [string, string][]) => [
      ...row(p, 800, [[40, '海港翻譯社 付款明細']]),
      ...row(p, 760, [[40, '案件名稱'], [300, '金額']]),
      ...data.flatMap(([t, amt], i) => row(p, 740 - i * 18, [[40, t], [300 + (6 - amt.length) * 5.5, amt]])),
      ...row(p, 40, [[260, `第 ${p} 頁，共 2 頁`]]),
    ];
    const items = [
      ...page(1, [
        ['醫療器材說明書', '4,500'],
        ['遊戲更新公告', '1,200'],
      ]),
      ...page(2, [['年報摘要', '12,000']]),
    ];
    const grid = pdfItemsToGrid(items);
    expect(grid).toEqual([
      ['海港翻譯社 付款明細', ''],
      ['案件名稱', '金額'],
      ['醫療器材說明書', '4,500'],
      ['遊戲更新公告', '1,200'],
      ['年報摘要', '12,000'],
    ]);
    expect(looksLikeTable(grid)).toBe(true);
  });

  it('keeps words of one cell together and splits cells at wide gaps', () => {
    const items = [
      ...row(1, 700, [[40, 'Project'], [250, 'Date'], [350, 'Words'], [430, 'Amount']]),
      // one pdf.js item per word, as some generators emit
      ...row(1, 682, [[40, 'Onboarding'], [98, 'emails'], [250, '2026-08-10'], [350, '2500'], [430, '250.00']]),
      ...row(1, 664, [[40, 'Starfall'], [87, 'trailer'], [250, '2026-08-20'], [350, '3000'], [430, '300.00']]),
    ];
    expect(pdfItemsToGrid(items)).toEqual([
      ['Project', 'Date', 'Words', 'Amount'],
      ['Onboarding emails', '2026-08-10', '2500', '250.00'],
      ['Starfall trailer', '2026-08-20', '3000', '300.00'],
    ]);
  });

  it('joins a title that wraps onto a second line', () => {
    const items = [
      ...row(1, 700, [[40, 'Project'], [250, 'Words'], [350, 'Amount']]),
      ...row(1, 682, [[40, 'Annual report'], [250, '8000'], [350, '800']]),
      ...row(1, 670, [[40, 'summary']]),
      ...row(1, 652, [[40, 'Menu'], [250, '500'], [350, '50']]),
    ];
    expect(pdfItemsToGrid(items)).toEqual([
      ['Project', 'Words', 'Amount'],
      ['Annual report summary', '8000', '800'],
      ['Menu', '500', '50'],
    ]);
  });

  it('finds no table in running text', () => {
    const items = [...row(1, 700, [[40, 'Thank you for your work this month.']]), ...row(1, 680, [[40, 'Payment will follow.']])];
    expect(looksLikeTable(pdfItemsToGrid(items))).toBe(false);
    expect(pdfItemsToText(items)).toBe('Thank you for your work this month.\nPayment will follow.');
    expect(pdfItemsToGrid([])).toEqual([]);
  });
});

describe('ocrWordsToItems', () => {
  it('turns recognised words of a photo into rows', () => {
    const w = (text: string, x0: number, y0: number, confidence = 90) => ({ text, confidence, bbox: { x0, y0, x1: x0 + text.length * 22, y1: y0 + 30 } });
    const words = [w('案件名稱', 40, 100), w('金額', 600, 100), w('說明書', 40, 150), w('4,500', 600, 150), w('官網', 40, 200), w('800', 600, 200), w('~~', 300, 200, 10)];
    const grid = pdfItemsToGrid(ocrWordsToItems(words, 1));
    expect(grid).toEqual([
      ['案件名稱', '金額'],
      ['說明書', '4,500'],
      ['官網', '800'],
    ]);
  });
});
