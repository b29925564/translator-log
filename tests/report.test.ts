import 'fake-indexeddb/auto';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { planImport } from '../src/db/reportApply';
import { DEFAULT_SETTINGS } from '../src/domain/constants';
import { guessMapping } from '../src/domain/csv';
import { clientMentioned, defaultAction, fillFromRow, findClient, findHeaderRow, gridToReport, matchReport, similarity, type ParsedReport } from '../src/domain/reportImport';
import { fileKind, readDocxTables, readHtmlTables, readOds, readXlsx } from '../src/domain/sheets';
import type { Client, Invoice, Job } from '../src/domain/types';

const job = (over: Partial<Job> = {}): Job => ({
  id: 'j' + Math.random(),
  createdAt: 0,
  updatedAt: 0,
  title: 't',
  service: 'translation',
  sourceLang: 'en',
  targetLang: 'zh-TW',
  tags: [],
  unit: 'word',
  quantity: 1000,
  rate: 0.1,
  currency: 'USD',
  fxToBase: 30,
  status: 'delivered',
  receivedAt: '2026-08-01',
  deliveredAt: '2026-08-10',
  ...over,
});
const client = (id: string, name: string): Client => ({ id, name, createdAt: 0, updatedAt: 0, kind: 'agency', currency: 'USD', paymentTermsDays: 30 });
const ctx = { today: '2026-09-25', defaultTargetLang: 'zh-TW' };

const xlsx = (sheets: Record<string, string>, shared: string[], styles = '') => {
  const names = Object.keys(sheets);
  return zipSync({
    'xl/workbook.xml': strToU8(`<workbook><sheets>${names.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<Relationships>${names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="ws" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`),
    'xl/sharedStrings.xml': strToU8(`<sst>${shared.map((s) => `<si><t>${s}</t></si>`).join('')}</sst>`),
    'xl/styles.xml': strToU8(styles),
    ...Object.fromEntries(names.map((n, i) => [`xl/worksheets/sheet${i + 1}.xml`, strToU8(`<worksheet><sheetData>${sheets[n]}</sheetData></worksheet>`)])),
  });
};

describe('file readers', () => {
  it('reads xlsx shared strings, numbers, gaps and date-styled cells', () => {
    const data = xlsx(
      {
        Statement: `<row r="1"><c r="A1" t="s"><v>0</v></c></row>
          <row r="3"><c r="A3" t="s"><v>1</v></c><c r="B3" t="s"><v>2</v></c><c r="D3" t="s"><v>3</v></c></row>
          <row r="4"><c r="A4" t="s"><v>4</v></c><c r="B4" s="1"><v>46245</v></c><c r="D4"><v>1234.5</v></c></row>`,
        Notes: `<row r="1"><c r="A1" t="inlineStr"><is><t>hello &amp; bye</t></is></c></row>`,
      },
      ['Pixelforge statement', 'Job', 'Date', 'Amount', 'Patch notes'],
      '<styleSheet><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>',
    );
    const [a, b] = readXlsx(data);
    expect(a.name).toBe('Statement');
    expect(a.grid[0]).toEqual(['Pixelforge statement']);
    expect(a.grid[1]).toEqual([]);
    expect(a.grid[2]).toEqual(['Job', 'Date', '', 'Amount']);
    expect(a.grid[3]).toEqual(['Patch notes', '2026-08-11', '', '1234.5']);
    expect(b.grid[0]).toEqual(['hello & bye']);
  });

  it('reads ods, html and docx tables', () => {
    const ods = zipSync({
      'content.xml': strToU8(
        '<office:document-content><table:table table:name="S1"><table:table-row><table:table-cell><text:p>Job</text:p></table:table-cell><table:table-cell table:number-columns-repeated="2"><text:p>x</text:p></table:table-cell></table:table-row><table:table-row><table:table-cell office:date-value="2026-09-01T00:00:00"><text:p>1/9</text:p></table:table-cell></table:table-row></table:table></office:document-content>',
      ),
    });
    expect(readOds(ods)[0].grid).toEqual([['Job', 'x', 'x'], ['2026-09-01']]);

    const html = '<p>x</p><table><tr><th>Job</th><th>Amount</th></tr><tr><td><b>A</b>&amp;B</td><td>NT$1,200</td></tr></table>';
    expect(readHtmlTables(html)).toEqual([[['Job', 'Amount'], ['A &B', 'NT$1,200']]]);

    const docx = zipSync({ 'word/document.xml': strToU8('<w:document><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Job</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t xml:space="preserve">Manual </w:t></w:r><w:r><w:t>v2</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:document>') });
    expect(readDocxTables(docx)).toEqual([[['Job'], ['Manual v2']]]);
  });

  it('sorts files into local and Claude-read kinds', () => {
    expect(fileKind('march.xlsx')).toBe('sheet');
    expect(fileKind('remittance.PDF')).toBe('pdf');
    expect(fileKind('IMG_0042.HEIC')).toBe('image');
    expect(fileKind('paste', 'image/png')).toBe('image');
    expect(fileKind('mail.eml')).toBe('text');
    expect(fileKind('app.exe')).toBe('unsupported');
  });
});

