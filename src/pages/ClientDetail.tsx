import { ArrowLeft, Mail, Pencil, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { BarList, ChartCard, ColumnChart, monthLabel } from '../charts/charts';
import { useData } from '../db/data';
import { CLIENT_KINDS, unitInfo } from '../domain/constants';
import { clientStats, groupJobs, incomeDate, monthlySeries, monthsBack, pairKey, receivables } from '../domain/stats';
import { langInfo } from '../domain/constants';
import { getLang, tx } from '../i18n';
import { date, domain as domainName, money, num, pct, rate as fmtRateStr } from '../ui/format';
import { Button, Empty, Meter } from '../ui/kit';
import { useUI } from '../ui/store';
import { JobRow, useMedianRate } from '../features/common';
import { GradeBadge } from './Clients';

export function ClientDetail({ id }: { id: string }) {
  const { clientMap, jobs, hours, today, settings } = useData();
  const { navigate, openClientEditor, openQuickAdd } = useUI();
  const median = useMedianRate();
  const client = clientMap.get(id);
  const base = settings.baseCurrency;
  const en = getLang() === 'en';

  const d = useMemo(() => {
    if (!client) return undefined;
    const cj = jobs.filter((j) => j.clientId === id).sort((a, b) => incomeDate(b).localeCompare(incomeDate(a)));
    const s = clientStats(client, jobs, hours, today, median);
    const series = monthlySeries(cj, monthsBack(today, 24));
    const domains = groupJobs(cj, (j) => j.domain ?? 'general').slice(0, 6);
    const pairs = groupJobs(cj, pairKey).slice(0, 4);
    const rec = receivables(cj, [client], today);
    return { cj, s, series, domains, pairs, rec };
  }, [client, jobs, hours, today, median, id]);

  if (!client || !d) {
    return (
      <div className="card">
        <Empty title={tx('找不到這位客戶', 'Client not found')} action={<Button onClick={() => navigate('/clients')}>{tx('回到客戶列表', 'Back to clients')}</Button>} />
      </div>
    );
  }
  const { s } = d;
  const kind = CLIENT_KINDS.find((k) => k.id === client.kind);
  const parts = [
    { label: tx('付款準時度', 'Pays on time'), v: s.scoreParts.pay, max: 40 },
    { label: tx('費率水準', 'Rate level'), v: s.scoreParts.rate, max: 30 },
    { label: tx('合作份量', 'Volume'), v: s.scoreParts.volume, max: 20 },
    { label: tx('近期往來', 'Recency'), v: s.scoreParts.recency, max: 10 },
  ];

  return (
    <div>
      <button type="button" onClick={() => navigate('/clients')} className="mb-3 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-muted hover:text-ink">
        <ArrowLeft size={16} /> {tx('客戶', 'Clients')}
      </button>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <GradeBadge grade={s.grade} size="lg" />
          <div className="min-w-0">
            <h1 className="font-display text-[28px] leading-tight text-ink md:text-[32px]">{client.name}</h1>
            <div className="mt-1 text-[13.5px] text-muted">
              {[kind ? (en ? kind.en : kind.zh) : '', client.country, client.currency, client.paymentTermsDays ? tx(`付款條件 ${client.paymentTermsDays} 天`, `Net ${client.paymentTermsDays}`) : ''].filter(Boolean).join(' · ')}
            </div>
            {client.email && (
              <a href={`mailto:${client.email}`} className="mt-1 inline-flex items-center gap-1.5 text-[13px] text-accent hover:underline">
                <Mail size={13} /> {client.email}
              </a>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button icon={<Pencil size={15} />} onClick={() => openClientEditor(client, false)}>
            {tx('編輯', 'Edit')}
          </Button>
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => openQuickAdd(client.name + ' ')}>
            {tx('新增案件', 'New job')}
          </Button>
        </div>
      </header>

      <div className="ruled mb-4 grid-cols-2 md:grid-cols-4">
        {[
          { label: tx('累計收入', 'Total income'), value: money(s.income, base, { compact: true }), sub: tx(`佔總收入 ${pct(s.share)}`, `${pct(s.share)} of all income`) },
          { label: tx('案件／字數', 'Jobs / words'), value: num(s.jobs), sub: tx(`${num(s.words)} 字`, `${num(s.words)} words`) },
          { label: tx('每字均價', 'Per word'), value: s.ratePerWord ? fmtRateStr(s.ratePerWord, base) : '—', sub: median && s.ratePerWord ? tx(`你的中位數 ${fmtRateStr(median, base)}`, `Your median ${fmtRateStr(median, base)}`) : undefined },
          { label: tx('平均付款天數', 'Avg days to pay'), value: s.avgDaysToPay != null ? `${Math.round(s.avgDaysToPay)}` : '—', sub: s.onTimeShare != null ? tx(`準時 ${pct(s.onTimeShare)}`, `${pct(s.onTimeShare)} on time`) : undefined },
        ].map((t) => (
          <div key={t.label} className="min-w-0 p-5">
            <div className="eyebrow truncate">{t.label}</div>
            <div className="tnum mt-3 truncate text-[24px] font-medium leading-none tracking-[-0.03em] text-ink">{t.value}</div>
            {t.sub && <div className="mt-2 text-[12px] text-muted">{t.sub}</div>}
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <ChartCard
            title={tx('近兩年每月收入', 'Monthly income, last 24 months')}
            table={{ head: [tx('月份', 'Month'), tx('收入', 'Income'), tx('字數', 'Words')], rows: d.series.map((p) => [p.month, money(p.earned + p.projected, base), num(p.words)]) }}
          >
            <ColumnChart
              height={180}
              data={d.series.map((p, i) => ({ key: p.month, label: monthLabel(p.month), value: p.earned, extra: p.projected, highlight: i === d.series.length - 1 }))}
              format={(v) => money(v, base)}
              valueLabel={tx('已完成', 'Earned')}
              extraLabel={tx('進行中', 'In progress')}
            />
          </ChartCard>
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 pb-2 pt-4">
              <h2 className="text-[15px] font-semibold text-ink">{tx('案件紀錄', 'Jobs')}</h2>
              <span className="text-[12.5px] text-muted">{tx(`共 ${d.cj.length} 件`, `${d.cj.length} total`)}</span>
            </div>
            <div className="hairline-list max-h-[560px] overflow-y-auto border-t border-line">
              {d.cj.slice(0, 80).map((j) => (
                <JobRow key={j.id} job={j} showClient={false} showDue />
              ))}
            </div>
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <section className="card p-5">
            <h2 className="text-[15px] font-semibold text-ink">{tx('客戶評級', 'Client grade')}</h2>
            <p className="mt-1 text-[12.5px] text-muted">{tx(`綜合分數 ${s.score} / 100`, `Score ${s.score} / 100`)}</p>
            <div className="mt-4 flex flex-col gap-3">
              {parts.map((p) => (
                <div key={p.label}>
                  <div className="mb-1 flex justify-between text-[12.5px]">
                    <span className="text-ink-2">{p.label}</span>
                    <span className="text-muted tnum">
                      {p.v}/{p.max}
                    </span>
                  </div>
                  <Meter value={p.v} max={p.max} />
                </div>
              ))}
            </div>
          </section>
          {d.rec.length > 0 && (
            <section className="card p-5">
              <h2 className="text-[15px] font-semibold text-ink">{tx('未收款', 'Unpaid')}</h2>
              <ul className="mt-2 divide-y divide-line">
                {d.rec.map((r) => (
                  <li key={r.job.id} className="flex items-baseline justify-between gap-3 py-2 text-[13px]">
                    <span className="min-w-0 truncate text-ink-2">{r.job.title}</span>
                    <span className={r.daysOverdue > 0 ? 'shrink-0 font-medium text-bad tnum' : 'shrink-0 text-ink tnum'}>
                      {money(r.amount, r.job.currency)}
                      <span className="ml-1 text-[11.5px] font-normal text-muted">{r.daysOverdue > 0 ? tx(`逾期 ${r.daysOverdue} 天`, `${r.daysOverdue}d late`) : date(r.due)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="card p-5">
            <h2 className="mb-3 text-[15px] font-semibold text-ink">{tx('領域', 'Fields')}</h2>
            <BarList data={d.domains.map((g) => ({ key: g.key, label: domainName(g.key), value: g.words || g.jobs, display: g.words ? tx(`${num(g.words)} 字`, `${num(g.words)} w`) : tx(`${g.jobs} 件`, `${g.jobs} jobs`) }))} />
          </section>
          <section className="card p-5">
            <h2 className="mb-3 text-[15px] font-semibold text-ink">{tx('語言組合', 'Language pairs')}</h2>
            <BarList
              data={d.pairs.map((g) => {
                const [a, b] = g.key.split('>');
                return { key: g.key, label: `${langInfo(a).short} → ${langInfo(b).short}`, value: g.income, display: money(g.income, base, { compact: true }) };
              })}
            />
          </section>
          {(client.defaultRate || client.notes || client.contactName || client.taxId) && (
            <section className="card p-5 text-[13.5px]">
              {client.defaultRate && (
                <p className="text-ink-2">
                  {tx('預設單價', 'Default rate')}: {fmtRateStr(client.defaultRate, client.currency)}
                  {client.defaultUnit && ` / ${en ? unitInfo(client.defaultUnit).per.en : unitInfo(client.defaultUnit).per.zh}`}
                </p>
              )}
              {client.contactName && <p className="mt-1 text-ink-2">{tx('聯絡人', 'Contact')}: {client.contactName}</p>}
              {client.taxId && <p className="mt-1 text-ink-2">{tx('統編', 'Tax ID')}: {client.taxId}</p>}
              {client.notes && <p className="mt-2 whitespace-pre-wrap text-muted">{client.notes}</p>}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
