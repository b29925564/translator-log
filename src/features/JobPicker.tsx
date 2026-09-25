// Checklist of jobs that are not in a project yet, for filing them under
// one. Likely matches (same client, title mentioning the project) come first.

import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useData } from '../db/data';
import { candidateJobs } from '../domain/projects';
import type { Project } from '../domain/types';
import { tx } from '../i18n';
import { date, money } from '../ui/format';
import { Input, StatusPill } from '../ui/kit';
import { jobGross } from '../domain/money';

const LIMIT = 40;

export function JobPicker({ project, picked, onChange }: { project: Pick<Project, 'name' | 'clientId'>; picked: Set<string>; onChange: (next: Set<string>) => void }) {
  const { jobs, clientMap } = useData();
  const [q, setQ] = useState('');
  const all = useMemo(() => candidateJobs(project, jobs), [project, jobs]);
  const nq = q.trim().toLowerCase();
  const shown = nq ? all.filter(({ job }) => `${job.title} ${job.clientId ? clientMap.get(job.clientId)?.name ?? '' : ''} ${job.poNumber ?? ''}`.toLowerCase().includes(nq)) : all;
  const likely = shown.filter((x) => x.likely);
  const rest = shown.filter((x) => !x.likely);
  const visible = [...likely, ...rest].slice(0, Math.max(LIMIT, likely.length));

  const toggle = (id: string, on: boolean) => {
    const n = new Set(picked);
    if (on) n.add(id);
    else n.delete(id);
    onChange(n);
  };

  if (!all.length) return <p className="text-[13px] text-muted">{tx('目前沒有未歸入專案的案件。', 'Every job is already in a project.')}</p>;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx('搜尋案件名稱、客戶、PO…', 'Search title, client, PO…')} className="input-sm pl-8" aria-label={tx('搜尋案件', 'Search jobs')} />
      </div>
      <ul className="max-h-[46vh] divide-y divide-line overflow-y-auto rounded-[3px] border border-line" data-testid="job-picker">
        {visible.map(({ job, likely: hint }, i) => {
          const client = job.clientId ? clientMap.get(job.clientId) : undefined;
          const heading = i === 0 && hint ? tx('可能相關', 'Likely matches') : i === likely.length && likely.length > 0 && !hint ? tx('其他案件', 'Other jobs') : undefined;
          return (
            <li key={job.id}>
              {heading && <div className="eyebrow bg-surface-2 px-3 py-1.5">{heading}</div>}
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
                <input type="checkbox" checked={picked.has(job.id)} onChange={(e) => toggle(job.id, e.target.checked)} className="h-4 w-4 shrink-0 accent-[var(--accent)]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-ink">{job.title || tx('（未命名）', '(Untitled)')}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted">
                    <StatusPill status={job.status} />
                    {client && <span className="truncate">{client.name}</span>}
                    {job.receivedAt && <span>{date(job.receivedAt)}</span>}
                  </span>
                </span>
                <span className="shrink-0 text-[13px] font-medium text-ink tnum">{jobGross(job) ? money(jobGross(job), job.currency) : ''}</span>
              </label>
            </li>
          );
        })}
        {!visible.length && <li className="px-3 py-3 text-[13px] text-muted">{tx('找不到符合的案件。', 'No matching jobs.')}</li>}
      </ul>
      {shown.length > visible.length && <p className="text-[12px] text-muted">{tx(`還有 ${shown.length - visible.length} 件，用搜尋找找看。`, `${shown.length - visible.length} more; search to find them.`)}</p>}
    </div>
  );
}
