import { ArrowLeft, CalendarPlus, Check, Copy, Crosshair, MoreHorizontal, Pencil, Plus, Star, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useData } from '../db/data';
import { deleteJob, deleteSession, newJob, restoreJob, saveJob, saveSession, setJobStatus, uid } from '../db/repo';
import { weightedWords } from '../domain/cat';
import { PIPELINE } from '../domain/constants';
import { fmtDuration, toISODate } from '../domain/dates';
import { buildICS } from '../domain/ics';
import { jobGross, jobGrossBase, jobNet, jobWords } from '../domain/money';
import { paymentDue, rateBenchmark, sessionMs } from '../domain/stats';
import type { JobStatus } from '../domain/types';
import { tx } from '../i18n';
import { date, dateLong, domain as domainName, dueInfo, money, num, qty, rate as fmtRateStr, service as serviceName, unitPer } from '../ui/format';
import { Button, cx, Empty, Input, Menu, Pair, STATUS_COLOR, StatusPill, statusLabel } from '../ui/kit';
import { useUI } from '../ui/store';
import { TimerButton } from '../features/common';
import { RateScale } from '../features/QuickAdd';
import { downloadFile } from '../features/download';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === '') return null;
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-[14px]">
      <span className="text-muted">{label}</span>
      <span className="text-right text-ink tnum">{value}</span>
    </div>
  );
}

