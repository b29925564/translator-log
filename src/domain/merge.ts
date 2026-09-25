// Last-write-wins merge used by device sync. Pure and deterministic so every
// device converges on the same state whatever order syncs happen in.

import type { SyncMeta, TableName } from './types';

export type Snapshot = Record<TableName, SyncMeta[]>;

export const TABLES: TableName[] = ['jobs', 'clients', 'sessions', 'invoices', 'prefs', 'projects'];

export const emptySnapshot = (): Snapshot => ({ jobs: [], clients: [], sessions: [], invoices: [], prefs: [], projects: [] });

/** Newer updatedAt wins; ties break on a stable content comparison. */
export const newer = (a: SyncMeta, b: SyncMeta): SyncMeta => {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  const ja = JSON.stringify(a);
  const jb = JSON.stringify(b);
  return ja >= jb ? a : b;
};

export interface MergeResult {
  merged: Snapshot;
  /** Records that must be written locally. */
  toLocal: Snapshot;
  /** True when the remote copy lacks something the merged state has. */
  remoteStale: boolean;
  stats: { pulled: number; pushed: number };
}

export const mergeSnapshots = (local: Snapshot, remote: Snapshot): MergeResult => {
  const merged = emptySnapshot();
  const toLocal = emptySnapshot();
  let remoteStale = false;
  let pulled = 0;
  let pushed = 0;
  for (const t of TABLES) {
    const lm = new Map((local[t] || []).map((r) => [r.id, r]));
    const rm = new Map((remote[t] || []).map((r) => [r.id, r]));
    const ids = new Set([...lm.keys(), ...rm.keys()]);
    for (const id of ids) {
      const l = lm.get(id);
      const r = rm.get(id);
      let win: SyncMeta;
      if (l && r) win = newer(l, r);
      else win = (l ?? r)!;
      merged[t].push(win);
      if (win !== l && (!l || JSON.stringify(win) !== JSON.stringify(l))) {
        toLocal[t].push(win);
        pulled++;
      }
      if (!r || (win !== r && JSON.stringify(win) !== JSON.stringify(r))) {
        remoteStale = true;
        pushed++;
      }
    }
  }
  return { merged, toLocal, remoteStale, stats: { pulled, pushed } };
};
