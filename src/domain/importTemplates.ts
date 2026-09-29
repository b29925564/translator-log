// Each vendor's report layout, remembered after the first import: the column
// mapping, where the header sits and which client it came from. Kept in
// localStorage on this device (not synced) and matched by the header row.

import type { ImportField } from './csv';
import type { Grid } from './sheets';

export interface ImportTemplate {
  /** Normalised header cells joined; the lookup key. */
  sig: string;
  headers: string[];
  mapping: ImportField[];
  header: number;
  clientId?: string;
  /** What the note shows: the client or the file it was saved from. */
  name: string;
  lastUsed: number;
}

const KEY = 'witimemo.importTemplates';
const MAX = 40;

const cell = (h: string) => h.trim().toLowerCase().replace(/\s+/g, ' ');
export const headerSignature = (headers: string[]) => headers.map(cell).join('|');

export const loadTemplates = (): ImportTemplate[] => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

export const saveTemplate = (t: ImportTemplate) => {
  try {
    const rest = loadTemplates().filter((x) => x.sig !== t.sig);
    localStorage.setItem(KEY, JSON.stringify([t, ...rest].sort((a, b) => b.lastUsed - a.lastUsed).slice(0, MAX)));
  } catch {
    // storage full or blocked: the next import guesses again
  }
};

/** Share of header names two rows have in common, 0–1. */
const overlap = (a: string[], b: string[]) => {
  const x = new Set(a.map(cell).filter(Boolean));
  const y = new Set(b.map(cell).filter(Boolean));
  if (!x.size || !y.size) return 0;
  let both = 0;
  for (const h of x) if (y.has(h)) both++;
  return both / Math.max(x.size, y.size);
};

/**
 * The saved layout that fits this table: the same header row, or one that
 * shares at least 80% of its column names. The mapping follows columns by
 * name, so a vendor that adds or moves a column still lines up.
 */
export const findTemplate = (grid: Grid, guessedHeader: number, templates: ImportTemplate[]): { template: ImportTemplate; header: number; mapping: ImportField[] } | undefined => {
  let best: { template: ImportTemplate; header: number; score: number } | undefined;
  for (const t of templates) {
    for (const h of new Set([t.header, guessedHeader])) {
      const row = grid[h];
      if (!row) continue;
      const score = headerSignature(row) === t.sig ? 1.01 : overlap(row, t.headers);
      if (score >= 0.8 && score > (best?.score ?? 0)) best = { template: t, header: h, score };
    }
  }
  if (!best) return undefined;
  const { template: t, header } = best;
  const byName = new Map(t.headers.map((h, i) => [cell(h), t.mapping[i]] as const));
  const row = grid[header];
  const mapping = best.score > 1 ? [...t.mapping] : row.map((h) => byName.get(cell(h)) ?? 'ignore');
  return { template: t, header, mapping };
};
