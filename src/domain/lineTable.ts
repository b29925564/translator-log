// Records kept as lines of text rather than a table: a Word list, an email,
// a text PDF, an old .doc or .rtf. Each line that reads like a job
// (“2023/05/01 某案名 3,000字 NT$4,500”) becomes a row with the date, pair,
// volume, rate and amount pulled out and the rest kept as the title, so it
// goes through the same column mapping as a spreadsheet. Runs locally.

import { guessMapping, parseCSV } from './csv';
import { findHeaderRow } from './reportImport';
import type { Grid } from './sheets';

/** Pasted or plain-text content that is really a table (copied cells arrive as TSV). */
export const asTable = (text: string): Grid | undefined => {
  const grid = parseCSV(text.trim());
  if (grid.length < 2) return undefined;
  const h = findHeaderRow(grid);
  const width = grid[h].length;
  if (width < 3) return undefined;
  const even = grid.filter((r) => r.length === width).length / grid.length;
  const known = guessMapping(grid[h]).filter((f) => f !== 'ignore').length;
  return even >= 0.6 && known >= 2 ? grid : undefined;
};

const DATE = /(?<![\d/.-])(\d{4}\s*[-/.年]\s*\d{1,2}\s*[-/.月]\s*\d{1,2}\s*日?|\d{2,3}\s*[/.年]\s*\d{1,2}\s*[/.月]\s*\d{1,2}\s*日?|\d{1,2}[/.-]\d{1,2}[/.-]\d{4})(?![\d/.-])/g;
const LANG = '(?:[a-z]{2,3}(?:[-_][a-z]{2,4})?)';
const ZH_LANG = '[英中日韓德法西義俄葡越泰印台華][文語]?';
const PAIR = new RegExp(`(?<![\\p{L}])(${LANG}\\s*(?:>|→|->|⇒|›|/)\\s*${LANG}|${ZH_LANG}\\s*(?:翻|譯|→|>|到)\\s*${ZH_LANG})(?![\\p{L}])`, 'giu');
const CUR = '(?:NT\\$|US\\$|HK\\$|S\\$|A\\$|C\\$|\\$|€|£|¥|￥|NTD|TWD|USD|EUR|GBP|JPY|CNY|RMB|HKD|SGD|AUD|CAD|KRW|MYR|CHF)';
const NUM = '\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?';
const RATE = new RegExp(`(?:@\\s*${CUR}?\\s*(${NUM})|${CUR}?\\s*(${NUM})\\s*(?:元)?\\s*/\\s*(?:字|詞|word|w|char|字元|頁|page|hr|hour|小時))`, 'gi');
const QTY = new RegExp(`(${NUM})\\s*(中文字|字元|字|words?|wds?|chars?|characters?|頁|pages?|小時|hrs?|hours?|分鐘|mins?|minutes?)(?![a-z])`, 'gi');
const MONEY = new RegExp(`(${CUR})\\s*(${NUM})|(${NUM})\\s*(元|塊|${CUR})(?![a-z])`, 'gi');
const BARE = new RegExp(`(?<![\\w.])(${NUM})(?![\\w.])`, 'g');

const CURRENCY = (s: string) => {
  const t = s.toUpperCase().replace(/\s/g, '');
  if (/^(NT\$|NTD|TWD|元|塊)$/.test(t)) return 'TWD';
  if (/^(US\$|\$|USD)$/.test(t)) return 'USD';
  if (t === '€') return 'EUR';
  if (t === '£') return 'GBP';
  if (/^(¥|￥)$/.test(t)) return 'JPY';
  if (t === 'RMB') return 'CNY';
  if (t === 'HK$') return 'HKD';
  if (t === 'S$') return 'SGD';
  if (t === 'A$') return 'AUD';
  if (t === 'C$') return 'CAD';
  return t;
};

export interface LineRecord {
  dates: string[];
  pair?: string;
  quantity?: string;
  unit?: string;
  rate?: string;
  amount?: string;
  currency?: string;
  title: string;
}

