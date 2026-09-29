// End of the day: after 18:00, once something was logged today, a quiet
// look back (words against the week, focus time, jobs touched) and the one
// thing to start with tomorrow. Dismissed per date, on this device only.

import { Moon, X } from 'lucide-react';
import { useState } from 'react';
import { useData } from '../db/data';
import { addDays, toISODate } from '../domain/dates';
import { dayLogOf } from '../domain/progress';
import { sessionMs } from '../domain/stats';
import { tx } from '../i18n';
import { dueInfo, num } from '../ui/format';
import { useUI } from '../ui/store';

const KEY = 'witimemo.eod.dismissed';

const readDismissed = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

export function EndOfDayCard({ daily }: { daily: Map<string, number> }) {
  const { jobs, sessions, today } = useData();
  const { navigate } = useUI();
  const [dismissed, setDismissed] = useState(readDismissed);
  if (dismissed === today || new Date().getHours() < 18) return null;

  const todaySessions = sessions.filter((s) => !s.deletedAt && toISODate(new Date(s.start)) === today);
  const touched = new Set<string>(todaySessions.map((s) => s.jobId));
  for (const j of jobs) if (dayLogOf(j)?.some((m) => m.date === today && m.to !== m.from)) touched.add(j.id);
  const words = Math.round(daily.get(today) || 0);
  if (touched.size === 0 && words <= 0) return null;

  const week = Array.from({ length: 7 }, (_, i) => daily.get(addDays(today, -1 - i)) || 0);
  const avg = Math.round(week.reduce((s, v) => s + v, 0) / 7);
  const minutes = Math.round(todaySessions.reduce((s, x) => s + sessionMs(x), 0) / 60_000);
  const next = jobs
    .filter((j) => j.status === 'active' && j.dueAt && (j.progress ?? 0) < 100)
    .sort((a, b) => a.dueAt!.localeCompare(b.dueAt!))[0];
  const nextDue = next ? dueInfo(next.dueAt, addDays(today, 1)) : undefined;

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, today);
    } catch {
      // private mode: it simply comes back on reload
    }
    setDismissed(today);
  };

  const vsWeek =
    avg <= 0
      ? tx('近 7 天來的第一筆，好的開始。', 'Your first in 7 days. A good start.')
      : words >= avg * 1.1
        ? tx(`比近 7 天平均（${num(avg)} 字）多一些，辛苦了。`, `A bit above your 7-day average of ${num(avg)}. Well earned.`)
        : words >= avg * 0.9
          ? tx(`和近 7 天平均（${num(avg)} 字）差不多，穩穩的。`, `Right around your 7-day average of ${num(avg)}. Steady.`)
          : tx(`比近 7 天平均（${num(avg)} 字）少一點，有些日子本來就這樣。`, `A little under your 7-day average of ${num(avg)}. Some days are like that.`);

  return (
    <section className="card relative overflow-hidden px-5 py-4 motion-safe:[animation:rise_.6s_cubic-bezier(.2,.8,.2,1)_both]" aria-labelledby="eod-title">
      <button type="button" onClick={dismiss} className="absolute right-2 top-2 grid h-10 w-10 place-items-center rounded-[3px] text-muted transition-colors hover:text-ink" aria-label={tx('今天不再顯示', 'Hide for today')}>
        <X size={16} />
      </button>
      <div className="eyebrow flex items-center gap-1.5">
        <Moon size={13} aria-hidden /> {tx('今日收工', 'Wrapping up')}
      </div>
      <h2 id="eod-title" className="font-display mt-1.5 pr-10 text-[20px] leading-tight text-ink">
        {words > 0 ? tx(`今天譯了 ${num(words)} 字`, `${num(words)} words today`) : tx('今天也有往前走', 'You moved things forward today')}
      </h2>
      {words > 0 && <p className="mt-1 text-[13.5px] text-ink-2">{vsWeek}</p>}
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-muted tnum">
        {minutes > 0 && <span>{tx(`專注 ${num(minutes)} 分鐘`, `${num(minutes)} min focused`)}</span>}
        <span>{tx(`處理了 ${touched.size} 個案件`, `${touched.size} ${touched.size === 1 ? 'job' : 'jobs'} touched`)}</span>
      </div>
      {next && (
        <button type="button" onClick={() => navigate('/jobs/' + next.id)} className="mt-3 block w-full border-t border-line pt-3 text-left">
          <span className="eyebrow">{tx('明天先從這裡開始', 'Start here tomorrow')}</span>
          <span className="mt-1 flex items-baseline justify-between gap-3">
            <span className="line-clamp-2 min-w-0 text-[14px] font-medium text-ink">{next.title || tx('（未命名）', '(Untitled)')}</span>
            {nextDue && <span className="shrink-0 text-[12px] text-muted">{nextDue.text}</span>}
          </span>
        </button>
      )}
      <p className="mt-3 text-[12px] text-muted">{tx('今天就到這裡，好好休息。', 'That’s enough for today. Rest well.')}</p>
    </section>
  );
}
