// Reads tables out of the files companies send: spreadsheets (CSV, TSV,
// XLSX, ODS), web pages and Word documents. Everything runs locally.

import { strFromU8, unzipSync } from 'fflate';
import { parseCSV } from './csv';
import { toISODate } from './dates';

export type Grid = string[][];

const decode = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');

const colIndex = (ref: string) => {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

// built-in Excel number formats that are dates
const DATE_FORMAT_IDS = new Set([14, 15, 16, 17, 22, 27, 30, 36, 50, 57]);

const serialToISO = (v: number) => {
  const d = new Date(Math.round((v - 25569) * 86_400_000));
  return toISODate(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

/** Every sheet of an .xlsx file as a grid of display strings; dates become YYYY-MM-DD. */
export const readXlsx = (data: Uint8Array): { name: string; grid: Grid }[] => {
  const files = unzipSync(data);
  const read = (n: string) => (files[n] ? strFromU8(files[n]) : '');
  const shared = read('xl/sharedStrings.xml')
    .split('</si>')
    .slice(0, -1)
    .map((si) => {
      let s = '';
      // phonetic guides (<rPh>) are not part of the text
      for (const m of si.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)) s += m[1];
      return decode(s);
    });
  // which cell styles are date formats
  const styles = read('xl/styles.xml');
  const customDate = new Set<number>();
  for (const m of styles.matchAll(/<numFmt\s[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) {
    const code = decode(m[2]).replace(/"[^"]*"|\[[^\]]*\]/g, '');
    if (/[ymd]/i.test(code) && !/^[#0.,%\s]*$/.test(code)) customDate.add(Number(m[1]));
  }
  const xfs = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] ?? '';
  const dateStyle = [...xfs.matchAll(/<xf\s[^>]*?(?:\/>|>)/g)].map((m) => {
    const id = Number(/numFmtId="(\d+)"/.exec(m[0])?.[1] ?? 0);
    return DATE_FORMAT_IDS.has(id) || customDate.has(id);
  });
  // sheet names in workbook order
  const wb = read('xl/workbook.xml');
  const rels = read('xl/_rels/workbook.xml.rels');
  const target = new Map([...rels.matchAll(/<Relationship\s[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2].replace(/^\/?(xl\/)?/, 'xl/')]));
  const sheets = [...wb.matchAll(/<sheet\s[^>]*name="([^"]*)"[^>]*r:id="([^"]+)"/g)].map((m) => ({ name: decode(m[1]), path: target.get(m[2]) ?? '' }));
  const list = sheets.length ? sheets : Object.keys(files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort().map((path, i) => ({ name: `Sheet${i + 1}`, path }));

  return list.map(({ name, path }) => {
    const xml = read(path);
    const grid: Grid = [];
    for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const r = Number(/r="(\d+)"/.exec(row[0])?.[1] ?? grid.length + 1) - 1;
      const cells: string[] = [];
      for (const c of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1];
        const body = c[2] ?? '';
        const ref = /r="([A-Z]+)\d+"/.exec(attrs)?.[1];
        const i = ref ? colIndex(ref) : cells.length;
        const t = /t="([^"]+)"/.exec(attrs)?.[1];
        const s = Number(/s="(\d+)"/.exec(attrs)?.[1] ?? -1);
        const v = /<v>([^<]*)<\/v>/.exec(body)?.[1];
        let out = '';
        if (t === 's' && v != null) out = shared[Number(v)] ?? '';
        else if (t === 'inlineStr') out = decode([...body.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((m) => m[1]).join(''));
        else if (t === 'b') out = v === '1' ? 'TRUE' : 'FALSE';
        else if (v != null) out = s >= 0 && dateStyle[s] && /^\d+(\.\d+)?$/.test(v) ? serialToISO(Number(v)) : decode(v);
        cells[i] = out;
      }
      grid[r] = Array.from(cells, (x) => x ?? '');
    }
    return { name, grid: Array.from(grid, (x) => x ?? []) };
  });
};

/** Every sheet of an .ods file. */
export const readOds = (data: Uint8Array): { name: string; grid: Grid }[] => {
  const files = unzipSync(data);
  const xml = files['content.xml'] ? strFromU8(files['content.xml']) : '';
  return [...xml.matchAll(/<table:table\b[^>]*table:name="([^"]*)"[^>]*>([\s\S]*?)<\/table:table>/g)].map((t) => {
    const grid: Grid = [];
    for (const row of t[2].matchAll(/<table:table-row\b[^>]*>([\s\S]*?)<\/table:table-row>/g)) {
      const cells: string[] = [];
      for (const c of row[1].matchAll(/<table:table-cell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:table-cell>)/g)) {
        const repeat = Math.min(50, Number(/number-columns-repeated="(\d+)"/.exec(c[1])?.[1] ?? 1));
        const date = /office:date-value="(\d{4}-\d{2}-\d{2})/.exec(c[1])?.[1];
        const text = date ?? decode((c[2] ?? '').replace(/<\/text:p>/g, '\n').replace(/<[^>]+>/g, '')).trim();
        for (let k = 0; k < repeat; k++) cells.push(text);
      }
      while (cells.length && !cells[cells.length - 1]) cells.pop();
      grid.push(cells);
    }
    while (grid.length && !grid[grid.length - 1].length) grid.pop();
    return { name: decode(t[1]), grid };
  });
};