export function JobDetail({ id }: { id: string }) {
  const { jobMap, clientMap, sessions, settings, today, jobs, running } = useData();
  const { navigate, openJobEditor, ask, toast, fireStamp } = useUI();
  const job = jobMap.get(id);
  const [adding, setAdding] = useState(false);
  const [manual, setManual] = useState({ date: today, start: '09:00', end: '11:00' });

  const js = useMemo(() => sessions.filter((s) => s.jobId === id).sort((a, b) => b.start - a.start), [sessions, id]);

  if (!job) {
    return (
      <div className="card">
        <Empty title={tx('找不到這個案件', 'Job not found')} body={tx('可能已被刪除或尚未同步。', 'It may have been deleted or not synced yet.')} action={<Button onClick={() => navigate('/jobs')}>{tx('回到案件列表', 'Back to jobs')}</Button>} />
      </div>
    );
  }

  const client = job.clientId ? clientMap.get(job.clientId) : undefined;
  const base = settings.baseCurrency;
  const gross = jobGross(job);
  const words = jobWords(job);
  const hours = js.reduce((s, x) => s + sessionMs(x), 0) / 3_600_000;
  const due = job.status === 'active' ? dueInfo(job.dueAt, today) : undefined;
  const bench = words > 0 && (job.unit === 'word' || job.unit === 'char') ? rateBenchmark(jobs.filter((j) => j.id !== job.id), { ratePerWordBase: jobGrossBase(job) / words, sourceLang: job.sourceLang, targetLang: job.targetLang, domain: job.domain, unit: job.unit }) : undefined;
  const stepIdx = PIPELINE.indexOf(job.status);

  const move = async (s: JobStatus) => {
    if (s === job.status) return;
    await setJobStatus(job, s);
    if (s === 'paid') fireStamp(tx('已收款', 'PAID'), today.replace(/-/g, '.'));
    else toast(tx(`已改為「${statusLabel(s)}」`, `Marked as ${statusLabel(s)}`));
  };

  const duplicate = async () => {
    const copy = newJob({ ...job, id: uid(), title: job.title + tx('（複本）', ' (copy)'), status: 'active', receivedAt: today, dueAt: undefined, deliveredAt: undefined, invoicedAt: undefined, paidAt: undefined, invoiceId: undefined, progress: 0, createdAt: Date.now(), featured: false });
    await saveJob(copy);
    navigate('/jobs/' + copy.id);
    toast(tx('已建立複本', 'Duplicated'));
  };

  const remove = async () => {
    const ok = await ask({ title: tx('刪除這個案件？', 'Delete this job?'), confirm: tx('刪除', 'Delete'), danger: true });
    if (!ok) return;
    await deleteJob(job.id);
    navigate('/jobs');
    toast(tx('已刪除', 'Deleted'), { action: { label: tx('復原', 'Undo'), run: () => void restoreJob(job.id) } });
  };

  const ics = () => {
    if (!job.dueAt) return toast(tx('這個案件沒有截止日', 'This job has no due date'));
    void downloadFile(
      `deadline-${job.dueAt.slice(0, 10)}.ics`,
      buildICS([{ uid: job.id, title: tx(`交稿：${job.title}`, `Due: ${job.title}`), when: job.dueAt, description: [client?.name, `${job.sourceLang}→${job.targetLang}`, words ? qty(words, job.unit) : ''].filter(Boolean).join(' · ') }]),
      'text/calendar',
    );
  };

  const addManual = async () => {
    const s = new Date(`${manual.date}T${manual.start}:00`).getTime();
    let e = new Date(`${manual.date}T${manual.end}:00`).getTime();
    if (e <= s) e += 86_400_000;
    await saveSession({ id: uid(), jobId: job.id, start: s, end: e, createdAt: Date.now(), updatedAt: Date.now() });
    setAdding(false);
  };

  return (
    <div>
      <button type="button" onClick={() => navigate('/jobs')} className="mb-3 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-muted hover:text-ink">
        <ArrowLeft size={16} /> {tx('案件', 'Jobs')}
      </button>

      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[13px] text-muted">
            <Pair source={job.sourceLang} target={job.targetLang} />
            {client && (
              <button type="button" className="font-medium text-ink-2 hover:underline" onClick={() => navigate('/clients/' + client.id)}>
                {client.name}
              </button>
            )}
            <span>·</span>
            <span>{serviceName(job.service)}</span>
            {job.domain && (
              <>
                <span>·</span>
                <span>{domainName(job.domain)}</span>
              </>
            )}
          </div>
          <h1 className="font-display text-[26px] leading-tight text-ink md:text-[30px]">{job.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <StatusPill status={job.status} />
            {due && <span className={cx('text-[13px] font-medium', due.tone === 'bad' ? 'text-bad' : due.tone === 'warn' ? 'text-warn' : 'text-ink-2')}>{tx('截稿', 'Due')} {due.text}</span>}
            {job.featured && (
              <span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-gold">
                <Star size={13} fill="currentColor" /> {tx('代表作', 'Featured')}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {job.status === 'active' && (
            <Button icon={<Crosshair size={15} />} onClick={() => navigate('/focus/' + job.id)}>
              {tx('專注', 'Focus')}
            </Button>
          )}
          {job.status === 'active' && <TimerButton job={job} size="md" />}
          <Button icon={<Pencil size={15} />} onClick={() => openJobEditor(job, false)}>
            {tx('編輯', 'Edit')}
          </Button>
          <Menu
            trigger={(p) => <Button iconOnly icon={<MoreHorizontal size={18} />} aria-label={tx('更多動作', 'More actions')} {...p} />}
            items={[
              { label: job.featured ? tx('取消代表作', 'Unfeature') : tx('列為代表作', 'Feature on résumé'), icon: <Star size={15} />, onClick: () => void saveJob({ ...job, featured: !job.featured }) },
              { label: tx('加入行事曆', 'Add to calendar'), icon: <CalendarPlus size={15} />, onClick: ics },
              { label: tx('建立複本', 'Duplicate'), icon: <Copy size={15} />, onClick: () => void duplicate() },
              'divider',
              { label: tx('刪除', 'Delete'), icon: <Trash2 size={15} />, danger: true, onClick: () => void remove() },
            ]}
          />
        </div>
      </header>

      {job.status !== 'cancelled' && (
        <section className="card mb-4 p-4">
          <ol className="grid grid-cols-5 gap-1">
            {PIPELINE.map((s, i) => {
              const done = i <= stepIdx;
              const d = s === 'quote' ? undefined : s === 'active' ? job.receivedAt : s === 'delivered' ? job.deliveredAt : s === 'invoiced' ? job.invoicedAt : job.paidAt;
              return (
                <li key={s}>
                  <button type="button" onClick={() => void move(s)} className="group flex w-full flex-col items-center gap-1.5 text-center" aria-current={s === job.status ? 'step' : undefined}>
                    <span className="relative flex w-full items-center">
                      <span className={cx('h-0.5 flex-1', i === 0 ? 'opacity-0' : done ? '' : 'bg-line')} style={done && i > 0 ? { background: STATUS_COLOR[s] } : undefined} />
                      <span
                        className={cx('grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 transition-transform group-hover:scale-110', done ? 'text-white' : 'border-line-strong bg-surface text-transparent')}
                        style={done ? { background: STATUS_COLOR[s], borderColor: STATUS_COLOR[s] } : undefined}
                      >
                        <Check size={14} strokeWidth={3} />
                      </span>
                      <span className={cx('h-0.5 flex-1', i === PIPELINE.length - 1 ? 'opacity-0' : i < stepIdx ? '' : 'bg-line')} style={i < stepIdx ? { background: STATUS_COLOR[PIPELINE[i + 1]] } : undefined} />
                    </span>
                    <span className={cx('text-[12px] leading-tight', s === job.status ? 'font-semibold text-ink' : 'text-muted')}>{statusLabel(s)}</span>
                    <span className="h-3.5 text-[11px] text-muted tnum">{d && done ? date(d) : ''}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          {job.status === 'active' && job.progress != null && (
            <div className="mt-3 flex items-center gap-3">
              <span className="text-[12.5px] text-muted">{tx('完成度', 'Progress')}</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={job.progress}
                onChange={(e) => void saveJob({ ...job, progress: Number(e.target.value) })}
                className="flex-1 accent-[var(--accent)]"
                aria-label={tx('完成度', 'Progress')}
              />
              <span className="w-10 text-right text-[13px] font-semibold text-ink tnum">{job.progress}%</span>
            </div>
          )}
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <section className="card p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-[13px] text-muted">{tx('案件金額', 'Job total')}</div>
                <div className="text-[34px] font-semibold leading-tight text-ink">{money(gross, job.currency)}</div>
                {job.currency !== base && <div className="text-[13px] text-muted tnum">≈ {money(jobGrossBase(job), base)} · 1 {job.currency} = {job.fxToBase} {base}</div>}
              </div>
              {(job.withholding || job.nhi || job.fees) && (
                <div className="text-right">
                  <div className="text-[13px] text-muted">{tx('實收', 'Net received')}</div>
                  <div className="text-[22px] font-medium tracking-[-0.03em] text-ink">{money(jobNet(job), job.currency)}</div>
                </div>
              )}
            </div>
            <div className="mt-4 divide-y divide-line border-t border-line">
              {job.unit !== 'flat' && <Row label={tx('數量 × 單價', 'Quantity × rate')} value={`${qty(job.quantity, job.unit)} × ${fmtRateStr(job.rate, job.currency)}/${unitPer(job.unit)}`} />}
              {job.unit === 'flat' && <Row label={tx('整案計價', 'Flat fee')} value={money(job.rate, job.currency)} />}
              {job.cat && <Row label={tx('CAT 加權後', 'CAT weighted')} value={`${num(weightedWords(job.cat.counts, job.cat.grid), 1)} (${Math.round((weightedWords(job.cat.counts, job.cat.grid) / Math.max(1, job.quantity)) * 100)}%)`} />}
              {job.unit === 'flat' && words > 0 && <Row label={tx('字數', 'Words')} value={num(words)} />}
              {!!job.surchargePct && <Row label={job.surchargePct > 0 ? tx('急件加價', 'Rush fee') : tx('折扣', 'Discount')} value={`${job.surchargePct > 0 ? '+' : ''}${job.surchargePct}%`} />}
              {!!job.minimumFee && <Row label={tx('最低收費', 'Minimum fee')} value={money(job.minimumFee, job.currency)} />}
              {job.amountOverride != null && <Row label={tx('手動總額', 'Manual total')} value={money(job.amountOverride, job.currency)} />}
              {!!job.withholding && <Row label={tx('扣繳稅額', 'Tax withheld')} value={`− ${money(job.withholding, job.currency)}`} />}
              {!!job.nhi && <Row label={tx('二代健保', 'NHI premium')} value={`− ${money(job.nhi, job.currency)}`} />}
              {!!job.fees && <Row label={tx('手續費', 'Fees')} value={`− ${money(job.fees, job.currency)}`} />}
              {words > 0 && job.unit !== 'word' && job.unit !== 'char' && <Row label={tx('每字收入', 'Income per word')} value={fmtRateStr(jobGrossBase(job) / words, base)} />}
            </div>
            {bench && bench.percentile != null && (
              <div className="mt-4 rounded-xl bg-surface-2 p-3">
                <div className="text-[12.5px] font-medium text-ink-2">{tx('與你過去的費率相比', 'Compared with your past rates')}</div>
                <RateScale bench={bench} value={jobGrossBase(job) / words} currency={base} />
              </div>
            )}
          </section>

          <section className="card p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold text-ink">{tx('工時紀錄', 'Time log')}</h2>
              <Button size="sm" variant="ghost" icon={<Plus size={15} />} onClick={() => setAdding((a) => !a)}>
                {tx('補登時段', 'Add time')}
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-surface-2 p-3">
                <div className="text-[12px] text-muted">{tx('總工時', 'Total time')}</div>
                <div className="text-[18px] font-semibold text-ink tnum">{hours ? fmtDuration(hours * 3_600_000).replace(/:\d\d$/, '') : '—'}</div>
              </div>
              <div className="rounded-xl bg-surface-2 p-3">
                <div className="text-[12px] text-muted">{tx('有效時薪', 'Hourly')}</div>
                <div className="text-[18px] font-semibold text-ink tnum">{hours > 0.2 ? money(jobGrossBase(job) / hours, base) : '—'}</div>
              </div>
              <div className="rounded-xl bg-surface-2 p-3">
                <div className="text-[12px] text-muted">{tx('速度', 'Speed')}</div>
                <div className="text-[18px] font-semibold text-ink tnum">{hours > 0.2 && words ? `${num((words * (job.status === 'active' ? (job.progress || 0) / 100 : 1)) / hours)}` : '—'}</div>
                <div className="text-[11px] text-muted">{tx('字／小時', 'words / h')}</div>
              </div>
            </div>
            {adding && (
              <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-line p-3">
                <label className="text-[12px] text-muted">
                  {tx('日期', 'Date')}
                  <Input type="date" className="input-sm mt-1 w-[150px]" value={manual.date} onChange={(e) => setManual({ ...manual, date: e.target.value })} />
                </label>
                <label className="text-[12px] text-muted">
                  {tx('開始', 'Start')}
                  <Input type="time" className="input-sm mt-1 w-[110px]" value={manual.start} onChange={(e) => setManual({ ...manual, start: e.target.value })} />
                </label>
                <label className="text-[12px] text-muted">
                  {tx('結束', 'End')}
                  <Input type="time" className="input-sm mt-1 w-[110px]" value={manual.end} onChange={(e) => setManual({ ...manual, end: e.target.value })} />
                </label>
                <Button size="sm" variant="primary" onClick={() => void addManual()}>
                  {tx('加入', 'Add')}
                </Button>
              </div>
            )}
            {js.length > 0 && (
              <ul className="mt-3 divide-y divide-line">
                {js.slice(0, 30).map((s) => (
                  <li key={s.id} className="group flex items-center justify-between gap-3 py-2 text-[13.5px]">
                    <span className="text-ink-2">
                      {date(toISODate(new Date(s.start)), { month: 'short', day: 'numeric', weekday: 'short' })}{' '}
                      <span className="text-muted tnum">
                        {new Date(s.start).toTimeString().slice(0, 5)}–{s.end ? new Date(s.end).toTimeString().slice(0, 5) : tx('計時中', 'running')}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className={cx('font-medium tnum', !s.end && running?.id === s.id ? 'text-seal' : 'text-ink')}>{fmtDuration(sessionMs(s)).replace(/:\d\d$/, '')}</span>
                      <button type="button" className="rounded p-1 text-muted opacity-0 transition-opacity hover:text-bad group-hover:opacity-100 focus:opacity-100" onClick={() => void deleteSession(s.id)} aria-label={tx('刪除時段', 'Delete entry')}>
                        <X size={14} />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {!js.length && !adding && <p className="mt-3 text-[13px] text-muted">{tx('按下計時鍵開始記錄，就能算出這個案件的真實時薪與速度。', 'Start the timer to learn this job’s real hourly rate and speed.')}</p>}
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <section className="card px-5 py-3">
            <div className="divide-y divide-line">
              <Row label={tx('接案日', 'Received')} value={job.receivedAt ? dateLong(job.receivedAt) : undefined} />
              <Row label={tx('截止', 'Due')} value={job.dueAt ? date(job.dueAt, { year: 'numeric', month: 'short', day: 'numeric', ...(job.dueAt.includes('T') ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}) }) : undefined} />
              <Row label={tx('交稿日', 'Delivered')} value={job.deliveredAt ? dateLong(job.deliveredAt) : undefined} />
              <Row label={tx('請款日', 'Invoiced')} value={job.invoicedAt ? dateLong(job.invoicedAt) : undefined} />
              {(job.status === 'delivered' || job.status === 'invoiced') && <Row label={tx('預計入帳', 'Payment due')} value={dateLong(paymentDue(job, client))} />}
              <Row label={tx('收款日', 'Paid')} value={job.paidAt ? dateLong(job.paidAt) : undefined} />
              <Row label={tx('CAT 工具', 'CAT tool')} value={job.catTool} />
              <Row label="PO" value={job.poNumber} />
              {settings.tax.region === 'TW' && <Row label={tx('所得類別', 'Income type')} value={job.incomeCategory ?? '9B'} />}
              <Row label={tx('保密', 'Confidential')} value={job.confidential ? tx('是', 'Yes') : undefined} />
            </div>
          </section>
          {job.notes && (
            <section className="card p-5">
              <h2 className="eyebrow mb-2">{tx('備註', 'Notes')}</h2>
              <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-ink-2">{job.notes}</p>
            </section>
          )}
          {job.status === 'active' && running?.jobId !== job.id && (
            <p className="px-1 text-[12.5px] text-muted">{tx('提示：拖動上方的完成度，首頁的工作負荷會即時更新。', 'Tip: drag the progress slider and the workload chart updates instantly.')}</p>
          )}
        </aside>
      </div>
    </div>
  );
}