/** Pulls the parts of one line apart; undefined when the line is not a record. */
export const parseRecordLine = (line: string): LineRecord | undefined => {
  let rest = ` ${line.replace(/[\t|｜]+/g, '  ')} `;
  const take = (re: RegExp, fn: (m: RegExpExecArray) => void) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    const hits: RegExpExecArray[] = [];
    while ((m = re.exec(rest))) hits.push(m);
    for (const h of hits) fn(h);
    for (const h of hits.reverse()) rest = rest.slice(0, h.index) + '  ' + rest.slice(h.index + h[0].length);
  };
  const r: LineRecord = { dates: [], title: '' };
  take(DATE, (m) => r.dates.push(m[1].replace(/\s+|日/g, '').replace(/[年月]/g, '/')));
  take(PAIR, (m) => (r.pair ??= m[1].trim()));
  take(RATE, (m) => (r.rate ??= m[1] ?? m[2]));
  take(QTY, (m) => {
    if (r.quantity) return;
    r.quantity = m[1];
    r.unit = m[2];
  });
  take(MONEY, (m) => {
    if (r.amount) return;
    r.amount = m[2] ?? m[3];
    r.currency = CURRENCY(m[1] ?? m[4]);
  });
  const bare: string[] = [];
  take(BARE, (m) => bare.push(m[1]));
  if (!r.amount && bare.length) r.amount = bare.pop();
  if (!r.quantity && bare.length && /^[\d,]+$/.test(bare[0])) r.quantity = bare.shift();
  if (!r.rate && bare.length && Number(bare[0]) < 20 && /\./.test(bare[0])) r.rate = bare.shift();
  r.title = rest
    .replace(/(?:^|\s)[-–—~～:：,，;；、·•*]+(?=\s|$)/g, ' ')
    .replace(/^[\s\-–—•*·\d.)]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  const facts = (r.dates.length ? 1 : 0) + (r.pair ? 1 : 0) + (r.quantity ? 1 : 0) + (r.amount ? 1 : 0);
  // a date or pair plus a number, or a named line with an amount
  if (!(r.quantity || r.amount)) return undefined;
  if (facts < 2 && !(r.title && r.amount && r.currency)) return undefined;
  return r;
};

/** Lines that read as records, as a grid under column names the mapping already knows. */
export const linesToGrid = (text: string): Grid | undefined => {
  const recs = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map(parseRecordLine)
    .filter((r): r is LineRecord => !!r);
  if (recs.length < 2) return undefined;
  const nDates = Math.min(2, Math.max(...recs.map((r) => r.dates.length)));
  const cols: [string, (r: LineRecord) => string | undefined][] = [];
  if (nDates === 1) cols.push(['日期', (r) => r.dates[0]]);
  if (nDates === 2) cols.push(['接案日', (r) => r.dates[0]], ['交稿日', (r) => r.dates[1]]);
  const add = (name: string, get: (r: LineRecord) => string | undefined) => recs.some(get) && cols.push([name, get]);
  add('案件名稱', (r) => r.title || undefined);
  add('語言組合', (r) => r.pair);
  add('字數', (r) => r.quantity);
  add('單位', (r) => r.unit);
  add('單價', (r) => r.rate);
  add('金額', (r) => r.amount);
  add('幣別', (r) => r.currency);
  return [cols.map((c) => c[0]), ...recs.map((r) => cols.map((c) => c[1](r) ?? ''))];
};

/** A table if the text is one, otherwise the lines that read as records. */
export const textToGrid = (text: string): Grid | undefined => asTable(text) ?? linesToGrid(text);

// ---------- text out of old document formats ----------

