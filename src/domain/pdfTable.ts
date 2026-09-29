// Rebuilds the table in a text PDF from where each piece of text sits on the
// page. pdf.js hands back positioned strings; lines come from shared
// baselines, columns from the x ranges that rows keep filling. Running page
// headers and footers are dropped. Pure, so it is tested without pdf.js.

import { guessMapping } from './csv';
import { findHeaderRow } from './reportImport';
import type { Grid } from './sheets';

export interface PdfItem {
  str: string;
  /** Left edge, in PDF points. */
  x: number;
  /** Baseline; grows upward as in PDF space. */
  y: number;
  width: number;
  /** Font size; 0 when unknown. */
  height?: number;
  page: number;
}

interface Cell {
  text: string;
  x0: number;
  x1: number;
}

interface Line {
  page: number;
  y: number;
  cells: Cell[];
}

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}，。、：；（）「」]/u;

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** Joins two pieces of one cell: no space between CJK characters, one space otherwise. */
const join = (a: string, b: string, gap: number, size: number) => {
  if (!a) return b;
  if (/\s$/.test(a) || /^\s/.test(b)) return a + b;
  if (CJK.test(a.slice(-1)) && CJK.test(b[0])) return a + b;
  return gap > size * 0.15 ? `${a} ${b}` : a + b;
};

/** Strings on one baseline, split wherever the gap is wider than a word space. */
const toLines = (items: PdfItem[], size: number): Line[] => {
  const lines: Line[] = [];
  const pages = [...new Set(items.map((i) => i.page))].sort((a, b) => a - b);
  for (const p of pages) {
    const onPage = items.filter((i) => i.page === p).sort((a, b) => b.y - a.y || a.x - b.x);
    let cur: PdfItem[] = [];
    const flush = () => {
      if (!cur.length) return;
      cur.sort((a, b) => a.x - b.x);
      const cells: Cell[] = [];
      for (const it of cur) {
        const last = cells[cells.length - 1];
        const gap = last ? it.x - last.x1 : Infinity;
        if (last && gap <= size * 0.6) {
          last.text = join(last.text, it.str, gap, size);
          last.x1 = Math.max(last.x1, it.x + it.width);
        } else cells.push({ text: it.str, x0: it.x, x1: it.x + it.width });
      }
      for (const c of cells) c.text = c.text.replace(/\s+/g, ' ').trim();
      lines.push({ page: p, y: cur[0].y, cells: cells.filter((c) => c.text) });
      cur = [];
    };
    for (const it of onPage) {
      if (cur.length && Math.abs(cur[0].y - it.y) > size * 0.45) flush();
      cur.push(it);
    }
    flush();
  }
  return lines.filter((l) => l.cells.length);
};

const lineKey = (l: Line) =>
  l.cells
    .map((c) => c.text)
    .join('|')
    .toLowerCase()
    .replace(/\d+/g, '#')
    .replace(/\s+/g, '');

/**
 * Lines printed on every page (letterhead, “Page 1 of 3”) are dropped. A
 * repeated column header or letterhead is kept once, where it first appears,
 * since it can name the client; footers go entirely.
 */
const dropRunningLines = (lines: Line[], size: number): Line[] => {
  const pages = new Set(lines.map((l) => l.page));
  if (pages.size < 2) return lines;
  const byKey = new Map<string, Line[]>();
  for (const l of lines) byKey.set(lineKey(l), [...(byKey.get(lineKey(l)) ?? []), l]);
  const drop = new Set<Line>();
  for (const same of byKey.values()) {
    const on = new Set(same.map((l) => l.page));
    if (on.size < pages.size) continue;
    // printed at about the same height each time
    const at = same.map((l) => l.y);
    if (Math.max(...at) - Math.min(...at) > size * 4 && on.size < same.length) continue;
    const first = same[0];
    const ys = lines.filter((l) => l.page === first.page).map((l) => l.y);
    const top = first.y >= median(ys);
    same.forEach((l, i) => (!top || i > 0) && drop.add(l));
  }
  return lines.filter((l) => !drop.has(l));
};

/**
 * Column bands: x ranges that rows keep covering. Stray text that spills
 * across a gap in only a few rows does not merge two columns.
 */
