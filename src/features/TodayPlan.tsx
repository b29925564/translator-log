// “Today”: how much of each job to do today to land every deadline, what is
// already done, and a live countdown to the next one. Progress logged here
// feeds the plan, the workload chart and the skyline.

import { Check, Crosshair, NotebookPen } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../db/data';
import { saveJob, withStatus } from '../db/repo';
import { addDays, dateOnly, fmtDate, fmtDateLong, parseISO, toISODate, workingDays } from '../domain/dates';
import { createdDay, lastMarkDate } from '../domain/progress';
import { jobWords } from '../domain/money';
import { todayPlan, type PlanItem, type PlanState } from '../domain/stats';
import type { Job } from '../domain/types';
import { getLang, tx } from '../i18n';
import { dueInfo, num } from '../ui/format';
import { Button, cx, Pair, Sheet } from '../ui/kit';
import { haptic } from '../ui/motion';
import { useUI } from '../ui/store';
import { TimerButton, useSpeed } from './common';

const STATE_COLOR: Record<PlanState, string> = {
  overdue: 'var(--bad)',
  today: 'var(--warn)',
  tight: 'var(--warn)',
  event: 'var(--gold)',
  ok: 'var(--ink)',
  rest: 'var(--line-strong)',
};

const unitWord = (u: PlanItem['unit'], n: number) =>
  u === 'minute' ? tx(`${num(n)} 分鐘`, `${num(n)} min`) : u === 'char' ? tx(`${num(n)} 字`, `${num(n)} chars`) : tx(`${num(n)} 字`, `${num(n)} words`);

/** Deadline as a timestamp; a date-only deadline means the end of that day. */
export const dueMs = (due: string) => {
  const d = parseISO(dateOnly(due));
  if (due.includes('T')) {
    const [h, m] = due.slice(11, 16).split(':').map(Number);
    d.setHours(h || 0, m || 0, 0, 0);
  } else d.setHours(23, 59, 59, 0);
  return d.getTime();
};

