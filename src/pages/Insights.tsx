import { useMemo, useState } from 'react';
import { BarList, ChartCard, ColumnChart, Heatmap, LineChart, monthLabel } from '../charts/charts';
import { useData } from '../db/data';
import { langInfo } from '../domain/constants';
import { addDays, weekday } from '../domain/dates';
import { jobGrossBase, jobWords } from '../domain/money';
import {
  dailyWords,
  earnedBetween,
  groupJobs,
  incomeDate,
  milestones,
  monthlySeries,
  monthsBack,
  pairKey,
  topWithOther,
  totals,
  workWords,
  type Milestone,
} from '../domain/stats';
import { getLang, tx } from '../i18n';
import { compact, domain as domainName, money, num, pct, rate as fmtRateStr, service as serviceName } from '../ui/format';
import { cx, Meter, PageHeader, Segmented, Select } from '../ui/kit';
import { useUI } from '../ui/store';
import { Medallion } from '../app/Stamps';
import { fxRate } from '../domain/money';

type Period = 'ytd' | 'last' | 'r12' | 'all';

const monthsBetween = (from: string, to: string) => {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const ey = Number(to.slice(0, 4));
  const em = Number(to.slice(5, 7));
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
};

export function Insights() {
  const { jobs, sessions, clientMap, settings, today, hours } = useData();
  const navigate = useUI((s) => s.navigate);
  const [period, setPeriod] = useState<Period>('r12');
  const base = settings.baseCurrency;
  const year = Number(today.slice(0, 4));

  const range = useMemo(() => {
    const first = jobs.length ? jobs.map(incomeDate).sort()[0] : today;
    switch (period) {
      case 'ytd':
        return { from: `${year}-01-01`, to: today, prevFrom: `${year - 1}-01-01`, prevTo: addDays(today, -365) };
      case 'last':
        return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31`, prevFrom: `${year - 2}-01-01`, prevTo: `${year - 2}-12-31` };
      case 'r12':
        return { from: addDays(today, -364), to: today, prevFrom: addDays(today, -729), prevTo: addDays(today, -365) };
      default:
        return { from: first, to: today, prevFrom: '', prevTo: '' };
    }
  }, [period, jobs, today, year]);

  const d = useMemo(() => {
    const cur = earnedBetween(jobs, range.from, range.to);
    const prev = range.prevFrom ? earnedBetween(jobs, range.prevFrom, range.prevTo) : [];
    const t = totals(cur, hours);
    const pt = totals(prev, hours);
    const months = period === 'all' ? monthsBetween(range.from.slice(0, 7), range.to.slice(0, 7)) : period === 'r12' ? monthsBack(today, 12) : monthsBetween(range.from.slice(0, 7), range.to.slice(0, 7));
    const series = monthlySeries(cur, months);
    const clients = topWithOther(groupJobs(cur.filter((j) => j.clientId), (j) => j.clientId, hours), 8);
    const domains = groupJobs(cur, (j) => j.domain ?? 'general', hours).sort((a, b) => b.words - a.words);
    const pairs = groupJobs(cur, pairKey, hours);
    const services = groupJobs(cur, (j) => j.service, hours);
    const hourly = groupJobs(cur.filter((j) => j.clientId && (hours.get(j.id) || 0) > 0), (j) => j.clientId, hours)
      .filter((g) => g.hours >= 3 && g.hourly)
      .sort((a, b) => (b.hourly || 0) - (a.hourly || 0))
      .slice(0, 8);
    const speed = groupJobs(cur.filter((j) => (hours.get(j.id) || 0) > 0.5 && jobWords(j) > 0 && j.service !== 'interpreting'), (j) => j.domain ?? 'general', hours)
      .map((g) => {
        const list = cur.filter((j) => (j.domain ?? 'general') === g.key && (hours.get(j.id) || 0) > 0.5 && jobWords(j) > 0 && j.service !== 'interpreting');
        const ww = list.reduce((s, j) => s + workWords(j), 0);
        const hh = list.reduce((s, j) => s + (hours.get(j.id) || 0), 0);
        return { key: g.key, wph: hh ? ww / hh : 0, hours: hh };
      })
      .filter((x) => x.hours >= 2)
      .sort((a, b) => b.wph - a.wph);
    const daily = dailyWords(jobs, sessions, today, settings.work.workDays);
    const byWeekday = [1, 2, 3, 4, 5, 6, 0].map((wd) => ({
      wd,
      words: [...daily.entries()].filter(([dd]) => dd >= range.from && dd <= range.to && weekday(dd) === wd).reduce((s, [, v]) => s + v, 0),
    }));
    const wordRate = (list: typeof cur) => {
      const wj = list.filter((j) => (j.unit === 'word' || j.unit === 'char') && jobWords(j) > 0);
      const w = wj.reduce((s, j) => s + jobWords(j), 0);
      return w ? wj.reduce((s, j) => s + jobGrossBase(j), 0) / w : undefined;
    };
    const hSum = cur.reduce((s, j) => s + (hours.get(j.id) || 0), 0);
    const hIncome = cur.filter((j) => (hours.get(j.id) || 0) > 0).reduce((s, j) => s + jobGrossBase(j), 0);
    const hSumPrev = prev.reduce((s, j) => s + (hours.get(j.id) || 0), 0);
    const hIncomePrev = prev.filter((j) => (hours.get(j.id) || 0) > 0).reduce((s, j) => s + jobGrossBase(j), 0);
    return {
      cur,
      t,
      pt,
      series,
      clients,
      domains,
      pairs,
      services,
      hourly,
      speed,
      daily,
      byWeekday,
      rate: wordRate(cur),
      prevRate: wordRate(prev),
      hourlyAll: hSum > 2 ? hIncome / hSum : undefined,
      prevHourly: hSumPrev > 2 ? hIncomePrev / hSumPrev : undefined,
      clientCount: new Set(cur.map((j) => j.clientId).filter(Boolean)).size,
      prevClientCount: new Set(prev.map((j) => j.clientId).filter(Boolean)).size,
    };
  }, [jobs, sessions, range, hours, period, today, settings.work.workDays]);

  // rate trend for one language pair, by quarter, over all time
  const pairOptions = useMemo(() => groupJobs(jobs.filter((j) => (j.unit === 'word' || j.unit === 'char') && jobWords(j) > 0), pairKey).map((g) => g.key), [jobs]);
  const [pair, setPair] = useState<string>('');
  const activePair = pair || pairOptions[0] || '';
  const trend = useMemo(() => {
    const list = jobs.filter((j) => pairKey(j) === activePair && (j.unit === 'word' || j.unit === 'char') && jobWords(j) > 0 && (j.status === 'delivered' || j.status === 'invoiced' || j.status === 'paid'));
    const q = (iso: string) => `${iso.slice(0, 4)}-Q${Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1}`;
    const m = new Map<string, { inc: number; w: number }>();
    for (const j of list) {
      const k = q(incomeDate(j));
      const x = m.get(k) ?? { inc: 0, w: 0 };
      x.inc += jobGrossBase(j);
      x.w += jobWords(j);
      m.set(k, x);
    }
    return [...m.entries()].sort().map(([k, v]) => ({ key: k, label: k.replace('-', ' '), value: v.w ? v.inc / v.w : undefined }));
  }, [jobs, activePair]);

  const ms = useMemo(() => milestones(jobs, fxRate(base, 'TWD', settings.fx.rates)), [jobs, base, settings.fx.rates]);

  const delta = (a?: number, b?: number) => (a != null && b ? (a - b) / b : undefined);
  const statTiles = [
    { label: tx('收入', 'Income'), value: money(d.t.income, base, { compact: true }), delta: delta(d.t.income, d.pt.income) },
    { label: tx('字數', 'Words'), value: compact(d.t.words), delta: delta(d.t.words, d.pt.words) },
    { label: tx('案件', 'Jobs'), value: num(d.t.jobs), delta: delta(d.t.jobs, d.pt.jobs) },
    { label: tx('合作客戶', 'Clients'), value: num(d.clientCount), delta: delta(d.clientCount, d.prevClientCount) },
    { label: tx('每字均價', 'Per word'), value: d.rate ? fmtRateStr(d.rate, base) : '—', delta: delta(d.rate, d.prevRate) },
    { label: tx('有效時薪', 'Hourly'), value: d.hourlyAll ? money(d.hourlyAll, base) : '—', delta: delta(d.hourlyAll, d.prevHourly) },
  ];
  const en = getLang() === 'en';
  const pairLabel = (k: string) => {
    const [a, b] = k.split('>');
    return `${langInfo(a).short} → ${langInfo(b).short}`;
  };

  return (
    <div>
      <PageHeader eyebrow={tx('數據說話', 'Your numbers')} title={tx('洞察', 'Insights')} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'r12', label: tx('近 12 個月', 'Last 12 mo') },
            { value: 'ytd', label: tx('今年', 'This year') },
            { value: 'last', label: tx('去年', 'Last year') },
            { value: 'all', label: tx('全部', 'All time') },
          ]}
        />
      </div>

      <div className="ruled mb-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {statTiles.map((s) => (
          <div key={s.label} className="min-w-0 p-5">
            <div className="eyebrow truncate">{s.label}</div>
            <div className="tnum mt-3 truncate text-[24px] font-medium leading-none tracking-[-0.03em] text-ink">{s.value}</div>
            {s.delta != null && period !== 'all' && (
              <div className={cx('mt-2 text-[12px] font-medium', s.delta >= 0 ? 'text-good' : 'text-bad')}>
                {s.delta >= 0 ? '▲' : '▼'} {pct(Math.abs(s.delta))} <span className="font-normal text-muted">{tx('vs 前期', 'vs prior')}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title={tx('每月收入', 'Monthly income')}
          subtitle={tx(`以交稿日計，換算為 ${base}`, `By delivery date, in ${base}`)}
          table={{ head: [tx('月份', 'Month'), tx('收入', 'Income'), tx('案件', 'Jobs')], rows: d.series.map((p) => [p.month, money(p.earned, base), p.jobs]) }}
        >
          <ColumnChart height={210} data={d.series.map((p) => ({ key: p.month, label: monthLabel(p.month), value: p.earned }))} format={(v) => money(v, base)} valueLabel={tx('收入', 'Income')} />
        </ChartCard>
        <ChartCard title={tx('每月字數', 'Words per month')} table={{ head: [tx('月份', 'Month'), tx('字數', 'Words')], rows: d.series.map((p) => [p.month, num(p.words)]) }}>
          <ColumnChart height={210} data={d.series.map((p) => ({ key: p.month, label: monthLabel(p.month), value: p.words }))} format={(v) => tx(`${num(v)} 字`, `${num(v)} words`)} valueLabel={tx('字數', 'Words')} />
        </ChartCard>

        <ChartCard
          title={tx('收入來源', 'Where the money comes from')}
          subtitle={tx('依客戶', 'By client')}
          table={{ head: [tx('客戶', 'Client'), tx('收入', 'Income'), tx('占比', 'Share')], rows: d.clients.map((g) => [g.key === '__other' ? tx('其他', 'Other') : clientMap.get(g.key)?.name ?? '—', money(g.income, base), pct(g.income / (d.t.income || 1))]) }}
        >
          <BarList
            onSelect={(k) => k !== '__other' && navigate('/clients/' + k)}
            data={d.clients.map((g) => ({
              key: g.key,
              label: g.key === '__other' ? tx('其他', 'Other') : clientMap.get(g.key)?.name ?? '—',
              value: g.income,
              display: `${money(g.income, base, { compact: true })} · ${pct(g.income / (d.t.income || 1))}`,
            }))}
          />
        </ChartCard>

        <ChartCard
          title={tx('專業領域', 'Fields')}
          subtitle={tx('依字數，附每字均價', 'By words, with income per word')}
          table={{ head: [tx('領域', 'Field'), tx('字數', 'Words'), tx('每字', 'Per word')], rows: d.domains.map((g) => [domainName(g.key), num(g.words), g.ratePerWord ? fmtRateStr(g.ratePerWord, base) : '—']) }}
        >
          <BarList
            data={d.domains.slice(0, 8).map((g) => ({
              key: g.key,
              label: domainName(g.key),
              value: g.words,
              display: tx(`${compact(g.words)} 字`, `${compact(g.words)} words`),
              sub: g.ratePerWord ? tx(`每字 ${fmtRateStr(g.ratePerWord, base)} · ${g.jobs} 件`, `${fmtRateStr(g.ratePerWord, base)}/word · ${g.jobs} jobs`) : tx(`${g.jobs} 件`, `${g.jobs} jobs`),
            }))}
          />
        </ChartCard>

        <ChartCard
          title={tx('每字均價走勢', 'Income per word over time')}
          subtitle={tx(`依季，${base}`, `By quarter, ${base}`)}
          action={
            pairOptions.length > 1 ? (
              <Select value={activePair} onChange={(e) => setPair(e.target.value)} className="input-sm w-auto">
                {pairOptions.map((p) => (
                  <option key={p} value={p}>
                    {pairLabel(p)}
                  </option>
                ))}
              </Select>
            ) : undefined
          }
          table={{ head: [tx('季', 'Quarter'), tx('每字均價', 'Per word')], rows: trend.map((p) => [p.label, p.value != null ? fmtRateStr(p.value, base) : '—']) }}
        >
          {trend.length > 1 ? (
            <LineChart points={trend} format={(v) => fmtRateStr(v, base)} valueLabel={pairLabel(activePair)} />
          ) : (
            <p className="py-10 text-center text-[13px] text-muted">{tx('累積兩季以上的紀錄就會出現走勢。', 'A trend appears after two quarters of records.')}</p>
          )}
        </ChartCard>

        <ChartCard
          title={tx('語言組合與服務', 'Pairs and services')}
          table={{
            head: [tx('項目', 'Item'), tx('收入', 'Income'), tx('案件', 'Jobs')],
            rows: [...d.pairs.map((g) => [pairLabel(g.key), money(g.income, base), g.jobs]), ...d.services.map((g) => [serviceName(g.key as never), money(g.income, base), g.jobs])],
          }}
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <BarList data={d.pairs.slice(0, 5).map((g) => ({ key: g.key, label: pairLabel(g.key), value: g.income, display: money(g.income, base, { compact: true }) }))} />
            <BarList data={d.services.slice(0, 5).map((g) => ({ key: g.key, label: serviceName(g.key as never), value: g.income, display: money(g.income, base, { compact: true }) }))} />
          </div>
        </ChartCard>

        <ChartCard
          title={tx('有效時薪', 'Effective hourly rate')}
          subtitle={tx('依客戶，只計入有計時的案件', 'By client, timed jobs only')}
          table={{ head: [tx('客戶', 'Client'), tx('時薪', 'Hourly'), tx('工時', 'Hours')], rows: d.hourly.map((g) => [clientMap.get(g.key)?.name ?? '—', money(g.hourly || 0, base), num(g.hours, 1)]) }}
        >
          {d.hourly.length ? (
            <BarList data={d.hourly.map((g) => ({ key: g.key, label: clientMap.get(g.key)?.name ?? '—', value: g.hourly || 0, display: money(g.hourly || 0, base), sub: tx(`${num(g.hours, 1)} 小時`, `${num(g.hours, 1)} h`) }))} />
          ) : (
            <p className="py-10 text-center text-[13px] text-muted">{tx('使用案件頁的計時器，這裡會顯示每位客戶的真實時薪。', 'Use the timer on a job and each client’s real hourly rate appears here.')}</p>
          )}
        </ChartCard>

        <ChartCard
          title={tx('翻譯速度', 'Translation speed')}
          subtitle={tx('每小時字數（中文字已換算為英文字當量）', 'Words per hour (CJK characters normalised to words)')}
          table={{ head: [tx('領域', 'Field'), tx('字／時', 'Words/h'), tx('工時', 'Hours')], rows: d.speed.map((s) => [domainName(s.key), num(s.wph), num(s.hours, 1)]) }}
        >
          {d.speed.length ? (
            <BarList data={d.speed.slice(0, 8).map((s) => ({ key: s.key, label: domainName(s.key), value: s.wph, display: tx(`${num(s.wph)} 字/時`, `${num(s.wph)} w/h`) }))} />
          ) : (
            <p className="py-10 text-center text-[13px] text-muted">{tx('計時資料累積後，就能看到自己在各領域的速度。', 'Once you have timed work, your speed per field shows up here.')}</p>
          )}
        </ChartCard>

        <div className="grid gap-4 lg:col-span-2 lg:grid-cols-3">
        <section className="card p-4 sm:p-5 lg:col-span-2">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h3 className="text-[15px] font-semibold text-ink">{tx('翻譯足跡', 'Your trail')}</h3>
              <div className="text-[12.5px] text-muted">{tx('每天的產出字數', 'Words produced each day')}</div>
            </div>
          </div>
          <Heatmap daily={d.daily} from={period === 'all' ? addDays(today, -364) : range.from} to={range.to} format={(v) => (v ? tx(`${num(Math.round(v))} 字`, `${num(Math.round(v))} words`) : tx('沒有紀錄', 'No work logged'))} />
        </section>
        <ChartCard title={tx('一週節奏', 'Your week')} subtitle={tx('各星期的產出字數', 'Words by day of the week')} table={{ head: [tx('星期', 'Day'), tx('字數', 'Words')], rows: d.byWeekday.map((w) => [new Intl.DateTimeFormat(en ? 'en-US' : 'zh-TW', { weekday: 'long' }).format(new Date(2026, 0, 4 + w.wd)), num(Math.round(w.words))]) }}>
          <ColumnChart
            height={190}
            data={d.byWeekday.map((w) => ({ key: String(w.wd), label: new Intl.DateTimeFormat(en ? 'en-US' : 'zh-TW', { weekday: 'short' }).format(new Date(2026, 0, 4 + w.wd)), value: Math.round(w.words) }))}
            format={(v) => tx(`${num(v)} 字`, `${num(v)} words`)}
            valueLabel={tx('字數', 'Words')}
          />
        </ChartCard>

        </div>
      </div>

      <Milestones list={ms} />
      <p className="mt-6 text-[12px] text-muted">
        {tx(`資料期間：${range.from} 至 ${range.to}。`, `Period: ${range.from} to ${range.to}.`)}
      </p>
    </div>
  );
}


function milestoneText(m: Milestone): { top: string; center: string; label: string } {
  const n = m.target;
  const big = (v: number) => (v >= 1_000_000 ? `${v / 1_000_000}M` : v >= 1000 ? `${v / 1000}K` : String(v));
  const zhBig = (v: number) => (v >= 10000 ? `${v / 10000}萬` : String(v));
  switch (m.kind) {
    case 'words':
      return { top: `${big(n)} WORDS`, center: tx(`${zhBig(n)}字`, big(n)), label: tx(`累計 ${num(n)} 字`, `${num(n)} words translated`) };
    case 'jobs':
      return { top: `${n} JOBS`, center: tx(`${n}件`, String(n)), label: tx(`完成 ${n} 件案件`, `${n} jobs delivered`) };
    case 'clients':
      return { top: `${n} CLIENTS`, center: tx(`${n}客戶`, String(n)), label: tx(`與 ${n} 位客戶合作`, `${n} clients served`) };
    case 'domains':
      return { top: `${n} FIELDS`, center: tx(`${n}領域`, String(n)), label: tx(`跨足 ${n} 個領域`, `${n} fields covered`) };
    case 'pairs':
      return { top: `${n} PAIRS`, center: tx(`${n}語對`, String(n)), label: tx(`${n} 種語言組合`, `${n} language pairs`) };
    case 'income':
      return { top: `NT$${big(n)}`, center: tx(`${zhBig(n)}元`, big(n)), label: tx(`累計收入 NT$${num(n)}`, `NT$${num(n)} earned`) };
    case 'bigjob':
      return { top: `${big(n)} IN ONE`, center: tx(`單案${zhBig(n)}`, big(n)), label: tx(`單一案件 ${num(n)} 字`, `${num(n)} words in one job`) };
  }
}

function Milestones({ list }: { list: Milestone[] }) {
  const achieved = list.filter((m) => m.achievedAt).sort((a, b) => b.achievedAt!.localeCompare(a.achievedAt!));
  const next = list
    .filter((m) => !m.achievedAt)
    .sort((a, b) => b.progress - a.progress)
    .filter((m, i, arr) => arr.findIndex((x) => x.kind === m.kind) === i)
    .slice(0, 4);
  return (
    <section className="mt-6">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <div className="eyebrow mb-0.5">{tx(`已蓋 ${achieved.length} 枚`, `${achieved.length} stamps collected`)}</div>
          <h2 className="text-[15px] font-semibold text-ink">{tx('里程碑護照', 'Milestone passport')}</h2>
        </div>
      </div>
      <div className="card p-5">
        {achieved.length ? (
          <div className="flex flex-wrap justify-center gap-x-2 gap-y-4 sm:justify-start">
            {achieved.slice(0, 18).map((m) => {
              const t = milestoneText(m);
              return (
                <div key={m.id} className="flex w-[112px] flex-col items-center text-center" title={t.label}>
                  <Medallion top={t.top} center={t.center} bottom={m.achievedAt!.slice(0, 7).replace('-', '.')} size={100} />
                  <div className="mt-1 text-[11.5px] leading-tight text-muted">{t.label}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[13px] text-muted">{tx('完成第一個案件，就會蓋下第一枚印章。', 'Deliver your first job to earn your first stamp.')}</p>
        )}
        {next.length > 0 && (
          <div className="mt-5 grid gap-3 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-4">
            {next.map((m) => (
              <div key={m.id}>
                <div className="mb-1 flex justify-between text-[12.5px]">
                  <span className="text-ink-2">{milestoneText(m).label}</span>
                  <span className="text-muted tnum">{pct(m.progress)}</span>
                </div>
                <Meter value={m.progress} max={1} />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
