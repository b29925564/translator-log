// Overview card: open projects with progress, the next part due and
// unanswered client questions.

import { ArrowRight, MessageCircleQuestion } from 'lucide-react';
import { useMemo } from 'react';
import { useData } from '../db/data';
import { isOngoing, projectStats, shortPartName } from '../domain/projects';
import { tx } from '../i18n';
import { dueInfo } from '../ui/format';
import { cx } from '../ui/kit';
import { useUI } from '../ui/store';
import { useSpeed } from './common';

export function ProjectsMini() {
  const { projects, jobs, today } = useData();
  const navigate = useUI((s) => s.navigate);
  const speed = useSpeed();
  const open = useMemo(
    () =>
      projects
        .filter((p) => !p.archived)
        .map((p) => ({ p, s: projectStats(p, jobs.filter((j) => j.projectId === p.id), today, speed.wph) }))
        .filter(({ s }) => s.parts === 0 || s.done < s.parts)
        .sort((a, b) => (a.s.nextDue?.date ?? '9999').localeCompare(b.s.nextDue?.date ?? '9999'))
        .slice(0, 3),
    [projects, jobs, today, speed.wph],
  );
  if (!open.length) return null;
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 pb-3 pt-4">
        <h2 className="text-[15px] font-semibold text-ink">{tx('專案', 'Projects')}</h2>
        <button type="button" className="inline-flex items-center gap-1 text-[13px] font-medium text-ink underline decoration-gold decoration-1 underline-offset-4" onClick={() => navigate('/projects')}>
          {tx('全部專案', 'All projects')} <ArrowRight size={14} />
        </button>
      </div>
      <ul className="hairline-list border-t border-line">
        {open.map(({ p, s }) => {
          const due = s.nextDue ? dueInfo(s.nextDue.job.dueAt, today) : undefined;
          return (
            <li key={p.id}>
              <button type="button" onClick={() => navigate('/projects/' + p.id)} className="block w-full px-5 py-3 text-left transition-colors hover:bg-surface-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-[14.5px] font-medium text-ink">{p.name}</span>
                  <span className="shrink-0 text-[12.5px] font-medium text-ink tnum">{Math.round(s.progress * 100)}%</span>
                </div>
                <div className="mt-1.5 h-[3px] bg-surface-3">
                  <div className="h-full bg-gold" style={{ width: `${s.progress * 100}%` }} />
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-muted">
                  <span>{isOngoing(p) ? tx(`${s.done}／${s.parts} 件`, `${s.done}/${s.parts} jobs`) : tx(`${s.done}／${s.parts} 部分`, `${s.done}/${s.parts} parts`)}</span>
                  {s.nextDue && due && (
                    <span className={cx(due.tone === 'bad' ? 'text-bad' : due.tone === 'warn' ? 'text-warn' : '')}>
                      {shortPartName(s.nextDue.job.title, p.name)} · {due.text}
                    </span>
                  )}
                  {s.openQueries > 0 && (
                    <span className="inline-flex items-center gap-1 font-medium text-warn">
                      <MessageCircleQuestion size={13} /> {s.openQueries}
                    </span>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