const fmtCountdown = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const hh = String(Math.floor((s % 86400) / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return { d, clock: `${hh}:${mm}:${ss}` };
};

function Countdown({ jobs }: { jobs: Job[] }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const next = jobs
    .filter((j) => j.status === 'active' && j.dueAt)
    .map((j) => ({ j, at: dueMs(j.dueAt!) }))
    .filter((x) => x.at > now)
    .sort((a, b) => a.at - b.at)[0];
  if (!next) return null;
  const c = fmtCountdown(next.at - now);
  return (
    <div className="min-w-0 text-right">
      <div className="eyebrow">{tx('下一個截稿', 'Next deadline')}</div>
      <div className="mt-1.5 font-mono text-[20px] font-medium tracking-[-0.01em] text-ink tnum">
        {c.d > 0 && <span className="mr-1.5">{tx(`${c.d}天`, `${c.d}d`)}</span>}
        {c.clock}
      </div>
      <div className="mt-0.5 max-w-[200px] truncate text-[12px] text-muted">{next.j.title}</div>
    </div>
  );
}

function Ring({ value, size = 64 }: { value: number; size?: number }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${Math.round(value * 100)}%`} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={5} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--gold)"
        strokeWidth={5}
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(1, value))}
        style={{ transition: 'stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)' }}
      />
    </svg>
  );
}

export function TodayPlan() {
  const { jobs, settings, today, clientMap } = useData();
  const { navigate, openQuickAdd, fireStamp } = useUI();
  const speed = useSpeed();
  const plan = useMemo(() => todayPlan(jobs, settings.work, today, speed.wph), [jobs, settings.work, today, speed.wph]);
  const [logging, setLogging] = useState<string | null>(null);
  const wasDone = useRef(plan.progress >= 1);
  const targetWords = plan.items.filter((x) => x.unit !== 'minute').reduce((s, x) => s + x.target, 0);
  const doneWords = plan.items.filter((x) => x.unit !== 'minute').reduce((s, x) => s + Math.min(x.doneToday, x.target || x.doneToday), 0);
  const over = plan.hours - settings.work.hoursPerDay;
  const weekday = new Intl.DateTimeFormat(getLang() === 'en' ? 'en-US' : 'zh-TW', { weekday: 'long' }).format(parseISO(today));

  // celebrate the moment the day's plan is complete
  useEffect(() => {
    const done = plan.progress >= 1 && plan.items.some((x) => x.target > 0);
    if (done && !wasDone.current) fireStamp(tx('今日達標', 'DAY DONE'), today.replace(/-/g, '.'));
    wasDone.current = done;
  }, [plan.progress, plan.items, fireStamp, today]);

  const logJob = logging ? jobs.find((j) => j.id === logging) : undefined;

  return (
    <section className="card flex flex-col overflow-hidden">
      <div className="flex items-start justify-between gap-4 px-5 pb-4 pt-5">
        <div className="min-w-0">
          <div className="eyebrow">
            {tx('今日', 'Today')} · {weekday}
          </div>
          <h2 className="font-display mt-1.5 text-[22px] leading-tight text-ink">{tx('今日計畫', 'Today’s plan')}</h2>
        </div>
        <Countdown jobs={jobs} />
      </div>

      {plan.items.length === 0 ? (
        <div className="border-t border-line px-5 py-8 text-center">
          <p className="text-[14px] text-ink-2">{tx('沒有進行中的案件。新增一個，這裡就會替你排好每天的進度。', 'Nothing in progress. Add a job and this plans your days for you.')}</p>
          <Button className="mt-4" variant="primary" onClick={() => openQuickAdd()}>
            {tx('新增案件', 'New job')}
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4 border-t border-line px-5 py-4">
            <div className="relative grid place-items-center">
              <Ring value={plan.progress} />
              <span className="absolute text-[13px] font-semibold text-ink tnum">{Math.round(plan.progress * 100)}%</span>
            </div>
            <div className="min-w-0">
              {plan.isWorkDay || targetWords > 0 ? (
                <>
                  <div className="text-[15px] text-ink">
                    <span className="text-[22px] font-medium tracking-[-0.02em] tnum">{num(Math.round(doneWords))}</span>
                    <span className="text-muted"> / {tx(`${num(Math.round(targetWords))} 字`, `${num(Math.round(targetWords))} words`)}</span>
                  </div>
                  <div className={cx('mt-0.5 text-[12.5px]', over > 0.25 ? 'font-medium text-warn' : 'text-muted')}>
                    {over > 0.25
                      ? tx(`約 ${num(plan.hours, 1)} 小時，比每日 ${settings.work.hoursPerDay} 小時多 ${num(over, 1)} 小時`, `About ${num(plan.hours, 1)} h, ${num(over, 1)} h over your ${settings.work.hoursPerDay} h day`)
                      : tx(`約 ${num(plan.hours, 1)} 小時（每日 ${settings.work.hoursPerDay} 小時）`, `About ${num(plan.hours, 1)} h of your ${settings.work.hoursPerDay} h day`)}
                  </div>
                </>
              ) : (
                <div className="text-[14px] text-ink-2">{tx('今天是休息日，沒有非做不可的進度。', 'A rest day: nothing has to happen today.')}</div>
              )}
            </div>
          </div>
          <ul className="hairline-list border-t border-line">
            {plan.items.slice(0, 6).map((x) => (
              <PlanRow key={x.job.id} x={x} client={x.job.clientId ? clientMap.get(x.job.clientId)?.name : undefined} onLog={() => setLogging(x.job.id)} onOpen={() => navigate('/jobs/' + x.job.id)} onFocus={() => navigate('/focus/' + x.job.id)} />
            ))}
          </ul>
          {plan.items.length > 6 && (
            <button type="button" className="border-t border-line px-5 py-3 text-left text-[13px] font-medium text-ink-2 hover:text-ink" onClick={() => navigate('/jobs')}>
              {tx(`還有 ${plan.items.length - 6} 個案件 →`, `${plan.items.length - 6} more jobs →`)}
            </button>
          )}
        </>
      )}
      {logJob && <LogProgress job={logJob} onClose={() => setLogging(null)} />}
    </section>
  );
}

function PlanRow({ x, client, onLog, onOpen, onFocus }: { x: PlanItem; client?: string; onLog: () => void; onOpen: () => void; onFocus: () => void }) {
  const { today } = useData();
  const due = dueInfo(x.job.dueAt, today);
  const share = x.target > 0 ? Math.min(1, x.doneToday / x.target) : x.doneToday > 0 ? 1 : 0;
  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <span className="h-8 w-[3px] shrink-0" style={{ background: STATE_COLOR[x.state] }} aria-hidden />
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onOpen}>
        <div className="truncate text-[14.5px] font-medium text-ink hover:underline">{x.job.title || tx('（未命名）', '(Untitled)')}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted">
          <Pair source={x.job.sourceLang} target={x.job.targetLang} />
          {client && <span className="max-w-[140px] truncate">{client}</span>}
          {due && <span className={cx('font-medium', due.tone === 'bad' ? 'text-bad' : due.tone === 'warn' ? 'text-warn' : 'text-ink-2')}>{due.text}</span>}
        </div>
      </button>
      <div className="w-[108px] shrink-0 text-right">
        {x.state === 'event' ? (
          <div className="text-[13px] font-medium text-ink">{x.hours ? tx(`今天 ${num(x.hours, 1)} 小時`, `${num(x.hours, 1)} h today`) : tx('排定日期', 'Scheduled')}</div>
        ) : x.state === 'rest' ? (
          <div className="text-[13px] text-muted">{tx('今天休息', 'Rest day')}</div>
        ) : (
          <>
            <div className="text-[13.5px] font-medium text-ink tnum">{unitWord(x.unit, Math.round(x.target))}</div>
            <div className="mt-1 h-[3px] w-full bg-surface-3">
              <div className="h-full bg-gold" style={{ width: `${share * 100}%`, transition: 'width .8s cubic-bezier(.2,.8,.2,1)' }} />
            </div>
            <div className="mt-1 text-[11px] text-muted tnum">{x.doneToday > 0 ? tx(`已完成 ${num(Math.round(x.doneToday))}`, `${num(Math.round(x.doneToday))} done`) : tx(`完成度 ${x.job.progress ?? 0}%`, `${x.job.progress ?? 0}% overall`)}</div>
          </>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {x.state !== 'event' && (
          <button type="button" onClick={onLog} className="grid h-8 w-8 place-items-center rounded-[3px] border border-line-strong text-ink-2 transition-colors hover:border-ink hover:text-ink" aria-label={tx('記錄進度', 'Log progress')} title={tx('記錄進度', 'Log progress')}>
            <NotebookPen size={14} />
          </button>
        )}
        <button type="button" onClick={onFocus} className="grid h-8 w-8 place-items-center rounded-[3px] border border-line-strong text-ink-2 transition-colors hover:border-ink hover:text-ink" aria-label={tx('專注模式', 'Focus mode')} title={tx('專注模式', 'Focus mode')}>
          <Crosshair size={14} />
        </button>
        <span className="hidden sm:contents">
          <TimerButton job={x.job} />
        </span>
      </div>
    </li>
  );
}

/** Progress logger: a slider plus quick “+words” chips, shared with Focus mode. */
export function LogProgress({ job, onClose, onSaved, initial }: { job: Job; onClose: () => void; onSaved?: (words: number) => void; initial?: number }) {
  const { today, sessions, settings } = useData();
  const { toast, fireStamp } = useUI();
  const [p, setP] = useState(initial ?? job.progress ?? 0);
  // when the work was done: today, yesterday, or over the days since the last log
  const yesterday = addDays(today, -1);
  const last = lastMarkDate(job);
  const since = last ? addDays(last, 1) : dateOnly(job.receivedAt ?? createdDay(job));
  const canYesterday = job.status === 'active' && createdDay(job) <= yesterday && (!last || last <= yesterday);
  const canSpread = job.status === 'active' && since <= yesterday && since >= createdDay(job);
  const timedToday = sessions.some((x) => x.jobId === job.id && toISODate(new Date(x.start)) === today);
  const [when, setWhen] = useState<'today' | 'yesterday' | 'spread'>(() =>
    settings.work.lateLog === 'spread' && canSpread && !timedToday && workingDays(since, yesterday, settings.work.workDays).length > 0 ? 'spread' : 'today',
  );
  const logOpts = when === 'yesterday' ? { date: yesterday } : when === 'spread' ? { since } : {};
  const dayName = (d: string) => fmtDate(d, getLang(), { month: 'numeric', day: 'numeric', weekday: 'short' });
  const total = jobWords(job) || (job.unit === 'page' ? job.quantity * 250 : job.unit === 'minute' ? job.quantity : 0);
  const unit: PlanItem['unit'] = job.unit === 'minute' ? 'minute' : job.unit === 'char' ? 'char' : 'word';
  const delta = ((p - (job.progress ?? 0)) / 100) * total;
  const bump = (words: number) => setP((v) => Math.min(100, Math.round((v + (total ? (words / total) * 100 : 0)) * 10) / 10));
  const save = async (deliver = false) => {
    const next = { ...job, progress: Math.round(p * 10) / 10 };
    // save the progress first so its words land on the chosen day, then deliver
    const saved = await saveJob(next, logOpts);
    if (deliver) await saveJob(withStatus(saved, 'delivered', today));
    haptic(deliver ? [12, 60, 18] : 10);
    const on = when === 'yesterday' ? dayName(yesterday) : when === 'spread' ? `${dayName(since)}–${dayName(today)}` : dayName(today);
    if (deliver) fireStamp(tx('已交稿', 'DELIVERED'), today.replace(/-/g, '.'));
    else if (delta > 0) toast(tx(`記下了 ${unitWord(unit, Math.round(delta))} · ${on}`, `Logged ${unitWord(unit, Math.round(delta))} · ${on}`), { tone: 'good' });
    onSaved?.(delta);
    onClose();
  };
  const steps = unit === 'minute' ? [5, 10, 30] : [250, 500, 1000, 2000];
  return (
    <Sheet
      open
      onClose={onClose}
      title={tx('記錄進度', 'Log progress')}
      subtitle={job.title}
      size="sm"
      footer={
        <>
          {p >= 100 && (
            <Button variant="secondary" icon={<Check size={16} />} onClick={() => void save(true)}>
              {tx('完成並交稿', 'Done & delivered')}
            </Button>
          )}
          <Button variant="primary" data-autofocus onClick={() => void save(false)}>
            {tx('儲存', 'Save')}
          </Button>
        </>
      }
    >
      <div className="flex items-end justify-between">
        <div className="text-[44px] font-medium leading-none tracking-[-0.04em] text-ink tnum">{Math.round(p * 10) / 10}%</div>
        <div className="text-right text-[13px] text-muted tnum">
          {total > 0 && unitWord(unit, Math.round((p / 100) * total))} / {total > 0 ? unitWord(unit, total) : '—'}
          {delta !== 0 && <div className={cx('font-medium', delta > 0 ? 'text-good' : 'text-bad')}>{delta > 0 ? '+' : '−'}{unitWord(unit, Math.abs(Math.round(delta)))}</div>}
        </div>
      </div>
      <input type="range" min={0} max={100} step={1} value={p} onChange={(e) => setP(Number(e.target.value))} className="mt-5 w-full accent-[var(--gold)]" aria-label={tx('完成度', 'Progress')} />
      {total > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {steps.map((w) => (
            <button key={w} type="button" className="chip tnum" onClick={() => bump(w)}>
              +{unitWord(unit, w)}
            </button>
          ))}
          <button type="button" className="chip" onClick={() => setP(100)}>
            {tx('全部完成', 'All done')}
          </button>
        </div>
      )}
      {delta > 0 && (canYesterday || canSpread) && (
        <div className="mt-4">
          <div className="eyebrow mb-2">{tx('記在', 'Done')}</div>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={tx('記在哪天', 'When it was done')}>
            <button type="button" role="radio" className="chip" aria-checked={when === 'today'} aria-pressed={when === 'today'} onClick={() => setWhen('today')}>
              {tx('今天', 'Today')}
            </button>
            {canYesterday && (
              <button type="button" role="radio" className="chip" aria-checked={when === 'yesterday'} aria-pressed={when === 'yesterday'} onClick={() => setWhen('yesterday')}>
                {tx('昨天', 'Yesterday')}
              </button>
            )}
            {canSpread && (
              <button type="button" role="radio" className="chip" aria-checked={when === 'spread'} aria-pressed={when === 'spread'} onClick={() => setWhen('spread')}>
                {tx(`前幾天陸續（${dayName(since)}–今天）`, `Over the past days (${dayName(since)}–today)`)}
              </button>
            )}
          </div>
        </div>
      )}
      <p className="mt-4 text-[12px] text-muted">{tx(`今天是 ${fmtDateLong(today, 'zh-TW')}。記錄的進度會更新今日計畫、工作負荷與天際線。`, 'Logged progress updates today’s plan, your workload and the skyline.')}</p>
    </Sheet>
  );
}
