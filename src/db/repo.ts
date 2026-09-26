// All writes go through here so timestamps, tombstones and sync triggers stay consistent.

import { DEFAULT_SETTINGS } from '../domain/constants';
import { todayISO } from '../domain/dates';
import { nextDayLog, type LogOpts } from '../domain/progress';
import { generateDemo, DEMO_PROFILE } from '../domain/demo';
import { mergeSnapshots, TABLES, type Snapshot } from '../domain/merge';
import type { Client, Invoice, Job, JobStatus, Pref, Project, Session, Settings, SyncMeta, TableName } from '../domain/types';
import type { Table } from 'dexie';
import { db, delLocal, getLocal, setLocal, uid, type LocalRow } from './db';

export const changeBus = new EventTarget();
const changed = () => changeBus.dispatchEvent(new Event('change'));

const now = () => Date.now();

// ---------- settings ----------

export const LOCAL_SETTING_KEYS: (keyof Settings)[] = ['theme', 'onboarded'];

export const composeSettings = (prefs: Pref[], local: LocalRow[]): Settings => {
  const s: Settings = structuredClone(DEFAULT_SETTINGS);
  const target = s as unknown as Record<string, unknown>;
  for (const p of prefs) {
    if (p.deletedAt || !(p.id in DEFAULT_SETTINGS)) continue;
    const def = (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[p.id];
    target[p.id] = def && typeof def === 'object' && !Array.isArray(def) && p.value && typeof p.value === 'object' ? { ...def, ...(p.value as object) } : p.value;
  }
  for (const l of local) {
    if (l.key.startsWith('setting:')) target[l.key.slice(8)] = l.value;
  }
  return s;
};

export const updateSettings = async (patch: Partial<Settings>) => {
  const t = now();
  await db.transaction('rw', db.prefs, db.local, async () => {
    for (const [key, value] of Object.entries(patch)) {
      if (LOCAL_SETTING_KEYS.includes(key as keyof Settings)) await setLocal('setting:' + key, value);
      else {
        const prev = await db.prefs.get(key);
        await db.prefs.put({ id: key, value, createdAt: prev?.createdAt ?? t, updatedAt: t });
      }
    }
  });
  changed();
};

export const readSettings = async (): Promise<Settings> => composeSettings(await db.prefs.toArray(), await db.local.toArray());

// ---------- jobs ----------

export type JobDraft = Partial<Job> & Pick<Job, 'title'>;

export const newJob = (over: Partial<Job> = {}): Job => {
  const t = now();
  return {
    id: uid(),
    createdAt: t,
    updatedAt: t,
    title: '',
    service: 'translation',
    sourceLang: DEFAULT_SETTINGS.defaultSourceLang,
    targetLang: DEFAULT_SETTINGS.defaultTargetLang,
    tags: [],
    unit: 'word',
    quantity: 0,
    rate: 0,
    currency: DEFAULT_SETTINGS.baseCurrency,
    fxToBase: 1,
    status: 'active',
    receivedAt: todayISO(),
    ...over,
  };
};

const clean = <T extends object>(o: T): T => {
  const out = { ...o } as Record<string, unknown>;
  for (const k of Object.keys(out)) if (out[k] === undefined || (typeof out[k] === 'number' && Number.isNaN(out[k]))) delete out[k];
  return out as T;
};

/** Saves a job. `log` says when a progress change was done, for 翻譯足跡 (today by default). */
export const saveJob = async (job: Job, log: LogOpts = {}) => {
  const prev = await db.jobs.get(job.id);
  const today = todayISO();
  const before = prev?.progress ?? 0;
  const after = job.progress ?? 0;
  const backdated = (!!log.date && log.date !== today) || !!log.since;
  if (!prev) job = { ...job, dayStart: undefined };
  // remember where the day started so the Today plan can show words done today
  else if (before !== after) {
    const start = prev.dayStart?.date === today ? prev.dayStart.progress : job.dayStart?.date === today ? job.dayStart.progress : undefined;
    // progress done on other days moves today's starting point with it
    if (backdated) job = { ...job, dayStart: { date: today, progress: Math.min(after, (start ?? before) + (after - before)) } };
    else if (start == null) job = { ...job, dayStart: { date: today, progress: before } };
  }
  job = { ...job, dayLog: nextDayLog(prev, job, today, log) };
  const rec = clean({ ...job, updatedAt: now() });
  await db.jobs.put(rec);
  changed();
  return rec;
};

export const deleteJob = async (id: string) => {
  const t = now();
  await db.transaction('rw', db.jobs, db.sessions, async () => {
    await db.jobs.update(id, { deletedAt: t, updatedAt: t });
    const ss = await db.sessions.where('jobId').equals(id).toArray();
    for (const s of ss) await db.sessions.update(s.id, { deletedAt: t, updatedAt: t });
  });
  changed();
};

export const restoreJob = async (id: string) => {
  const t = now();
  await db.jobs.update(id, { deletedAt: undefined, updatedAt: t });
  const ss = await db.sessions.where('jobId').equals(id).toArray();
  for (const s of ss) await db.sessions.update(s.id, { deletedAt: undefined, updatedAt: t });
  changed();
};

const ORDER: JobStatus[] = ['quote', 'active', 'delivered', 'invoiced', 'paid'];

/** Moves a job along the pipeline, filling in or clearing the milestone dates. */
export const withStatus = (job: Job, status: JobStatus, today = todayISO()): Job => {
  const j: Job = { ...job, status };
  const idx = ORDER.indexOf(status);
  if (status === 'cancelled') return j;
  if (idx >= 2 && !j.deliveredAt) j.deliveredAt = today;
  if (idx >= 3 && !j.invoicedAt) j.invoicedAt = today;
  if (idx >= 4 && !j.paidAt) j.paidAt = today;
  if (idx < 4) j.paidAt = undefined;
  if (idx < 3) j.invoicedAt = undefined;
  if (idx < 2) j.deliveredAt = undefined;
  if (status === 'active' && j.progress == null) j.progress = 0;
  if (idx >= 2) j.progress = 100;
  return j;
};

export const setJobStatus = async (job: Job, status: JobStatus) => saveJob(withStatus(job, status));

export const markPaid = async (ids: string[], date = todayISO()) => {
  const t = now();
  await db.transaction('rw', db.jobs, async () => {
    for (const id of ids) {
      const j = await db.jobs.get(id);
      if (!j) continue;
      await db.jobs.put(clean({ ...withStatus({ ...j, paidAt: date }, 'paid', date), updatedAt: t }));
    }
  });
  changed();
};

// ---------- clients ----------

export const newClient = (over: Partial<Client> = {}): Client => {
  const t = now();
  return { id: uid(), createdAt: t, updatedAt: t, name: '', kind: 'agency', currency: DEFAULT_SETTINGS.baseCurrency, paymentTermsDays: 30, ...over };
};

export const saveClient = async (c: Client) => {
  const rec = clean({ ...c, updatedAt: now() });
  await db.clients.put(rec);
  changed();
  return rec;
};

export const deleteClient = async (id: string) => {
  const t = now();
  await db.clients.update(id, { deletedAt: t, updatedAt: t });
  changed();
};

// ---------- timer ----------

export const runningSession = async () => (await db.sessions.filter((s) => !s.end && !s.deletedAt).toArray())[0];

export const startTimer = async (jobId: string) => {
  const t = now();
  await db.transaction('rw', db.sessions, async () => {
    const running = await db.sessions.filter((s) => !s.end && !s.deletedAt).toArray();
    for (const r of running) await db.sessions.update(r.id, { end: t, updatedAt: t });
    await db.sessions.put({ id: uid(), jobId, start: t, createdAt: t, updatedAt: t });
  });
  changed();
};

export const stopTimer = async () => {
  const t = now();
  const running = await db.sessions.filter((s) => !s.end && !s.deletedAt).toArray();
  for (const r of running) {
    // sessions under a minute are almost always accidental taps
    if (t - r.start < 60_000) await db.sessions.update(r.id, { deletedAt: t, updatedAt: t });
    else await db.sessions.update(r.id, { end: t, updatedAt: t });
  }
  changed();
};

export const saveSession = async (s: Session) => {
  await db.sessions.put(clean({ ...s, updatedAt: now() }));
  changed();
};

export const deleteSession = async (id: string) => {
  const t = now();
  await db.sessions.update(id, { deletedAt: t, updatedAt: t });
  changed();
};

export const restoreSession = async (id: string) => {
  const s = await db.sessions.get(id);
  if (!s) return;
  await db.sessions.put(clean({ ...s, deletedAt: undefined, updatedAt: now() }));
  changed();
};

// ---------- projects ----------

export const newProject = (over: Partial<Project> = {}): Project => {
  const t = now();
  return { id: uid(), createdAt: t, updatedAt: t, name: '', kind: 'custom', links: [], queries: [], ...over };
};

export const saveProject = async (p: Project) => {
  const rec = clean({ ...p, updatedAt: now() });
  await db.projects.put(rec);
  changed();
  return rec;
};

/** Saves a project and its first parts together. */
export const createProject = async (p: Project, parts: Job[]) => {
  const t = now();
  await db.transaction('rw', db.projects, db.jobs, async () => {
    await db.projects.put(clean({ ...p, updatedAt: t }));
    for (const j of parts) await db.jobs.put(clean({ ...j, projectId: p.id, updatedAt: t }));
  });
  changed();
};

/** Moves jobs into a project, or out of any project when `projectId` is undefined. */
export const assignToProject = async (jobIds: string[], projectId: string | undefined) => {
  const t = now();
  await db.transaction('rw', db.jobs, async () => {
    for (const id of jobIds) {
      const j = await db.jobs.get(id);
      if (!j || j.projectId === projectId) continue;
      await db.jobs.put(clean({ ...j, projectId, part: projectId ? j.part : undefined, updatedAt: t }));
    }
  });
  changed();
};

/** Deletes a project; its parts are either deleted too or kept as standalone jobs. */
export const deleteProject = async (id: string, withParts: boolean) => {
  const t = now();
  await db.transaction('rw', db.projects, db.jobs, db.sessions, async () => {
    await db.projects.update(id, { deletedAt: t, updatedAt: t });
    const parts = await db.jobs.where('projectId').equals(id).toArray();
    for (const j of parts) {
      if (withParts) {
        await db.jobs.update(j.id, { deletedAt: t, updatedAt: t });
        const ss = await db.sessions.where('jobId').equals(j.id).toArray();
        for (const s of ss) await db.sessions.update(s.id, { deletedAt: t, updatedAt: t });
      } else await db.jobs.put(clean({ ...j, projectId: undefined, part: undefined, updatedAt: t }));
    }
  });
  changed();
};

// ---------- invoices ----------

export const saveInvoice = async (inv: Invoice, jobs: Job[]) => {
  const t = now();
  await db.transaction('rw', db.invoices, db.jobs, async () => {
    await db.invoices.put(clean({ ...inv, updatedAt: t }));
    for (const j of jobs) {
      const next = j.status === 'paid' ? { ...j, invoiceId: inv.id } : withStatus({ ...j, invoiceId: inv.id, invoicedAt: inv.issueDate }, 'invoiced', inv.issueDate);
      await db.jobs.put(clean({ ...next, updatedAt: t }));
    }
  });
  changed();
};

export const deleteInvoice = async (inv: Invoice) => {
  const t = now();
  await db.transaction('rw', db.invoices, db.jobs, async () => {
    await db.invoices.update(inv.id, { deletedAt: t, updatedAt: t });
    for (const id of inv.jobIds) {
      const j = await db.jobs.get(id);
      if (j && j.invoiceId === inv.id) {
        const back = j.status === 'invoiced' ? withStatus({ ...j, invoiceId: undefined }, 'delivered') : { ...j, invoiceId: undefined };
        await db.jobs.put(clean({ ...back, updatedAt: t }));
      }
    }
  });
  changed();
};

export const markInvoicePaid = async (inv: Invoice, date = todayISO()) => {
  const t = now();
  await db.invoices.put(clean({ ...inv, status: 'paid', paidAt: date, updatedAt: t }));
  await markPaid(inv.jobIds, date);
};

// ---------- snapshot, backup, demo ----------

const tableOf = (t: TableName) => db[t] as unknown as Table<SyncMeta, string>;

export const snapshot = async (): Promise<Snapshot> => {
  const out = {} as Snapshot;
  for (const t of TABLES) out[t] = await tableOf(t).toArray();
  return out;
};

export const applyRecords = async (snap: Partial<Snapshot>) => {
  await db.transaction('rw', [db.jobs, db.clients, db.sessions, db.invoices, db.prefs, db.projects], async () => {
    for (const t of TABLES) {
      const rows = snap[t];
      if (rows?.length) await tableOf(t).bulkPut(rows);
    }
  });
};

export interface BackupFile {
  /** Format marker from before the rename; kept so older files still open. */
  app: 'wordtrail';
  version: 1;
  exportedAt: string;
  data: Snapshot;
}

export const exportBackup = async (): Promise<BackupFile> => ({
  app: 'wordtrail',
  version: 1,
  exportedAt: new Date().toISOString(),
  data: await snapshot(),
});

const restamp = (snap: Snapshot, t: number): Snapshot => {
  const out = {} as Snapshot;
  for (const tn of TABLES) out[tn] = (snap[tn] || []).map((r) => ({ ...r, updatedAt: t }));
  return out;
};

export const importBackup = async (file: BackupFile, mode: 'merge' | 'replace') => {
  if (file?.app !== 'wordtrail' || !file.data) throw new Error('not-a-backup');
  if (mode === 'replace') {
    // With sync on, rows that simply vanish come straight back from the other
    // devices, so the replaced ones are tombstoned and the backup is stamped newer.
    const synced = !!(await getLocal('sync'));
    const t = now();
    await db.transaction('rw', [db.jobs, db.clients, db.sessions, db.invoices, db.prefs, db.projects], async () => {
      for (const tn of TABLES) {
        const table = tableOf(tn);
        if (!synced) {
          await table.clear();
          continue;
        }
        const keep = new Set((file.data[tn] || []).map((r) => r.id));
        const gone = (await table.toArray()).filter((r) => !keep.has(r.id) && !r.deletedAt);
        for (const r of gone) await table.update(r.id, { deletedAt: t, updatedAt: t });
      }
    });
    await applyRecords(synced ? restamp(file.data, t) : file.data);
  } else {
    const r = mergeSnapshots(await snapshot(), file.data);
    await applyRecords(r.toLocal);
  }
  changed();
};

export const loadDemo = async () => {
  const demo = generateDemo(todayISO());
  await applyRecords({ jobs: demo.jobs, clients: demo.clients, sessions: demo.sessions, invoices: demo.invoices, projects: demo.projects });
  const current = await readSettings();
  if (!current.profile.name) await updateSettings({ profile: { ...current.profile, ...DEMO_PROFILE } });
  // remember the real goals so removing the sample data can put them back
  if (!(await getLocal('demo:goals'))) await setLocal('demo:goals', current.goals);
  await updateSettings({ goals: DEMO_GOALS, onboarded: true });
  changed();
};

const DEMO_GOALS: Settings['goals'] = { yearIncome: 2_000_000, yearWords: 900_000 };

export const hasDemo = async () => (await db.jobs.filter((j) => !!j.demo && !j.deletedAt).count()) > 0;

export const clearDemo = async () => {
  const t = now();
  const synced = !!(await getLocal('sync'));
  await db.transaction('rw', [db.jobs, db.clients, db.sessions, db.invoices, db.projects], async () => {
    for (const tn of ['jobs', 'clients', 'sessions', 'invoices', 'projects'] as const) {
      const table = tableOf(tn);
      const ids = (await table.filter((r) => !!r.demo).toArray()).map((r) => r.id);
      if (synced) for (const id of ids) await table.update(id, { deletedAt: t, updatedAt: t });
      else await table.bulkDelete(ids);
    }
  });
  const s = await readSettings();
  if (s.profile.name === DEMO_PROFILE.name) await updateSettings({ profile: { name: '' } });
  const goals = await getLocal<Settings['goals']>('demo:goals');
  if (s.goals.yearIncome === DEMO_GOALS.yearIncome && s.goals.yearWords === DEMO_GOALS.yearWords) await updateSettings({ goals: goals ?? DEFAULT_SETTINGS.goals });
  await delLocal('demo:goals');
  changed();
};

export const wipeAll = async () => {
  await db.transaction('rw', [db.jobs, db.clients, db.sessions, db.invoices, db.prefs, db.projects, db.local], async () => {
    for (const t of TABLES) await tableOf(t).clear();
    await db.local.clear();
  });
  changed();
};

export { uid };
