import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { todayISO } from '../domain/dates';
import { hoursByJob } from '../domain/stats';
import type { Client, Invoice, Job, Project, Session, Settings } from '../domain/types';
import { db } from './db';
import { composeSettings } from './repo';

export interface AppData {
  ready: boolean;
  jobs: Job[];
  clients: Client[];
  sessions: Session[];
  invoices: Invoice[];
  projects: Project[];
  projectMap: Map<string, Project>;
  clientMap: Map<string, Client>;
  jobMap: Map<string, Job>;
  hours: Map<string, number>;
  settings: Settings;
  running?: Session;
  today: string;
}

const Ctx = createContext<AppData | null>(null);

const live = <T extends { deletedAt?: number }>(rows: T[] | undefined) => (rows ?? []).filter((r) => !r.deletedAt);

export function DataProvider({ children }: { children: ReactNode }) {
  const jobsRaw = useLiveQuery(() => db.jobs.toArray(), []);
  const clientsRaw = useLiveQuery(() => db.clients.toArray(), []);
  const sessionsRaw = useLiveQuery(() => db.sessions.toArray(), []);
  const invoicesRaw = useLiveQuery(() => db.invoices.toArray(), []);
  const projectsRaw = useLiveQuery(() => db.projects.toArray(), []);
  const prefs = useLiveQuery(() => db.prefs.toArray(), []);
  const local = useLiveQuery(() => db.local.toArray(), []);
  const [today, setToday] = useState(todayISO());

  useEffect(() => {
    const t = setInterval(() => setToday(todayISO()), 60_000);
    return () => clearInterval(t);
  }, []);

  const value = useMemo<AppData>(() => {
    const jobs = live(jobsRaw);
    const clients = live(clientsRaw).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
    const sessions = live(sessionsRaw);
    const invoices = live(invoicesRaw);
    const projects = live(projectsRaw).sort((a, b) => b.updatedAt - a.updatedAt);
    return {
      ready: !!(jobsRaw && clientsRaw && sessionsRaw && invoicesRaw && projectsRaw && prefs && local),
      jobs,
      clients,
      sessions,
      invoices,
      projects,
      projectMap: new Map(projects.map((p) => [p.id, p])),
      clientMap: new Map(clients.map((c) => [c.id, c])),
      jobMap: new Map(jobs.map((j) => [j.id, j])),
      hours: hoursByJob(sessions),
      settings: composeSettings(prefs ?? [], local ?? []),
      running: sessions.find((s) => !s.end),
      today,
    };
  }, [jobsRaw, clientsRaw, sessionsRaw, invoicesRaw, projectsRaw, prefs, local, today]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useData = (): AppData => {
  const v = useContext(Ctx);
  if (!v) throw new Error('DataProvider missing');
  return v;
};