describe('reading a report', () => {
  const grid = [
    ['Harbor & Quill — Remittance advice'],
    ['Payment date: 2026/09/20'],
    [],
    ['PO No.', 'Project', 'Amount (USD)'],
    ['PO-7781', 'Patch notes v1.3', '200.00'],
    ['PO-7790', 'Store page copy', '1,050'],
    ['', '', ''],
    ['Total', '', '1,250'],
    ['合計', '', '1,250'],
  ];

  it('finds the header below a title block', () => {
    expect(findHeaderRow(grid)).toBe(3);
    expect(guessMapping(grid[3])).toEqual(['ref', 'title', 'amount']);
  });

  it('skips totals and recognises a payment statement with its date', () => {
    const r = gridToReport(grid, 3, guessMapping(grid[3]), ctx);
    expect(r.kind).toBe('payments');
    expect(r.paidAt).toBe('2026-09-20');
    expect(r.rows).toHaveLength(2);
    expect(r.rows[1]).toMatchObject({ ref: 'PO-7790', title: 'Store page copy', amount: 1050 });
  });

  it('treats a list with volumes as jobs', () => {
    const g = [['Job name', 'Words', 'Rate', 'Due date'], ['Manual', '3,000', '0.08', '2026-10-01']];
    const r = gridToReport(g, 0, guessMapping(g[0]), ctx);
    expect(r.kind).toBe('jobs');
    expect(r.rows[0]).toMatchObject({ title: 'Manual', quantity: 3000, rate: 0.08, dueAt: '2026-10-01' });
  });
});

describe('matching rows to jobs', () => {
  const clients = [client('c1', 'Harbor & Quill'), client('c2', '光譜翻譯社')];
  const a = job({ id: 'a', title: 'Patch notes v1.3', clientId: 'c1', quantity: 2000, rate: 0.1 });
  const b = job({ id: 'b', title: 'Store page copy', clientId: 'c1', poNumber: 'PO-7790', quantity: 10500, rate: 0.1 });
  const c = job({ id: 'c', title: '醫療器材說明書', clientId: 'c2', currency: 'TWD', unit: 'char', quantity: 10000, rate: 1 });
  const d = job({ id: 'd', title: 'Another thing', clientId: 'c1', quantity: 2000, rate: 0.1, deliveredAt: '2025-01-01' });
  const inv: Invoice = { id: 'i1', createdAt: 0, updatedAt: 0, number: 'INV-2026-031', clientId: 'c2', issueDate: '2026-08-20', currency: 'TWD', jobIds: ['c'], lang: 'zh', status: 'sent' };

  it('uses invoice numbers, PO numbers, amounts and titles in that order', () => {
    const report: ParsedReport = {
      kind: 'payments',
      rows: [
        { ref: 'PO-7790', amount: 1050 },
        { title: 'patch notes 1.3', amount: 200, client: 'Harbor and Quill' },
        { ref: 'inv 2026 031' },
        { title: '說明書 醫療器材', amount: 10000 },
      ],
    };
    const m = matchReport(report, { jobs: [a, b, c, d], invoices: [inv], clients });
    expect(m[0]).toMatchObject({ jobIds: ['b'], why: 'ref' });
    expect(m[1].jobIds).toEqual(['a']);
    expect(m[2]).toMatchObject({ jobIds: ['c'], invoiceId: 'i1', why: 'invoice' });
    // job c is already taken by the invoice row
    expect(m[3].jobIds).toEqual([]);
  });

  it('prefers a job near the report date when amounts tie', () => {
    const m = matchReport({ kind: 'payments', paidAt: '2026-09-20', rows: [{ amount: 200 }] }, { jobs: [d, a], invoices: [], clients });
    expect(m[0].jobIds).toEqual(['a']);
  });

  it('does not settle a payment against work already paid', () => {
    const paid = job({ id: 'p', title: 'Store page copy', clientId: 'c1', status: 'paid' });
    const open = job({ id: 'o', title: 'Store page copy', clientId: 'c1', deliveredAt: '2026-09-01' });
    const m = matchReport({ kind: 'payments', rows: [{ title: 'Store page copy' }] }, { jobs: [paid, open], invoices: [], clients });
    expect(m[0].jobIds).toEqual(['o']);
    expect(matchReport({ kind: 'payments', rows: [{ title: 'Store page copy' }] }, { jobs: [paid], invoices: [], clients })[0].jobIds).toEqual([]);
  });

  it('scores CJK titles by shared bigrams and finds clients loosely', () => {
    expect(similarity('醫療器材說明書', '說明書（醫療器材）')).toBeGreaterThan(0.8);
    expect(similarity('Patch notes', 'Store page')).toBe(0);
    expect(similarity('SaaS onboard', 'SaaS onboarding emails')).toBe(1);
    expect(findClient('光譜翻譯社有限公司', clients)?.id).toBe('c2');
  });

  it('spots a known client in a report title block', () => {
    expect(clientMentioned('光譜翻譯社 2026 年 9 月對帳單', clients)?.id).toBe('c2');
    expect(clientMentioned('HARBOR & QUILL — Remittance', clients)?.id).toBe('c1');
    expect(clientMentioned('Monthly statement', clients)).toBeUndefined();
  });

  it('defaults to settling payments and updating job lists', () => {
    const jobs = new Map([a, b].map((j) => [j.id, j]));
    expect(defaultAction('payments', { jobIds: ['a'], score: 1 }, jobs)).toBe('paid');
    expect(defaultAction('payments', { jobIds: [], score: 0 }, jobs)).toBe('skip');
    expect(defaultAction('jobs', { jobIds: [], score: 0 }, jobs)).toBe('new');
    expect(defaultAction('jobs', { jobIds: ['a'], score: 1 }, jobs)).toBe('update');
    expect(defaultAction('payments', { jobIds: ['x'], score: 1 }, new Map([['x', job({ status: 'paid' })]]))).toBe('skip');
  });

  it('only fills fields the job lacks', () => {
    expect(fillFromRow(job({ poNumber: undefined, dueAt: '2026-01-01' }), { ref: 'PO-1', dueAt: '2026-02-02', rate: 0.2 })).toEqual({ poNumber: 'PO-1' });
  });
});

