import { FolderKanban, MessageCircleQuestion, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useData } from '../db/data';
import { projectStats, shortPartName, templateFor } from '../domain/projects';
import { tx } from '../i18n';
import { dueInfo, money, num } from '../ui/format';
import { Button, cx, Empty, Meter, PageHeader, Pair, Segmented } from '../ui/kit';
import { useUI } from '../ui/store';
import { getLang } from '../i18n';
import { useSpeed } from '../features/common';

type Filter = 'open' | 'done' | 'all';

export function Projects() {
  const { projects, jobs, clientMap, today, settings } = useData();
  const { navigate, openProjectEditor } = useUI();
  const speed = useSpeed();
  const [filter, setFilter] = useState<Filter>('open');
  const lang = getLang();

  const rows = useMemo(
    () =>
      projects.map((p) => {
        const parts = jobs.filter((j) => j.projectId === p.id);
        const s = projectStats(p, parts, today, speed.wph);
        const done = p.archived || (s.parts > 0 && s.done === s.parts);
        return { p, parts, s, done };
      }),
    [projects, jobs, today, speed.wph],
  );
  const shown = rows.filter((r) => (filter === 'all' ? true : filter === 'done' ? r.done : !r.done));
  const openCount = rows.filter((r) => !r.done).length;

  return (
    <div>
      <PageHeader
        eyebrow={tx(`${openCount} 個進行中的專案`, `${openCount} open projects`)}
        title={tx('專案', 'Projects')}
        actions={
          <Button variant="primary" size="sm" icon={<Plus size={15} />} onClick={() => openProjectEditor()}>
            {tx('新增專案', 'New project')}
          </Button>
        }
      />
      {rows.length === 0 ? (
        <div className="card">
          <Empty
            icon={<FolderKanban size={22} />}
            title={tx('大案子，拆開來管', 'Big jobs, broken down')}
            body={tx(
              '客戶說接下來有個大專案？建立一個專案，把預告片、過場動畫、劇情對話、介面文字…拆成各自的部分：每個部分有自己的字數、費率、截止日與進度，問客戶的問題也集中在一起。',
              'A client has a big project coming? Create one and split it into parts such as trailer, cutscenes, dialogue and UI strings. Each part gets its own volume, rate, deadline and progress, and your questions for the client live in one place.',
            )}
            action={
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => openProjectEditor()}>
                {tx('新增專案', 'New project')}
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <Segmented
            size="sm"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'open', label: tx('進行中', 'Open') },
              { value: 'done', label: tx('已完成', 'Finished') },
              { value: 'all', label: tx('全部', 'All') },
            ]}
          />
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map(({ p, s, done }) => {
              const client = p.clientId ? clientMap.get(p.clientId) : undefined;
              const next = s.nextDue && dueInfo(s.nextDue.job.dueAt, today);
              const t = templateFor(p.kind);
              return (
                <button key={p.id} type="button" onClick={() => navigate('/projects/' + p.id)} className="card group flex flex-col p-5 text-left transition-colors hover:border-line-strong">
                  <div className="eyebrow flex flex-wrap items-center gap-x-2 truncate">
                    <span>{lang === 'en' ? t.en : t.zh}</span>
                    {client && <span className="truncate normal-case tracking-normal">· {client.name}</span>}
                  </div>
                  <div className="font-display mt-2 text-[21px] leading-tight text-ink group-hover:underline">{p.name}</div>
                  {p.sourceLang && p.targetLang && (
                    <div className="mt-2">
                      <Pair source={p.sourceLang} target={p.targetLang} />
                    </div>
                  )}
                  <div className="mt-4 flex items-baseline justify-between text-[12.5px]">
                    <span className="text-muted">{tx(`${s.done}／${s.parts} 個部分完成`, `${s.done} of ${s.parts} parts done`)}</span>
                    <span className="font-medium text-ink tnum">{Math.round(s.progress * 100)}%</span>
                  </div>
                  <Meter className="mt-1.5" value={s.progress} max={1} label={tx('完成度', 'Progress')} />
                  <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3 text-[12.5px]">
                    <div>
                      <div className="text-muted">{tx('份量', 'Volume')}</div>
                      <div className="mt-0.5 font-medium text-ink tnum">{s.words ? tx(`${num(s.words)} 字`, `${num(s.words)} words`) : '—'}</div>
                    </div>
                    <div>
                      <div className="text-muted">{tx('金額', 'Value')}</div>
                      <div className="mt-0.5 font-medium text-ink tnum">{s.value ? money(s.value, settings.baseCurrency, { compact: true }) : '—'}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
                    {done ? (
                      <span className="text-muted">{p.archived ? tx('已封存', 'Archived') : tx('全部完成', 'All parts done')}</span>
                    ) : next && s.nextDue ? (
                      <span className={cx(next.tone === 'bad' ? 'text-bad' : next.tone === 'warn' ? 'text-warn' : 'text-ink-2')}>
                        {tx('下一個：', 'Next: ')}
                        {shortPartName(s.nextDue.job.title, p.name)} · {next.text}
                      </span>
                    ) : null}
                    {s.openQueries > 0 && (
                      <span className="inline-flex items-center gap-1 font-medium text-warn">
                        <MessageCircleQuestion size={14} /> {tx(`${s.openQueries} 個待回覆問題`, `${s.openQueries} open questions`)}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
            {shown.length === 0 && <p className="text-[13.5px] text-muted">{tx('這裡沒有專案。', 'No projects here.')}</p>}
          </div>
        </>
      )}
    </div>
  );
}