const cellText = (html: string) => decode(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** Tables in an HTML page (reports exported from vendor portals are often .html or .xls-as-html). */
export const readHtmlTables = (html: string): Grid[] =>
  [...html.matchAll(/<table\b[\s\S]*?<\/table>/gi)]
    .map((t) => [...t[0].matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map((tr) => [...tr[0].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => cellText(c[1]))))
    .filter((g) => g.length > 1);

/** Tables in a .docx file. */
export const readDocxTables = (data: Uint8Array): Grid[] => {
  const files = unzipSync(data);
  const xml = files['word/document.xml'] ? strFromU8(files['word/document.xml']) : '';
  return [...xml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)]
    .map((t) =>
      [...t[0].matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map((tr) =>
        [...tr[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map((tc) => decode([...tc[0].matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('')).trim()),
      ),
    )
    .filter((g) => g.length > 1);
};

export type FileKind = 'sheet' | 'pdf' | 'image' | 'text' | 'unsupported';

export const extOf = (name: string) => (name.split('.').pop() || '').toLowerCase();

export const fileKind = (name: string, type = ''): FileKind => {
  const ext = extOf(name);
  if (['csv', 'tsv', 'xlsx', 'xlsm', 'ods', 'html', 'htm', 'docx'].includes(ext)) return 'sheet';
  if (ext === 'pdf' || type === 'application/pdf') return 'pdf';
  if (/^image\//.test(type) || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'heic', 'heif', 'bmp'].includes(ext)) return 'image';
  if (['txt', 'md', 'eml', 'json', 'xml', 'text'].includes(ext) || /^text\//.test(type)) return 'text';
  if (ext === 'xls') return 'sheet'; // often HTML in disguise; checked when read
  return 'unsupported';
};

/** All tables found in a spreadsheet-like file, largest first. */
export const readTables = async (file: File): Promise<{ name: string; grid: Grid }[]> => {
  const ext = extOf(file.name);
  const bytes = async () => new Uint8Array(await file.arrayBuffer());
  let out: { name: string; grid: Grid }[] = [];
  if (ext === 'xlsx' || ext === 'xlsm') out = readXlsx(await bytes());
  else if (ext === 'ods') out = readOds(await bytes());
  else if (ext === 'docx') out = readDocxTables(await bytes()).map((grid, i) => ({ name: `#${i + 1}`, grid }));
  else if (ext === 'csv' || ext === 'tsv') out = [{ name: file.name, grid: parseCSV(await file.text()) }];
  else {
    const text = await file.text();
    if (/<table/i.test(text)) out = readHtmlTables(text).map((grid, i) => ({ name: `#${i + 1}`, grid }));
    else if (ext === 'xls') throw new Error('xls-binary');
  }
  return out.filter((t) => t.grid.some((r) => r.some((c) => c.trim()))).sort((a, b) => b.grid.length - a.grid.length);
};
