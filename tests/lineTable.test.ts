import { strToU8, zipSync } from 'fflate';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { guessColumns } from '../src/domain/csv';
import { docText, docxParagraphs, linesToGrid, parseRecordLine, rtfText, textToGrid } from '../src/domain/lineTable';
import { findHeaderRow, gridToReport } from '../src/domain/reportImport';
import { readTables } from '../src/domain/sheets';
import { readXls } from '../src/domain/xls';

const ctx = { today: '2026-09-01', defaultTargetLang: 'zh-TW' };
const rowsOf = (text: string) => {
  const grid = textToGrid(text)!;
  const h = findHeaderRow(grid);
  return gridToReport(grid, h, guessColumns(grid, h), ctx).rows;
};

describe('parseRecordLine', () => {
  it('pulls a record apart', () => {
    expect(parseRecordLine('2023/05/01 某案名 3,000字 NT$4,500')).toEqual({ dates: ['2023/05/01'], title: '某案名', quantity: '3,000', unit: '字', amount: '4,500', currency: 'TWD' });
    expect(parseRecordLine('- 2024-02-10 ~ 2024-02-12 | Help center EN>ZH | 3400 words @0.08 | USD 272')).toMatchObject({
      dates: ['2024-02-10', '2024-02-12'],
      pair: 'EN>ZH',
      quantity: '3400',
      rate: '0.08',
      amount: '272',
      currency: 'USD',
      title: 'Help center',
    });
    expect(parseRecordLine('112年3月5日 英翻中 型錄 1200 1800')).toMatchObject({ dates: ['112/3/5'], pair: '英翻中', quantity: '1200', amount: '1800', title: '型錄' });
  });

  it('leaves prose alone', () => {
    expect(parseRecordLine('Dear translator, thank you for your work.')).toBeUndefined();
    expect(parseRecordLine('Page 2')).toBeUndefined();
    expect(parseRecordLine('合計')).toBeUndefined();
  });
});

describe('linesToGrid', () => {
  it('turns a list of records into rows the import understands', () => {
    const rows = rowsOf(`2023 年接案紀錄
2023/05/01 醫療器材說明書 3,000字 NT$4,500
2023/06/12 遊戲更新公告 1,200字 NT$1,800

備註：以上皆已收款`);
    expect(rows).toMatchObject([
      { date: '2023-05-01', title: '醫療器材說明書', quantity: 3000, unit: 'word', amount: 4500, currency: 'TWD' },
      { date: '2023-06-12', title: '遊戲更新公告', quantity: 1200, amount: 1800 },
    ]);
  });

  it('needs at least two records', () => {
    expect(linesToGrid('2023/05/01 某案名 3,000字 NT$4,500')).toBeUndefined();
  });

  it('still reads a pasted table as a table', () => {
    expect(textToGrid('Job\tWords\tRate\nA\t100\t0.1\nB\t200\t0.1')?.[0]).toEqual(['Job', 'Words', 'Rate']);
  });
});

describe('old formats', () => {
  it('reads RTF text, Big5 bytes and unicode escapes included', () => {
    const rtf = String.raw`{\rtf1\ansi\ansicpg950{\fonttbl{\f0 PMingLiU;}}{\*\generator Word;}\f0 2023/05/01 \'c2\'e5\'c0\'f8 3,000${'\\'}u23383?  NT$4,500\par 2023/06/12 Game patch 1,200 words US$120\par}`;
    const text = rtfText(rtf);
    expect(text).toBe('2023/05/01 醫療 3,000字  NT$4,500\n2023/06/12 Game patch 1,200 words US$120\n');
    expect(linesToGrid(text)).toBeTruthy();
  });

  it('keeps RTF table cells apart', () => {
    expect(rtfText(String.raw`{\rtf1 \trowd A\cell B\cell\row C\cell D\cell\row}`)).toBe('A\tB\nC\tD\n');
  });

  it('pulls the UTF-16 text out of a binary Word file', () => {
    const text = '2023/05/01 醫療器材說明書 3,000字 NT$4,500\r2023/06/12 遊戲公告 1,200字 NT$1,800\r';
    const body = new Uint8Array(text.length * 2);
    for (let i = 0; i < text.length; i++) {
      body[i * 2] = text.charCodeAt(i) & 0xff;
      body[i * 2 + 1] = text.charCodeAt(i) >> 8;
    }
    const junk = new Uint8Array(301).map((_, i) => (i * 37) % 7);
    const out = docText(new Uint8Array([...junk, ...body, ...junk]));
    expect(out).toContain('2023/05/01 醫療器材說明書 3,000字 NT$4,500');
    expect(linesToGrid(out)?.length).toBe(3);
  });

  it('reads records typed as paragraphs in a .docx', async () => {
    const xml = '<w:document><w:body><w:p><w:r><w:t>接案紀錄</w:t></w:r></w:p><w:p><w:r><w:t>2023/05/01 說明書 3,000字 NT$4,500</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">2023/06/12 公告 </w:t></w:r><w:r><w:t>1,200字 NT$1,800</w:t></w:r></w:p></w:body></w:document>';
    expect(docxParagraphs(xml)).toBe('接案紀錄\n2023/05/01 說明書 3,000字 NT$4,500\n2023/06/12 公告 1,200字 NT$1,800');
    const file = new File([zipSync({ 'word/document.xml': strToU8(xml) })], 'records.docx');
    const t = await readTables(file);
    expect(t[0].grid[0]).toContain('金額');
    expect(t[0].grid).toHaveLength(3);
  });

  it('reads an Excel 97–2003 workbook: shared strings across CONTINUE records, dates and numbers', async () => {
    const data = new Uint8Array(fs.readFileSync('tests/fixtures/records.xls'));
    const sheets = readXls(data);
    expect(sheets.map((s) => s.name)).toEqual(['對帳單', 'long']);
    expect(sheets[0].grid[2]).toEqual(['案件名稱', '交稿日', '字數', '金額']);
    expect(sheets[0].grid[3]).toEqual(['醫療器材說明書', '2023-05-01', '3000', '4500']);
    expect(sheets[0].grid[4]).toEqual(['Game patch notes', '2023-06-12', '1200', '120.5']);
    // xlwt stores formulas without a cached result, so the total stays blank
    expect(sheets[0].grid).toHaveLength(5);
    expect(sheets[1].grid).toHaveLength(300);
    expect(sheets[1].grid[299][0]).toBe('譯者紀錄第299列 some longer english text to fill');
    const viaFile = await readTables(new File([data], 'records.xls'));
    expect(viaFile.length).toBe(2);
  });
});
