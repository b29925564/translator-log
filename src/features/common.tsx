import { ChevronRight, FolderKanban, Play, Plus, Square } from 'lucide-react';
import { useMemo } from 'react';
import { useData } from '../db/data';
import { startTimer, stopTimer } from '../db/repo';
import { BUILTIN_DOMAINS, CURRENCIES, LANGUAGES } from '../domain/constants';
import { jobGross, jobGrossBase, jobWords } from '../domain/money';
import { measuredSpeed, quantile, isBooked, incomeDate } from '../domain/stats';
import type { Client, Job } from '../domain/types';
import { getLang, tx } from '../i18n';
import { dueInfo, money, qty } from '../ui/format';
import { cx, Pair, Select, StatusPill } from '../ui/kit';
import { useUI } from '../ui/store';

// ---------- derived numbers used across pages ----------

export const useSpeed = () => {
  const { jobs, hours, settings } = useData();
  return useMemo(() => {
    const m = measuredSpeed(jobs, hours);
    return { wph: m?.wph ?? settings.work.wordsPerHour, measured: !!m, n: m?.n ?? 0 };
  }, [jobs, hours, settings.work.wordsPerHour]);
};

export const useMedianRate = () => {
  const { jobs } = useData();
  return useMemo(() => {
    const rates = jobs
      .filter((j) => isBooked(j) && (j.unit === 'word' || j.unit === 'char') && jobWords(j) > 0)
      .map((j) => jobGrossBase(j) / jobWords(j))
      .sort((a, b) => a - b);
    return rates.length ? quantile(rates, 0.5) : undefined;
  }, [jobs]);
};

/** What this client usually sends: pair, domain, unit, tool — used for smart defaults. */
export const clientHabits = (clientId: string | undefined, jobs: Job[]) => {
  if (!clientId) return undefined;
  const list = jobs.filter((j) => j.clientId === clientId).sort((a, b) => incomeDate(b).localeCompare(incomeDate(a)));
  if (!list.length) return undefined;
  const mode = <T,>(xs: (T | undefined)[]) => {
    const m = new Map<T, number>();
    for (const x of xs) if (x != null) m.set(x, (m.get(x) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  };
  const recent = list.slice(0, 12);
  return {
    sourceLang: recent[0].sourceLang,
    targetLang: recent[0].targetLang,
    domain: mode(recent.map((j) => j.domain)),
    unit: mode(recent.map((j) => j.unit)),
    service: mode(recent.map((j) => j.service)),
    catTool: mode(recent.map((j) => j.catTool)),
    rate: recent.find((j) => j.unit === mode(recent.map((x) => x.unit)))?.rate,
  };
};

// ---------- pickers ----------

export function LangSelect({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  const en = getLang() === 'en';
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {LANGUAGES.map((l) => (
        <option key={l.code} value={l.code}>
          {l.short} · {en ? l.en : l.zh}
        </option>
      ))}
    </Select>
  );
}

export function CurrencySelect({ value, onChange, id, className }: { value: string; onChange: (v: string) => void; id?: string; className?: string }) {
  const en = getLang() === 'en';
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      {CURRENCIES.map((c) => (
        <option key={c.code} value={c.code}>
          {c.code} · {en ? c.en : c.zh}
        </option>
      ))}
    </Select>
  );
}

export function DomainSelect({ value, onChange, id }: { value?: string; onChange: (v: string | undefined) => void; id?: string }) {
  const { settings } = useData();
  const en = getLang() === 'en';
  const custom = settings.domains.filter((d) => !BUILTIN_DOMAINS.some((b) => b.id === d));
  const known = value && !BUILTIN_DOMAINS.some((b) => b.id === value) && !custom.includes(value) ? [value] : [];
  return (
    <Select
      id={id}
      value={value ?? ''}
      onChange={(e) => {
        if (e.target.value === '__new') {
          const name = window.prompt?.(tx('新領域名稱', 'New field name'))?.trim();
          if (name) onChange(name);
          return;
        }
        onChange(e.target.value || undefined);
      }}
    >
      <option value="">{tx('未分類', 'Uncategorised')}</option>
      {BUILTIN_DOMAINS.map((d) => (
        <option key={d.id} value={d.id}>
          {en ? d.en : d.zh}
        </option>
      ))}
      {[...custom, ...known].map((d) => (
        <option key={d} value={d}>
          {d}
        </option>
      ))}
    </Select>
  );
}

export function ClientSelect({ value, onChange, id }: { value?: string; onChange: (id: string | undefined, client?: Client) => void; id?: string }) {
  const { clients } = useData();
  const openClientEditor = useUI((s) => s.openClientEditor);
  return (
    <div className="flex gap-2">
      <Select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined, clients.find((c) => c.id === e.target.value))} className="flex-1">
        <option value="">{tx('（未指定客戶）', '(No client)')}</option>
        {clients
          .filter((c) => !c.archived || c.id === value)
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
      </Select>
      <button
        type="button"
        className="btn btn-secondary btn-icon shrink-0"
        aria-label={tx('新增客戶', 'Add client')}
        title={tx('新增客戶', 'Add client')}
        onClick={() => openClientEditor(undefined, true, (c) => onChange(c.id, c))}
      >
        <Plus size={18} />
      </button>
    </div>
  );
}

