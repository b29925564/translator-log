import Dexie, { type EntityTable } from 'dexie';
import type { Client, Invoice, Job, Pref, Project, Session } from '../domain/types';

/** Device-only key/value rows (sync credentials, device id, theme…). Never synced. */
export interface LocalRow {
  key: string;
  value: unknown;
}

// 'wordtrail' predates the rename; renaming the database would strand everyone's data
export class WitimemoDB extends Dexie {
  jobs!: EntityTable<Job, 'id'>;
  clients!: EntityTable<Client, 'id'>;
  sessions!: EntityTable<Session, 'id'>;
  invoices!: EntityTable<Invoice, 'id'>;
  prefs!: EntityTable<Pref, 'id'>;
  projects!: EntityTable<Project, 'id'>;
  local!: EntityTable<LocalRow, 'key'>;

  constructor(name = 'wordtrail', options?: ConstructorParameters<typeof Dexie>[1]) {
    super(name, options);
    this.version(1).stores({
      jobs: 'id, clientId, status, updatedAt, dueAt, deliveredAt',
      clients: 'id, name, updatedAt',
      sessions: 'id, jobId, start, end, updatedAt',
      invoices: 'id, clientId, number, updatedAt',
      prefs: 'id, updatedAt',
      local: 'key',
    });
    // v2: projects, and jobs indexed by project
    this.version(2).stores({
      jobs: 'id, clientId, status, updatedAt, dueAt, deliveredAt, projectId',
      projects: 'id, clientId, updatedAt',
    });
  }
}

// The single-file preview runs inside a sandboxed frame where IndexedDB may be
// unavailable, so it keeps everything in memory instead.
const memory = __DEMO_BUILD__ ? await import('fake-indexeddb').then((m) => ({ indexedDB: m.indexedDB, IDBKeyRange: m.IDBKeyRange })) : undefined;

export const db = new WitimemoDB('wordtrail', memory);

export const uid = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
};

export const getLocal = async <T,>(key: string): Promise<T | undefined> => (await db.local.get(key))?.value as T | undefined;
export const setLocal = (key: string, value: unknown) => db.local.put({ key, value });
export const delLocal = (key: string) => db.local.delete(key);
