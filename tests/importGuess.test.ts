import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { planImport } from '../src/db/reportApply';
import { DEFAULT_SETTINGS } from '../src/domain/constants';
import { guessColumns, guessFromContent, guessMapping } from '../src/domain/csv';
import { findTemplate, headerSignature, type ImportTemplate } from '../src/domain/importTemplates';
import { defaultAction, findHeaderRow, gridToReport, matchReport } from '../src/domain/reportImport';
import type { Job } from '../src/domain/types';

describe('guessFromContent', () => {
  it('names columns a vendor labelled in its own words from their values', () => {
    const grid = [
      ['Ticket', 'Start', 'End', 'Langs', 'Vol', 'Each', 'Sum', 'Cur', 'Desc'],
      ['A-1', '2024-01-03', '2024-01-05', 'EN>ZH', '1200', '0.08', '$96.00', 'USD', 'Onboarding emails batch'],
      ['A-2', '2024-02-10', '2024-02-12', 'en-US → zh-TW', '3,400', '0.08', '$272.00', 'USD', 'Help center articles'],
      ['A-3', '2024-03-01', '2024-03-02', '英翻中', '800', '0.1', '$80.00', 'USD', 'Release notes for app'],
    ];
    expect(guessMapping(grid[0])).toEqual(['ignore', 'receivedAt', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore']);
    expect(guessColumns(grid, 0)).toEqual(['ignore', 'receivedAt', 'deliveredAt', 'pair', 'quantity', 'rate', 'amount', 'currency', 'title']);
  });

  it('never overrides a match made from the header', () => {
    const headers = ['字數', '日期', 'x'];
    const rows = [
      ['2024-01-01', '1200', '999'],
      ['2024-01-02', '1500', '888'],
    ];
    expect(guessFromContent(headers, rows, guessMapping(headers))).toEqual(['quantity', 'date', 'amount']);
  });

  it('reads a sheet with no header row at all', () => {
    const grid = [
      ['2023/05/01', '醫療器材說明書翻譯', '3000', '4,500'],
      ['2023/06/12', '遊戲更新公告翻譯', '1200', '1,800'],
      ['2023/07/02', '年報摘要翻譯', '5000', '7,500'],
    ];
    const h = findHeaderRow(grid);
    const m = guessColumns(grid, h);
    expect(m).toEqual(['date', 'title', 'quantity', 'amount']);
  });

  it('takes a payment date by its header, and two integer columns as volume and amount', () => {
    const headers = ['入帳', 'a', 'b'];
    const rows = [
      ['2024-05-01', '1200', '3600'],
      ['2024-05-02', '1500', '4500'],
    ];
    expect(guessFromContent(headers, rows, guessMapping(headers))).toEqual(['paidAt', 'quantity', 'amount']);
  });
});

describe('import templates', () => {
  const tpl = (headers: string[], mapping: ImportTemplate['mapping'], header = 0): ImportTemplate => ({ sig: headerSignature(headers), headers, mapping, header, name: 'Harbor', clientId: 'c1', lastUsed: 1 });

  it('applies the saved layout to the same header row', () => {
    const t = tpl(['Ref', 'Col A', 'Col B'], ['ref', 'title', 'amount']);
    const hit = findTemplate([[' ref ', 'col a', 'COL B'], ['1', 'x', '2']], 0, [t]);
    expect(hit?.mapping).toEqual(['ref', 'title', 'amount']);
    expect(hit?.template.clientId).toBe('c1');
  });

  it('follows columns by name when the vendor moved or added one', () => {
    const t = tpl(['Ref', 'Col A', 'Col B', 'Col C', 'Col D'], ['ref', 'title', 'amount', 'quantity', 'date']);
    const hit = findTemplate([['Col B', 'Ref', 'Col A', 'Col C', 'Col D', 'Col E'], []], 0, [t]);
    expect(hit?.mapping).toEqual(['amount', 'ref', 'title', 'quantity', 'date', 'ignore']);
    expect(findTemplate([['Ref', 'Other', 'Stuff', 'Col D']], 0, [t])).toBeUndefined();
  });

  it('finds the header row the template saved even when the guess lands elsewhere', () => {
    const t = tpl(['Col A', 'Col B'], ['title', 'amount'], 2);
    const hit = findTemplate([['Statement'], ['Vendor'], ['Col A', 'Col B'], ['x', '1']], 0, [t]);
    expect(hit?.header).toBe(2);
  });
});

describe('importing the same file twice', () => {
  const ctx = { today: '2026-09-01', defaultTargetLang: 'zh-TW' };
  const settings = { ...DEFAULT_SETTINGS, baseCurrency: 'TWD' };
  const run = (grid: string[][], jobs: Job[]) => {
    const h = findHeaderRow(grid);
    const report = gridToReport(grid, h, guessColumns(grid, h), ctx);
    const matches = matchReport(report, { jobs, invoices: [], clients: [] });
    const actions = report.rows.map((_, i) => defaultAction(report.kind, matches[i], new Map(jobs.map((j) => [j.id, j]))));
    return planImport(report, matches, actions, { jobs, invoices: [], clients: [], settings, today: ctx.today });
  };

  it('matches every row to the jobs the first import created', () => {
    const grid = [
      ['案件名稱', '交稿日', '字數', '金額'],
      ['醫療器材說明書', '2023-05-01', '3000', '4500'],
      ['Translation', '2023-05-03', '1000', '1500'],
      ['Translation', '2023-05-09', '2000', '3000'],
      ['', '2023-06-01', '800', '1200'],
    ];
    const first = run(grid, []);
    expect(first.counts.created).toBe(4);
    const second = run(grid, first.jobs);
    expect(second.counts.created).toBe(0);
  });

  it('skips payments already recorded as paid', () => {
    const grid = [
      ['Remittance'],
      ['Project', 'Amount'],
      ['Menu', '50'],
      ['Poster', '80'],
    ];
    const h = findHeaderRow(grid);
    const report = { ...gridToReport(grid, h, guessColumns(grid, h), ctx), paidAt: '2026-08-01' };
    const jobs: Job[] = [];
    const firstPlan = planImport(report, report.rows.map(() => ({ jobIds: [], score: 0 })), ['new', 'new'], { jobs, invoices: [], clients: [], settings, today: ctx.today });
    const again = matchReport(report, { jobs: firstPlan.jobs, invoices: [], clients: [] });
    const acts = again.map((m) => defaultAction('payments', m, new Map(firstPlan.jobs.map((j) => [j.id, j]))));
    expect(acts).toEqual(['skip', 'skip']);
  });
});