const toBands = (lines: Line[]): [number, number][] => {
  const rows = lines.filter((l) => l.cells.length >= 2);
  if (!rows.length) return [];
  const lo = Math.floor(Math.min(...rows.flatMap((l) => l.cells.map((c) => c.x0))));
  const hi = Math.ceil(Math.max(...rows.flatMap((l) => l.cells.map((c) => c.x1))));
  const cover = new Array<number>(hi - lo + 1).fill(0);
  for (const l of rows) {
    const seen = new Uint8Array(cover.length);
    for (const c of l.cells) for (let x = Math.floor(c.x0) - lo; x <= Math.ceil(c.x1) - lo; x++) seen[x] = 1;
    seen.forEach((v, i) => (cover[i] += v));
  }
  const floor = Math.max(0, Math.floor(rows.length * 0.12));
  const bands: [number, number][] = [];
  let start = -1;
  cover.forEach((v, i) => {
    if (v > floor && start < 0) start = i;
    if ((v <= floor || i === cover.length - 1) && start >= 0) {
      bands.push([start + lo, (v > floor ? i : i - 1) + lo]);
      start = -1;
    }
  });
  return bands;
};

const bandOf = (c: Cell, bands: [number, number][]) => {
  let best = 0;
  let most = -Infinity;
  bands.forEach(([a, b], i) => {
    const overlap = Math.min(b, c.x1) - Math.max(a, c.x0);
    const mid = (c.x0 + c.x1) / 2;
    const score = overlap > 0 ? overlap : -Math.min(Math.abs(mid - a), Math.abs(mid - b));
    if (score > most) {
      most = score;
      best = i;
    }
  });
  return best;
};

/** Neighbouring columns that never both hold text on one row are one column (a header set off from its right-aligned numbers). */
const mergeExclusive = (grid: Grid): Grid => {
  let g = grid;
  for (let i = 0; i < (g[0]?.length ?? 0) - 1; ) {
    const clash = g.some((r) => r[i] && r[i + 1]);
    const used = g.filter((r) => r[i] || r[i + 1]).length;
    if (!clash && used >= 2) g = g.map((r) => [...r.slice(0, i), r[i] || r[i + 1], ...r.slice(i + 2)]);
    else i++;
  }
  return g;
};

/** The text of a PDF as one grid: a row per line, a column per band. */
export const pdfItemsToGrid = (items: PdfItem[]): Grid => {
  const clean = items.filter((i) => i.str && i.str.trim());
  if (!clean.length) return [];
  const size = median(clean.map((i) => i.height || 0).filter((h) => h > 0)) || 10;
  const lines = dropRunningLines(toLines(clean, size), size);
  const bands = toBands(lines);
  if (!bands.length) return lines.map((l) => [l.cells.map((c) => c.text).join(' ')]);
  const grid: Grid = [];
  let prev: { line: Line; row: string[] } | undefined;
  for (const l of lines) {
    const row = bands.map(() => '');
    for (const c of l.cells) {
      const b = bandOf(c, bands);
      row[b] = row[b] ? join(row[b], c.text, 1, 1) : c.text;
    }
    // a title that wraps onto a second line belongs to the row above
    const filled = row.filter(Boolean).length;
    if (prev && filled === 1 && prev.line.page === l.page && prev.line.y - l.y < size * 1.7 && prev.row.filter(Boolean).length >= 3) {
      const b = row.findIndex(Boolean);
      if (prev.row[b] && !/\d/.test(row[b].slice(0, 1))) {
        prev.row[b] = join(prev.row[b], row[b], 1, 1);
        continue;
      }
    }
    grid.push(row);
    prev = { line: l, row };
  }
  return mergeExclusive(grid);
};

/** The text of a PDF as plain lines, for statements that are not laid out as a table. */
export const pdfItemsToText = (items: PdfItem[]): string => {
  const clean = items.filter((i) => i.str && i.str.trim());
  const size = median(clean.map((i) => i.height || 0).filter((h) => h > 0)) || 10;
  return dropRunningLines(toLines(clean, size), size)
    .map((l) => l.cells.map((c) => c.text).join('\t'))
    .join('\n');
};

/** A grid with a recognisable header row and at least two rows of data under it. */
export const looksLikeTable = (grid: Grid) => {
  if (grid.length < 3) return false;
  const h = findHeaderRow(grid);
  if (guessMapping(grid[h]).filter((f) => f !== 'ignore').length < 2) return false;
  return grid.slice(h + 1).filter((r) => r.filter((c) => c && c.trim()).length >= 2).length >= 2;
};

export interface OcrWord {
  text: string;
  confidence: number;
  /** Pixel box, y growing downward as in an image. */
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

/**
 * Recognised words as positioned text, so a photographed or scanned
 * statement goes through the same table rebuilding as a text PDF. Image y
 * grows downward, so it is flipped; words the engine barely made out are
 * dropped.
 */
export const ocrWordsToItems = (words: OcrWord[], page: number): PdfItem[] =>
  words
    .filter((w) => w.text.trim() && w.confidence >= 30)
    .map((w) => ({ str: w.text.trim(), x: w.bbox.x0, y: -w.bbox.y1, width: w.bbox.x1 - w.bbox.x0, height: w.bbox.y1 - w.bbox.y0, page }));
