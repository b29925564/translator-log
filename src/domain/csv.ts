// CSV import/export so years of spreadsheet records can move in and out.

import { toISODate } from './dates';
import { parseQuickAdd } from './quickadd';
import type { JobStatus, Unit } from './types';

export const parseCSV = (text: string): string[][] => {
  const src = text.replace(/^﻿/, '');
  const delim = (() => {
    const first = src.split(/\r?\n/, 1)[0] ?? '';
    const counts = [',', ';', '\t'].map((d) => [d, first.split(d).length] as const);
    return counts.sort((a, b) => b[1] - a[1])[0][0];
  })();
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
};

export const toCSV = (rows: (string | number | undefined | null)[][]): string =>
  '﻿' +
  rows
    .map((r) =>
      r
        .map((v) => {
          const s = v == null ? '' : String(v);
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(','),
    )
    .join('\r\n');

export type ImportField =
  | 'date'
  | 'receivedAt'
  | 'dueAt'
  | 'deliveredAt'
  | 'paidAt'
  | 'client'
  | 'title'
  | 'pair'
  | 'sourceLang'
  | 'targetLang'
  | 'quantity'
  | 'unit'
  | 'rate'
  | 'currency'
  | 'amount'
  | 'status'
  | 'domain'
  | 'service'
  | 'catTool'
  | 'notes'
  | 'ref'
  | 'ignore';

const HEADER_HINTS: [ImportField, RegExp][] = [
  ['ref', /(PO\b|P\.O\.|訂單|工單|單號|編號|發票號碼|請款單號|invoice\s*(no|number|#)|job\s*(no|id|number|#)|order\s*(no|id|number|#)|reference|ref\b)/i],
  ['paidAt', /(收款日|入帳日|付款日|paid\s*(date|on)?|payment\s*date)/i],
  ['deliveredAt', /(交稿日|交件日|完成日|delivered|delivery\s*date|completed)/i],
  ['dueAt', /(截止|期限|deadline|due)/i],
  ['receivedAt', /(接案日|收件日|received|start|開始)/i],
  ['date', /^(日期|date|月份|month)$/i],
  ['client', /(客戶|公司|翻譯社|client|customer|agency|company)/i],
  ['pair', /(語言組合|語對|語言|language\s*pair|pair|languages?)/i],
  ['sourceLang', /(原文|來源語|source)/i],
  ['targetLang', /(譯文|目標語|target)/i],
  ['quantity', /(字數|數量|words?|word\s*count|volume|quantity|chars?)/i],
  ['unit', /(單位|unit)/i],
  ['rate', /(單價|費率|字價|rate|price\s*per)/i],
  ['currency', /(幣別|貨幣|currency)/i],
  ['amount', /(金額|總價|總額|稿費|收入|amount|total|fee|income)/i],
  ['status', /(狀態|status)/i],
  ['domain', /(領域|類別|專業|domain|field|subject)/i],
  ['service', /(服務|類型|service|type)/i],
  ['catTool', /(CAT|工具|tool)/i],
  ['notes', /(備註|附註|說明|notes?|comments?|memo)/i],
  ['title', /(案件|案名|名稱|標題|項目|專案|title|project|job|name|description)/i],
];

export const guessMapping = (headers: string[]): ImportField[] => {
  const used = new Set<ImportField>();
  return headers.map((h) => {
    const hit = HEADER_HINTS.find(([f, re]) => !used.has(f) && re.test(h.trim()));
    if (!hit) return 'ignore';
    used.add(hit[0]);
    return hit[0];
  });
};

export const parseNumber = (s: string | undefined): number | undefined => {
  if (!s) return undefined;
  const cleaned = s.replace(/[^\d.,-]/g, '');
  if (!cleaned) return undefined;
  // “1.234,56” European style
  const normalised = /,\d{1,2}$/.test(cleaned) && cleaned.includes('.') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned.replace(/,/g, '');
  const n = Number(normalised);
  return Number.isFinite(n) ? n : undefined;
};

export const parseDate = (s: string | undefined): string | undefined => {
  if (!s) return undefined;
  const t = s.trim();
  let m = /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/.exec(t);
  if (m) return toISODate(new Date(+m[1], +m[2] - 1, +m[3]));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(t);
  if (m) {
    // M/D/YYYY unless the first part cannot be a month
    const a = +m[1];
    const b = +m[2];
    const [mo, d] = a > 12 ? [b, a] : [a, b];
    return toISODate(new Date(+m[3], mo - 1, d));
  }
  m = /^(\d{2,3})[/.-](\d{1,2})[/.-](\d{1,2})$/.exec(t); // ROC year 113/05/20
  if (m && +m[1] < 200) return toISODate(new Date(+m[1] + 1911, +m[2] - 1, +m[3]));
  m = /^(\d{4})[-/.](\d{1,2})$/.exec(t);
  if (m) return toISODate(new Date(+m[1], +m[2] - 1, 1));
  if (/^\d{5}(\.\d+)?$/.test(t)) {
    // Excel serial date
    const ms = Math.round((Number(t) - 25569) * 86_400_000);
    const d = new Date(ms);
    return toISODate(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  return undefined;
};

export const parseStatus = (s: string | undefined, paid?: string): JobStatus => {
  const t = (s || '').toLowerCase();
  if (paid || /(已收|已付|入帳|paid|收款)/.test(t)) return 'paid';
  if (/(請款|發票|invoic)/.test(t)) return 'invoiced';
  if (/(取消|cancel)/.test(t)) return 'cancelled';
  if (/(詢價|報價|quote)/.test(t)) return 'quote';
  if (/(進行|翻譯中|active|progress|ongoing)/.test(t)) return 'active';
  return 'delivered';
};

export const parseUnit = (s: string | undefined): Unit | undefined => {
  const t = (s || '').toLowerCase();
  if (!t) return undefined;
  if (/(中文字|字元|char)/.test(t)) return 'char';
  if (/(小時|hour|hr)/.test(t)) return 'hour';
  if (/(分鐘|min)/.test(t)) return 'minute';
  if (/(頁|page)/.test(t)) return 'page';
  if (/(整案|flat|案|lump)/.test(t)) return 'flat';
  if (/(字|word)/.test(t)) return 'word';
  return undefined;
};

export const parsePair = (s: string | undefined, today: string, defaultTargetLang: string) => {
  if (!s) return {};
  const r = parseQuickAdd(s, { clients: [], today, baseCurrency: 'TWD', defaultTargetLang });
  return { sourceLang: r.sourceLang, targetLang: r.targetLang };
};
