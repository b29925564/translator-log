import { ArrowDownRight, ArrowRight, ArrowUpRight, Sparkles } from 'lucide-react';
import { useMemo } from 'react';
import { ColumnChart, Heatmap, LoadChart, monthLabel } from '../charts/charts';
import { useData } from '../db/data';
import { addDays, dateOnly, diffDays, fmtDateLong, startOfMonth } from '../domain/dates';
import { jobGrossBase, jobWords } from '../domain/money';
import {
  bookedBetween,
  dailyWords,
  earnedBetween,
  insights,
  monthlySeries,
  monthsBack,
  receivables,
  streaks,
  totals,
  workload,
} from '../domain/stats';
import { getLang, tx } from '../i18n';
import { compact, greeting, money, num, pct } from '../ui/format';
import { cx, Kbd, Meter, SectionTitle } from '../ui/kit';
import { useUI } from '../ui/store';
import { useSpeed } from '../features/common';
import { insightView } from '../features/insightText';
import { SkylineHero } from '../features/SkylineHero';
import { TodayPlan } from '../features/TodayPlan';
import { FirstSteps } from '../features/FirstSteps';
import { Odometer } from '../ui/motion';

function Tile({ label, value, sub, children, onClick, className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode; onClick?: () => void; className?: string }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp type={onClick ? 'button' : undefined} onClick={onClick} className={cx('flex min-w-0 flex-col p-5 text-left', onClick && 'transition-colors hover:bg-surface-2', className)}>
      <div className="eyebrow">{label}</div>
      <div className="mt-3 truncate text-[28px] font-medium leading-none tracking-[-0.03em] text-ink">{value}</div>
      {sub && <div className="mt-2 text-[12.5px] text-muted">{sub}</div>}
      {children}
    </Comp>
  );
}

