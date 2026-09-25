import { Check, FileText, FileUp, Plus, Receipt } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ChartCard, ColumnChart, monthLabel, SegmentBar } from '../charts/charts';
import { useData } from '../db/data';
import { markPaid } from '../db/repo';
import { addDays, dateOnly, monthKey, startOfMonth } from '../domain/dates';
import { jobGross, jobNetBase } from '../domain/money';
import { monthsBack, receivables, type AgingBucket, type Receivable } from '../domain/stats';
import { tx } from '../i18n';
import { date, money, num } from '../ui/format';
import { Button, cx, Empty, PageHeader, Pair, Segmented } from '../ui/kit';
import { useUI } from '../ui/store';
import { InvoiceBuilder } from '../features/InvoiceBuilder';

type Tab = 'due' | 'invoices' | 'received';

export function Money() {
  const { jobs, clients, invoices, clientMap, jobMap, settings, today } = useData();
  const { navigate, fireStamp, openReportImport } = useUI();
  const [tab, setTab] = useState<Tab>('due');
  const [builder, setBuilder] = useState<{ open: boolean; client?: string }>({ open: false });
  const base = settings.baseCurrency;

  const d = useMemo(() => {
    const rec = receivables(jobs, clients, today);
    const byClient = new Map<string, Receivable[]>();
    for (const r of rec) {
      const k = r.job.clientId ?? '';
      byClient.set(k, [...(byClient.get(k) ?? []), r]);
    }
    const aging: Record<AgingBucket, number> = { current: 0, d30: 0, d60: 0, d90: 0 };
    for (const r of rec) aging[r.bucket] += r.amountBase;
    const total = rec.reduce((s, r) => s + r.amountBase, 0);
    const overdue = rec.filter((r) => r.daysOverdue > 0).reduce((s, r) => s + r.amountBase, 0);
    const next30 = rec.filter((r) => r.daysOverdue <= 0 && r.due <= addDays(today, 30)).reduce((s, r) => s + r.amountBase, 0);
    const paid = jobs.filter((j) => j.status === 'paid' && j.paidAt);
    const monthStart = startOfMonth(today);
    const paidThisMonth = paid.filter((j) => j.paidAt! >= monthStart && j.paidAt! <= today).reduce((s, j) => s + jobNetBase(j), 0);
    const months = monthsBack(today, 12);
    const cash = months.map((m) => ({ month: m, value: paid.filter((j) => monthKey(j.paidAt!) === m).reduce((s, j) => s + jobNetBase(j), 0) }));
    const recentPaid = [...paid].sort((a, b) => b.paidAt!.localeCompare(a.paidAt!)).slice(0, 40);
    return { rec, byClient: [...byClient.entries()].sort((a, b) => b[1].reduce((s, r) => s + r.amountBase, 0) - a[1].reduce((s, r) => s + r.amountBase, 0)), aging, total, overdue, next30, paidThisMonth, cash, recentPaid };
  }, [jobs, clients, today]);

  const pay = async (ids: string[]) => {
    await markPaid(ids, today);
    fireStamp(tx('已收款', 'PAID'), today.replace(/-/g, '.'));
  };

  const sortedInvoices = [...invoices].sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.number.localeCompare(a.number));

  return (
    <div>
      <PageHeader
        eyebrow={tx('應收與入帳', 'Receivables & cash')}
        title={tx('收款', 'Payments')}
        actions={
          <>
            <Button size="sm" icon={<FileUp size={15} />} onClick={() => openReportImport()}>
              {tx('匯入報表', 'Import report')}
            </Button>
            <Button variant="primary" size="sm" icon={<Plus size={15} />} onClick={() => setBuilder({ open: true })}>
              {tx('建立請款單', 'New invoice')}
            </Button>
          </>
        }
      />

      <div className="ruled mb-4 grid-cols-2 md:grid-cols-4">
        {[
          { label: tx('應收總額', 'Outstanding'), value: money(d.total, base), tone: '' },
          { label: tx('已逾期', 'Overdue'), value: money(d.overdue, base), tone: d.overdue > 0 ? 'text-bad' : '' },
          { label: tx('30 天內到期', 'Due in 30 days'), value: money(d.next30, base), tone: '' },
          { label: tx('本月已入帳（實收）', 'Received this month (net)'), value: money(d.paidThisMonth, base), tone: '' },
        ].map((t) => (
          <div key={t.label} className="min-w-0 p-5">
            <div className="eyebrow truncate">{t.label}</div>
            <div className={cx('tnum mt-3 truncate text-[24px] font-medium leading-none tracking-[-0.03em] text-ink', t.tone)}>{t.value}</div>
          </div>
        ))}
      </div>

      <section className="card mb-4 p-4">
        <div className="mb-3 text-[13.5px] font-semibold text-ink">{tx('帳齡分析', 'Aging')}</div>
        <SegmentBar
          parts={[
            { key: 'current', value: d.aging.current, color: 'var(--st-quote)', label: tx('未到期', 'Not yet due'), display: money(d.aging.current, base, { compact: true }) },
            { key: 'd30', value: d.aging.d30, color: 'var(--st-invoiced)', label: tx('逾期 1–30 天', '1–30 days late'), display: money(d.aging.d30, base, { compact: true }) },
            { key: 'd60', value: d.aging.d60, color: '#ec835a', label: tx('逾期 31–60 天', '31–60 days late'), display: money(d.aging.d60, base, { compact: true }) },
            { key: 'd90', value: d.aging.d90, color: 'var(--bad)', label: tx('逾期 60 天以上', '60+ days late'), display: money(d.aging.d90, base, { compact: true }) },
          ]}
        />
      </section>

      <Segmented
        className="mb-4"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'due', label: tx(`待收款 ${d.rec.length}`, `Unpaid ${d.rec.length}`) },
          { value: 'invoices', label: tx(`請款單 ${invoices.length}`, `Invoices ${invoices.length}`) },
          { value: 'received', label: tx('已入帳', 'Received') },
        ]}
      />

      {tab === 'due' &&
        (d.byClient.length === 0 ? (
          <div className="card">
            <Empty icon={<Check size={20} />} title={tx('所有款項都收齊了', 'Everything is paid')} body={tx('交稿後的案件會出現在這裡，直到你標記為已收款。', 'Delivered jobs appear here until you mark them paid.')} />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {d.byClient.map(([cid, list]) => {
              const c = clientMap.get(cid);
              const sum = list.reduce((s, r) => s + r.amountBase, 0);
              const uninvoiced = list.some((r) => r.job.status === 'delivered' && !r.job.invoiceId);
              return (
                <section key={cid} className="card overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2 px-4 py-2.5">
                    <button type="button" className="text-[14px] font-semibold text-ink hover:underline" onClick={() => c && navigate('/clients/' + c.id)}>
                      {c?.name ?? tx('（未指定客戶）', '(No client)')}
                    </button>
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] text-muted tnum">{money(sum, base)}</span>
                      {uninvoiced && c && (
                        <Button size="sm" variant="ghost" icon={<Receipt size={14} />} onClick={() => setBuilder({ open: true, client: c.id })}>
                          {tx('請款', 'Invoice')}
                        </Button>
                      )}
                      <Button size="sm" variant="secondary" onClick={() => void pay(list.map((r) => r.job.id))}>
                        {tx('全部收款', 'All paid')}
                      </Button>
                    </div>
                  </div>
                  <ul className="divide-y divide-line">
                    {list.map((r) => (
                      <li key={r.job.id} className="flex items-center gap-3 px-4 py-3">
                        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => navigate('/jobs/' + r.job.id)}>
                          <span className="block truncate text-[14px] font-medium text-ink">{r.job.title}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
                            <Pair source={r.job.sourceLang} target={r.job.targetLang} />
                            {r.job.status === 'invoiced' ? tx('已請款', 'Invoiced') : tx('未請款', 'Not invoiced')}
                            <span className={cx('font-medium', r.daysOverdue > 0 ? 'text-bad' : 'text-ink-2')}>
                              {r.daysOverdue > 0 ? tx(`逾期 ${r.daysOverdue} 天`, `${r.daysOverdue} days late`) : tx(`${date(r.due)} 到期`, `Due ${date(r.due)}`)}
                            </span>
                          </span>
                        </button>
                        <span className="shrink-0 text-right text-[14px] font-semibold text-ink tnum">{money(r.amount, r.job.currency)}</span>
                        <Button size="sm" variant="primary" iconOnly icon={<Check size={16} />} aria-label={tx('標記已收款', 'Mark paid')} title={tx('標記已收款', 'Mark paid')} onClick={() => void pay([r.job.id])} />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        ))}

      {tab === 'invoices' &&
        (sortedInvoices.length === 0 ? (
          <div className="card">
            <Empty icon={<FileText size={20} />} title={tx('還沒有請款單', 'No invoices yet')} body={tx('選擇已交稿的案件，一鍵產生中英文請款單。', 'Pick delivered jobs and generate a bilingual invoice in one step.')} action={<Button variant="primary" onClick={() => setBuilder({ open: true })}>{tx('建立請款單', 'New invoice')}</Button>} />
          </div>
        ) : (
          <section className="card overflow-hidden">
            <ul className="divide-y divide-line">
              {sortedInvoices.map((inv) => {
                const total = inv.jobIds.reduce((s, id) => s + (jobMap.get(id) ? jobGross(jobMap.get(id)!) : 0), 0);
                const overdue = inv.status !== 'paid' && inv.dueDate && inv.dueDate < today;
                return (
                  <li key={inv.id}>
                    <button type="button" onClick={() => navigate('/money/invoices/' + inv.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2">
                      <span className="min-w-0 flex-1">
                        <span className="block font-mono text-[13.5px] font-medium text-ink">{inv.number}</span>
                        <span className="mt-0.5 block truncate text-[12.5px] text-muted">
                          {clientMap.get(inv.clientId)?.name} · {date(inv.issueDate, { year: 'numeric', month: 'short', day: 'numeric' })} · {tx(`${inv.jobIds.length} 項`, `${inv.jobIds.length} items`)}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-[14px] font-semibold text-ink tnum">{money(total, inv.currency)}</span>
                        <span className={cx('block text-[12px] font-medium', inv.status === 'paid' ? 'text-good' : overdue ? 'text-bad' : 'text-muted')}>
                          {inv.status === 'paid' ? tx('已付款', 'Paid') : overdue ? tx('逾期', 'Overdue') : inv.status === 'draft' ? tx('草稿', 'Draft') : tx('已寄出', 'Sent')}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

      {tab === 'received' && (
        <div className="flex flex-col gap-4">
          <ChartCard
            title={tx('每月實際入帳（扣除扣繳與手續費）', 'Cash received per month (net)')}
            table={{ head: [tx('月份', 'Month'), tx('實收', 'Net')], rows: d.cash.map((c) => [c.month, money(c.value, base)]) }}
          >
            <ColumnChart height={190} data={d.cash.map((c, i) => ({ key: c.month, label: monthLabel(c.month), value: c.value, highlight: i === d.cash.length - 1 }))} format={(v) => money(v, base)} valueLabel={tx('實收', 'Net received')} />
          </ChartCard>
          <section className="card overflow-hidden">
            <ul className="divide-y divide-line">
              {d.recentPaid.map((j) => (
                <li key={j.id}>
                  <button type="button" onClick={() => navigate('/jobs/' + j.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2">
                    <span className="w-16 shrink-0 text-[12.5px] text-muted tnum">{date(dateOnly(j.paidAt!))}</span>
                    <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{j.title}</span>
                    <span className="hidden truncate text-[12.5px] text-muted sm:block">{j.clientId ? clientMap.get(j.clientId)?.name : ''}</span>
                    <span className="shrink-0 text-[14px] font-medium text-ink tnum">{money(jobGross(j), j.currency)}</span>
                  </button>
                </li>
              ))}
            </ul>
            {d.recentPaid.length === 0 && <Empty title={tx('尚無入帳紀錄', 'Nothing received yet')} />}
          </section>
          <p className="text-[12.5px] text-muted">{tx(`共 ${num(jobs.filter((j) => j.status === 'paid').length)} 筆已收款案件。`, `${num(jobs.filter((j) => j.status === 'paid').length)} paid jobs in total.`)}</p>
        </div>
      )}

      <InvoiceBuilder open={builder.open} presetClient={builder.client} onClose={() => setBuilder({ open: false })} />
    </div>
  );
}