/** Plain text of an RTF document; table cells become tabs so a table survives. */
export const rtfText = (rtf: string): string => {
  const out: string[] = [];
  let bytes: number[] = [];
  const cp = /\\ansicpg(\d+)/.exec(rtf)?.[1];
  const decoder = (() => {
    const name = cp === '950' ? 'big5' : cp === '936' ? 'gbk' : cp === '932' ? 'shift_jis' : cp === '949' ? 'euc-kr' : cp ? `windows-${cp}` : 'windows-1252';
    try {
      return new TextDecoder(name);
    } catch {
      return new TextDecoder('windows-1252');
    }
  })();
  const flush = () => {
    if (bytes.length) out.push(decoder.decode(new Uint8Array(bytes)));
    bytes = [];
  };
  const put = (s: string) => {
    flush();
    out.push(s);
  };
  // groups that hold no body text
  const SKIP = /^(fonttbl|colortbl|stylesheet|info|pict|object|header|footer|headerl|headerr|footerl|footerr|listtable|listoverridetable|rsidtbl|xmlnstbl|themedata|colorschememapping|latentstyles|datastore|generator)$/;
  const stack: { skip: boolean; uc: number }[] = [{ skip: false, uc: 1 }];
  let skipChars = 0;
  for (let i = 0; i < rtf.length; i++) {
    const ch = rtf[i];
    const top = stack[stack.length - 1];
    if (ch === '{') {
      stack.push({ ...top });
      continue;
    }
    if (ch === '}') {
      if (stack.length > 1) stack.pop();
      continue;
    }
    if (ch === '\\') {
      const next = rtf[i + 1];
      if (next === "'") {
        const b = parseInt(rtf.slice(i + 2, i + 4), 16);
        i += 3;
        if (skipChars > 0) skipChars--;
        else if (!top.skip) bytes.push(b);
        continue;
      }
      if (next === '*') {
        top.skip = true;
        i++;
        continue;
      }
      if (next === '\\' || next === '{' || next === '}') {
        i++;
        if (!top.skip) put(next);
        continue;
      }
      if (next === '~') {
        i++;
        if (!top.skip) put(' ');
        continue;
      }
      const m = /^([a-z]+)(-?\d+)? ?/i.exec(rtf.slice(i + 1, i + 40));
      if (!m) {
        i++;
        continue;
      }
      i += m[0].length;
      const [, word, arg] = m;
      if (SKIP.test(word)) top.skip = true;
      else if (word === 'uc') top.uc = Number(arg ?? 1);
      else if (word === 'u' && !top.skip) {
        const n = Number(arg);
        put(String.fromCharCode(n < 0 ? n + 65536 : n));
        skipChars = top.uc;
      } else if (!top.skip && (word === 'par' || word === 'line' || word === 'row' || word === 'sect' || word === 'page')) put('\n');
      else if (!top.skip && (word === 'cell' || word === 'tab')) put('\t');
      continue;
    }
    if (ch === '\r' || ch === '\n') continue;
    if (skipChars > 0) {
      skipChars--;
      continue;
    }
    if (!top.skip) put(ch);
  }
  flush();
  return out
    .join('')
    .split('\n')
    .map((l) => l.replace(/\t+$/, '').trimEnd())
    .join('\n');
};

/**
 * Best-effort text of an old binary Word (.doc) file. Word 97–2003 keeps
 * its text as UTF-16 or single-byte runs; table cells end in 0x07. The
 * reading that yields more letters wins.
 */
export const docText = (data: Uint8Array): string => {
  const keep = (c: number) => c === 9 || c === 7 || c === 13 || c === 10 || (c >= 32 && c !== 0x7f && !(c >= 0xd800 && c <= 0xdfff) && c < 0xfff0);
  const runs = (chars: number[]) => {
    const lines: string[] = [];
    let run = '';
    const end = () => {
      if ([...run].filter((c) => /[\p{L}\p{N}]/u.test(c)).length >= 3) lines.push(run);
      run = '';
    };
    for (const c of chars) {
      if (!keep(c)) end();
      else run += c === 7 ? '\t' : c === 13 ? '\n' : String.fromCharCode(c);
    }
    end();
    return lines.join('\n');
  };
  const wide = (off: number) => {
    const chars: number[] = [];
    for (let i = off; i + 1 < data.length; i += 2) chars.push(data[i] | (data[i + 1] << 8));
    return runs(chars);
  };
  const narrow = () => runs(Array.from(data, (b) => (b >= 0x80 && b < 0xa0 ? 0 : b)));
  const score = (s: string) => (s.match(/[\p{Script=Han}]|[a-z]{3,}|\d/giu) ?? []).length;
  const tries = [wide(0), wide(1), narrow()];
  return tries
    .sort((a, b) => score(b) - score(a))[0]
    .split('\n')
    .map((l) => l.replace(/\t+$/, '').trim())
    .filter(Boolean)
    .join('\n');
};

/** Paragraph text of a .docx, for records written as lines instead of a table. */
export const docxParagraphs = (xml: string): string =>
  [...xml.matchAll(/<w:p[\s>][\s\S]*?<\/w:p>/g)]
    .map((p) =>
      [...p[0].matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g)]
        .map((m) => (m[0] === '<w:tab/>' ? '\t' : m[0] === '<w:br/>' ? '\n' : m[1]))
        .join(''),
    )
    .join('\n')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