export function Dashboard() {
  const { jobs, clients, sessions, settings, today, clientMap, hours } = useData();
  const { navigate, openQuickAdd } = useUI();
  const speed = useSpeed();
  const base = settings.baseCurrency;
  const year = today.slice(0, 4);

  const m = useMemo(() => {
    const monthStart = startOfMonth(today);
    const dayOfMonth = Number(today.slice(8));
    const prevStart = startOfMonth(addDays(monthStart, -1));
    const prevSame = addDays(prevStart, dayOfMonth - 1);
    const earnedNow = totals(earnedBetween(jobs, monthStart, today));
    const earnedPrev = totals(earnedBetween(jobs, prevStart, prevSame < monthStart ? prevSame : addDays(monthStart, -1)));
    const pipeline = jobs.filter((j) => j.status === 'active').reduce((s, j) => s + jobGrossBase(j), 0);
    const series = monthlySeries(jobs, monthsBack(today, 12));
    const ytd = totals(earnedBetween(jobs, `${year}-01-01`, today));
    const ytdWithBooked = totals(bookedBetween(jobs, `${year}-01-01`, `${year}-12-31`));
    const rec = receivables(jobs, clients, today);
    const outstanding = rec.reduce((s, r) => s + r.amountBase, 0);
    const overdue = rec.filter((r) => r.daysOverdue > 0);
    const last90 = earnedBetween(jobs, addDays(today, -90), today).filter((j) => (hours.get(j.id) || 0) > 0);
    const h90 = last90.reduce((s, j) => s + (hours.get(j.id) || 0), 0);
    const hourly = h90 > 2 ? last90.reduce((s, j) => s + jobGrossBase(j), 0) / h90 : undefined;
    const active = jobs
      .filter((j) => j.status === 'active')
      .sort((a, b) => (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999'));
    const load = workload(jobs, settings.work, today, 14, speed.wph);
    const daily = dailyWords(jobs, sessions, today, settings.work.workDays);
    const st = streaks(daily, today, settings.work.workDays);
    const ins = insights({ jobs, clients, sessions, today, work: settings.work, yearGoal: settings.goals.yearIncome });
    const dueThisWeek = active.filter((j) => j.dueAt && diffDays(today, dateOnly(j.dueAt)) <= 7).length;
    const wordsMonth = earnedNow.words + active.reduce((s, j) => s + jobWords(j) * ((j.progress || 0) / 100), 0);
    return { earnedNow, earnedPrev, pipeline, series, ytd, ytdWithBooked, outstanding, overdue, hourly, active, load, daily, st, ins, dueThisWeek, wordsMonth };
  }, [jobs, clients, sessions, settings, today, hours, speed.wph, year]);

  const delta = m.earnedPrev.income > 0 ? (m.earnedNow.income - m.earnedPrev.income) / m.earnedPrev.income : undefined;
  const goal = settings.goals.yearIncome;
  const firstName = settings.profile.name ? (getLang() === 'en' ? (settings.profile.nameEn || settings.profile.name).split(' ')[0] : settings.profile.name.slice(-2)) : '';
  const heatFrom = addDays(today, -364);
  const monthName = new Intl.DateTimeFormat(getLang() === 'en' ? 'en-US' : 'zh-TW', { month: 'long' }).format(new Date());

  const header = (
    <header>
      <div className="flex flex-wrap items-end justify-between gap-4 pb-4">
        <div>
          <div className="eyebrow mb-2">{fmtDateLong(today, getLang())}</div>
          <h1 className="font-display text-[34px] leading-[1.05] text-ink md:text-[46px]">
            {greeting()}
            {firstName && tx(`，${firstName}`, `, ${firstName}`)}
          </h1>
          <p className="mt-2 text-[14.5px] text-ink-2">
            {jobs.length === 0
              ? tx('這是你的工作紀錄本。先記下一個案件，其他的交給我。', 'This is your work log. Note down one job and the rest follows.')
              : m.active.length
                ? tx(`手上有 ${m.active.length} 個案件，其中 ${m.dueThisWeek} 個在 7 天內截稿。`, `${m.active.length} jobs in progress, ${m.dueThisWeek} due within 7 days.`)
                : tx('目前沒有進行中的案件，好好休息。', 'Nothing in progress right now. Enjoy the breather.')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => openQuickAdd()}
          className="hidden h-11 w-[340px] items-center gap-2.5 rounded-[3px] border border-line-strong bg-surface px-3.5 text-left text-[14px] text-muted transition-colors hover:border-ink hover:text-ink md:flex"
        >
          <Sparkles size={15} className="text-gold" />
          <span className="flex-1 truncate">{tx('一句話新增案件…', 'Add a job in one line…')}</span>
          <Kbd>N</Kbd>
        </button>
      </div>
      <div className="rule-deco" />
    </header>
  );

  if (jobs.length === 0) {
    return (
      <div className="stagger flex flex-col gap-5">
        {header}
        <SkylineHero />
        <FirstSteps />
      </div>
    );
  }

  return (
    <div className="stagger flex flex-col gap-5">
      {header}
      <SkylineHero />

      <div className="grid items-start gap-4 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-7">
          <TodayPlan />
        </div>
        <div className="ruled min-w-0 grid-cols-2 lg:col-span-5">
          <Tile
            label={tx(`${monthName} · 已完成收入`, `Earned · ${monthName}`)}
            value={<Odometer text={money(m.earnedNow.income, base)} />}
            className="col-span-2"
            sub={
              <span className="flex flex-wrap gap-x-3 gap-y-0.5">
                {delta != null && (
                  <span className={cx('inline-flex items-center gap-0.5 font-medium', delta >= 0 ? 'text-good' : 'text-bad')}>
                    {delta >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    {pct(Math.abs(delta))} {tx('較上月同期', 'vs. same point last month')}
                  </span>
                )}
                {m.pipeline > 0 && <span>+ {money(m.pipeline, base, { compact: true })} {tx('進行中', 'in progress')}</span>}
              </span>
            }
          />
          <Tile
            label={tx(`${year} 年收入`, `${year} income`)}
            value={money(m.ytd.income, base, { compact: true })}
            sub={goal ? tx(`目標 ${money(goal, base, { compact: true })}`, `Goal ${money(goal, base, { compact: true })}`) : undefined}
            className="col-span-2"
          >
            {goal ? (
              <div className="mt-3">
                <Meter value={m.ytd.income} max={goal} label={tx('年度目標', 'Yearly goal')} />
                <div className="mt-1.5 flex justify-between text-[12px] text-muted">
                  <span>{pct(m.ytd.income / goal)}</span>
                  <span>
                    {tx('含進行中', 'With booked')} {pct(m.ytdWithBooked.income / goal)}
                  </span>
                </div>
              </div>
            ) : null}
          </Tile>
          <Tile
            label={tx('應收帳款', 'Outstanding')}
            value={money(m.outstanding, base, { compact: true })}
            sub={
              m.overdue.length ? (
                <span className="font-medium text-bad">{tx(`${m.overdue.length} 筆逾期`, `${m.overdue.length} overdue`)}</span>
              ) : (
                tx('全部準時', 'All on time')
              )
            }
            onClick={() => navigate('/money')}
          />
          <Tile
            label={tx('有效時薪', 'Effective hourly')}
            value={m.hourly ? money(m.hourly, base) : '—'}
            sub={m.hourly ? tx('近 90 天計時案件', 'Timed jobs, last 90 days') : tx('用計時器累積數據', 'Use the timer to measure')}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <section className="card min-w-0 p-4 sm:p-5 lg:col-span-7">
          <SectionTitle
            eyebrow={tx(`本月 ${num(Math.round(m.wordsMonth))} 字`, `${num(Math.round(m.wordsMonth))} words this month`)}
            action={
              <button type="button" className="inline-flex items-center gap-1 text-[13px] font-medium text-ink underline decoration-gold decoration-1 underline-offset-4" onClick={() => navigate('/insights')}>
                {tx('洞察', 'Insights')} <ArrowRight size={14} />
              </button>
            }
          >
            {tx('近 12 個月收入', 'Income, last 12 months')}
          </SectionTitle>
          <ColumnChart
            height={180}
            data={m.series.map((p, i) => ({
              key: p.month,
              label: monthLabel(p.month),
              value: p.earned,
              extra: p.projected,
              highlight: i === m.series.length - 1,
            }))}
            format={(v) => money(v, base)}
            valueLabel={tx('已完成', 'Earned')}
            extraLabel={tx('進行中（預估）', 'In progress (est.)')}
            onSelect={() => navigate('/insights')}
          />
          <div className="mt-2 flex flex-wrap gap-x-4 text-[12px] text-ink-2">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[1px]" style={{ background: 'var(--series-1)' }} />
              {tx('已完成', 'Earned')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[1px]" style={{ background: 'var(--series-1)', opacity: 'var(--extra-alpha, 0.3)' }} />
              {tx('進行中（預估）', 'In progress (est.)')}
            </span>
          </div>
        </section>

        <section className="card min-w-0 p-4 sm:p-5 lg:col-span-5">
          <SectionTitle eyebrow={tx(`速度 ${num(speed.wph)} 字/時`, `${num(speed.wph)} words/h`)}>{tx('未來兩週負荷', 'Next two weeks')}</SectionTitle>
          <LoadChart data={m.load.map((d) => ({ date: d.date, hours: d.hours, capacity: d.capacity }))} />
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: 'var(--series-1)' }} />
              {tx('已排工時', 'Booked hours')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: 'var(--bad)' }} />
              {tx('超出負荷', 'Over capacity')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-3.5 rounded" style={{ background: 'var(--ink-2)' }} />
              {tx(`每日 ${settings.work.hoursPerDay} 小時`, `${settings.work.hoursPerDay} h/day`)}
            </span>
          </div>
        </section>
      </div>

      {m.ins.length > 0 && (
        <section>
          <SectionTitle>{tx('洞察', 'Insights')}</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {m.ins.slice(0, 6).map((ins, i) => {
              const v = insightView(ins, clientMap, base);
              return (
                <button
                  key={i}
                  type="button"
                  disabled={!v.link}
                  onClick={() => v.link && navigate(v.link)}
                  className="card flex gap-3 p-4 text-left transition-colors enabled:hover:border-line-strong"
                >
                  <span
                    className={cx(
                      'grid h-9 w-9 shrink-0 place-items-center rounded-xl',
                      v.tone === 'good' ? 'bg-good-soft text-good' : v.tone === 'warn' ? 'bg-warn-soft text-warn' : 'bg-accent-soft text-accent',
                    )}
                  >
                    {v.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold text-ink">{v.title}</span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-muted">{v.body}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="card p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="eyebrow mb-0.5">{tx('近一年', 'Last 12 months')}</div>
            <h2 className="text-[15px] font-semibold text-ink">{tx('翻譯足跡', 'Your trail')}</h2>
          </div>
          <div className="flex gap-5 text-right">
            <div>
              <div className="text-[18px] font-semibold text-ink">{m.st.current}</div>
              <div className="text-[11.5px] text-muted">{tx('目前連續天數', 'Current streak')}</div>
            </div>
            <div>
              <div className="text-[18px] font-semibold text-ink">{m.st.longest}</div>
              <div className="text-[11.5px] text-muted">{tx('最長連續', 'Longest')}</div>
            </div>
          </div>
        </div>
        <Heatmap daily={m.daily} from={heatFrom} to={today} format={(v) => (v ? tx(`${num(Math.round(v))} 字`, `${num(Math.round(v))} words`) : tx('沒有紀錄', 'No work logged'))} />
        <div className="mt-3 flex items-center justify-between text-[12.5px] text-muted">
          <span>{tx(`今年累計 ${compact(m.ytd.words)} 字`, `${compact(m.ytd.words)} words so far this year`)}</span>
          <button type="button" className="inline-flex items-center gap-1.5 font-medium text-ink underline decoration-gold decoration-1 underline-offset-4" onClick={() => navigate('/wrapped')}>
            <Sparkles size={14} /> {tx('看年度回顧', 'Open year in review')}
          </button>
        </div>
      </section>
    </div>
  );
}