describe('planning the import', () => {
  const settings = { ...DEFAULT_SETTINGS, baseCurrency: 'TWD' };
  const clients = [client('c1', 'Harbor & Quill')];
  const a = job({ id: 'a', title: 'Patch notes', clientId: 'c1' });
  const inv: Invoice = { id: 'i1', createdAt: 0, updatedAt: 0, number: 'INV-9', clientId: 'c1', issueDate: '2026-08-20', currency: 'USD', jobIds: ['a'], lang: 'en', status: 'sent' };

  it('marks matches paid on the statement date, settles invoices and adds the rest', () => {
    const report: ParsedReport = { kind: 'payments', client: 'Pixel Harbor Studio', currency: 'USD', paidAt: '2026-09-20', rows: [{ ref: 'INV-9' }, { title: 'Trailer subtitles', amount: 300 }, { title: 'Ignored' }] };
    const matches = matchReport(report, { jobs: [a], invoices: [inv], clients });
    const plan = planImport(report, matches, ['paid', 'new', 'skip'], { jobs: [a], invoices: [inv], clients, settings, today: '2026-09-25' });
    expect(plan.counts).toEqual({ paid: 1, updated: 0, created: 1 });
    const paid = plan.jobs.find((j) => j.id === 'a')!;
    expect(paid).toMatchObject({ status: 'paid', paidAt: '2026-09-20' });
    expect(plan.invoices[0]).toMatchObject({ id: 'i1', status: 'paid', paidAt: '2026-09-20' });
    const added = plan.jobs.find((j) => j.id !== 'a')!;
    expect(added).toMatchObject({ title: 'Trailer subtitles', unit: 'flat', rate: 300, currency: 'USD', status: 'paid', paidAt: '2026-09-20' });
    expect(plan.clients.map((c) => c.name)).toEqual(['Pixel Harbor Studio']);
    expect(added.clientId).toBe(plan.clients[0].id);
  });

  it('turns a job list into new jobs with rate from amount', () => {
    const report: ParsedReport = { kind: 'jobs', rows: [{ title: 'Manual', client: 'Harbor & Quill', quantity: 2000, amount: 160, dueAt: '2026-10-01', status: 'active' }] };
    const plan = planImport(report, [{ jobIds: [], score: 0 }], ['new'], { jobs: [], invoices: [], clients, settings, today: '2026-09-25' });
    expect(plan.jobs[0]).toMatchObject({ title: 'Manual', clientId: 'c1', currency: 'USD', unit: 'word', quantity: 2000, rate: 0.08, status: 'active', dueAt: '2026-10-01', progress: 0 });
    expect(plan.jobs[0].deliveredAt).toBeUndefined();
    expect(plan.clients).toEqual([]);
  });
});