// ---------- job row ----------

export function TimerButton({ job, size = 'sm' }: { job: Job; size?: 'sm' | 'md' }) {
  const { running } = useData();
  const on = running?.jobId === job.id;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void (on ? stopTimer() : startTimer(job.id));
      }}
      className={cx(
        'grid shrink-0 place-items-center rounded-[3px] border transition-colors',
        size === 'sm' ? 'h-8 w-8' : 'h-10 w-10',
        on ? 'border-seal bg-seal text-white' : 'border-line-strong text-ink-2 hover:border-accent hover:text-accent',
      )}
      aria-label={on ? tx('停止計時', 'Stop timer') : tx('開始計時', 'Start timer')}
      title={on ? tx('停止計時', 'Stop timer') : tx('開始計時', 'Start timer')}
    >
      {on ? <Square size={12} fill="currentColor" /> : <Play size={13} fill="currentColor" className="ml-0.5" />}
    </button>
  );
}

export function JobRow({ job, showClient = true, showTimer = false, showDue = false }: { job: Job; showClient?: boolean; showTimer?: boolean; showDue?: boolean }) {
  const { clientMap, projectMap, today, settings } = useData();
  const navigate = useUI((s) => s.navigate);
  const client = job.clientId ? clientMap.get(job.clientId) : undefined;
  const pj = job.projectId ? projectMap.get(job.projectId) : undefined;
  // parts already carry the project name in their title
  const project = pj && !job.title.startsWith(pj.name) ? pj : undefined;
  const due = showDue && job.status === 'active' ? dueInfo(job.dueAt, today) : undefined;
  const w = jobWords(job);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate('/jobs/' + job.id)}
      onKeyDown={(e) => e.key === 'Enter' && navigate('/jobs/' + job.id)}
      className="group flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cx('truncate text-[14.5px] font-medium', job.status === 'cancelled' ? 'text-muted line-through' : 'text-ink')}>{job.title || tx('（未命名）', '(Untitled)')}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted">
          <Pair source={job.sourceLang} target={job.targetLang} />
          {showClient && client && <span className="truncate">{client.name}</span>}
          {project && (
            <span className="inline-flex min-w-0 items-center gap-1 truncate">
              <FolderKanban size={12} className="shrink-0" />
              <span className="truncate">{project.name}</span>
            </span>
          )}
          {w > 0 && job.unit !== 'flat' && <span className="tnum">{qty(job.unit === 'word' || job.unit === 'char' ? w : job.quantity, job.unit)}</span>}
          {job.unit === 'flat' && w > 0 && <span className="tnum">{qty(w, 'word')}</span>}
          {due && (
            <span className={cx('font-medium', due.tone === 'bad' ? 'text-bad' : due.tone === 'warn' ? 'text-warn' : 'text-ink-2')}>{due.text}</span>
          )}
        </div>
        {job.status === 'active' && job.progress != null && job.progress > 0 && (
          <div className="mt-2 h-[3px] w-full max-w-[220px] overflow-hidden bg-surface-3">
            <div className="h-full bg-ink" style={{ width: `${job.progress}%` }} />
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-[14.5px] font-semibold text-ink tnum">{money(jobGross(job), job.currency)}</span>
        {job.currency !== settings.baseCurrency ? (
          <span className="text-[11.5px] text-muted tnum">≈ {money(jobGrossBase(job), settings.baseCurrency)}</span>
        ) : (
          <StatusPill status={job.status} />
        )}
      </div>
      {showTimer && job.status === 'active' ? <TimerButton job={job} /> : <ChevronRight size={16} className="hidden shrink-0 text-line-strong group-hover:text-muted sm:block" />}
    </div>
  );
}
