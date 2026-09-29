import { CheckSquare, Download, FileUp, MoreHorizontal, LayoutList, Pencil, Plus, Search, SquareKanban, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useData } from '../db/data';
import { bulkEdited, deleteJobs, restoreJobs, saveJob, saveJobs, setJobStatus, type BulkEdit } from '../db/repo';
import { CURRENCIES, domainLabel, langInfo, PIPELINE } from '../domain/constants';
import { toCSV } from '../domain/csv';
import { fmtMonth, monthKey } from '../domain/dates';
import { fxRate, jobGross, jobGrossBase, jobNet, jobWords } from '../domain/money';
import { incomeDate, totals } from '../domain/stats';
import type { Job, JobStatus } from '../domain/types';
import { getLang, tx } from '../i18n';
import { domain as domainName, dueInfo, money, num, service as serviceName } from '../ui/format';
import { Button, cx, Empty, Field, Input, Menu, PageHeader, Pair, Segmented, Select, Sheet, STATUS_COLOR, statusLabel } from '../ui/kit';
import { celebrate, haptic } from '../ui/motion';
import { useUI } from '../ui/store';
import { JobRow } from '../features/common';
import { downloadFile } from '../features/download';

const NO_PROJECT = '__none';

type StatusFilter = 'all' | 'active' | 'unpaid' | 'paid' | 'quote' | 'cancelled';

const readPref = (k: string, d: string) => {
  try {
    return localStorage.getItem(k) ?? d;
  } catch {
    return d;
  }
};
const writePref = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};

export function Jobs() {
  const { jobs, clients, clientMap, projects, projectMap, settings, today } = useData();
  const { openQuickAdd, navigate, fireStamp, toast, ask } = useUI();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [year, setYear] = useState<string>('all');
  const [clientId, setClientId] = useState<string>('');
  const [dom, setDom] = useState<string>('');
  const [projectId, setProjectId] = useState<string>('');
  const [view, setView] = useState<'list' | 'board'>(() => (readPref('wt:jobsView', 'list') as 'list' | 'board'));
  useEffect(() => writePref('wt:jobsView', view), [view]);
  // select mode: null when off, else the picked job ids
  const [sel, setSel] = useState<Set<string> | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const startSelect = (id?: string) => {
    setView('list');
    setSel(new Set(id ? [id] : []));
  };
  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s ?? []);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  useEffect(() => {
    if (!sel) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !bulkOpen && !useUI.getState().confirm && setSel(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel, bulkOpen]);

  const years = useMemo(() => [...new Set(jobs.map((j) => incomeDate(j).slice(0, 4)))].sort().reverse(), [jobs]);
  const domains = useMemo(() => [...new Set(jobs.map((j) => j.domain).filter(Boolean) as string[])], [jobs]);

  const filtered = useMemo(() => {
    const nq = q.trim().toLowerCase();
    return jobs
      .filter((j) => {
        if (status === 'active' && j.status !== 'active') return false;
        if (status === 'unpaid' && !(j.status === 'delivered' || j.status === 'invoiced')) return false;
        if (status === 'paid' && j.status !== 'paid') return false;
        if (status === 'quote' && j.status !== 'quote') return false;
        if (status === 'cancelled' && j.status !== 'cancelled') return false;
        if (status === 'all' && j.status === 'cancelled') return false;
        if (year !== 'all' && !incomeDate(j).startsWith(year)) return false;
        if (clientId && j.clientId !== clientId) return false;
        if (dom && j.domain !== dom) return false;
        if (projectId === NO_PROJECT ? !!j.projectId : projectId && j.projectId !== projectId) return false;
        if (nq) {
          const c = j.clientId ? clientMap.get(j.clientId)?.name ?? '' : '';
          const pj = j.projectId ? projectMap.get(j.projectId)?.name ?? '' : '';
          const hay = `${j.title} ${c} ${pj} ${j.poNumber ?? ''} ${j.notes ?? ''} ${domainLabel(j.domain, 'zh-TW')} ${domainLabel(j.domain, 'en')} ${langInfo(j.sourceLang).short} ${langInfo(j.targetLang).short}`.toLowerCase();
          if (!hay.includes(nq)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const rank = (j: Job) => (j.status === 'active' || j.status === 'quote' ? 1 : 0);
        return rank(b) - rank(a) || incomeDate(b).localeCompare(incomeDate(a)) || b.updatedAt - a.updatedAt;
      });
  }, [jobs, q, status, year, clientId, dom, projectId, clientMap, projectMap]);

  // only what is still on screen counts, so a filter change never acts on hidden jobs
  const picked = useMemo(() => (sel ? filtered.filter((j) => sel.has(j.id)) : []), [sel, filtered]);
  const allPicked = !!sel && filtered.length > 0 && picked.length === filtered.length;

  const removePicked = async () => {
    const ids = picked.map((j) => j.id);
    if (!ids.length) return;
    const ok = await ask({
      title: tx(`刪除 ${ids.length} 個案件？`, `Delete ${ids.length} job${ids.length > 1 ? 's' : ''}?`),
      body: tx('之後可以按「復原」救回來。', 'You can undo this right after.'),
      confirm: tx('刪除', 'Delete'),
      danger: true,
    });
    if (!ok) return;
    await deleteJobs(ids);
    setSel(null);
    toast(tx(`已刪除 ${ids.length} 個案件`, `Deleted ${ids.length} job${ids.length > 1 ? 's' : ''}`), { action: { label: tx('復原', 'Undo'), run: () => void restoreJobs(ids) } });
  };

  const editPicked = async (e: BulkEdit) => {
    const before = picked;
    const after = before.map((j) => bulkEdited(j, e, { fxToBase: (c) => fxRate(c, base, settings.fx.rates), today }));
    await saveJobs(after);
    setBulkOpen(false);
    setSel(null);
    if (e.paidAt || e.status === 'paid') {
      fireStamp(tx('已收款', 'PAID'), (e.paidAt ?? today).replace(/-/g, '.'));
      haptic([12, 40, 18]);
    }
    toast(tx(`已更新 ${after.length} 個案件`, `Updated ${after.length} job${after.length > 1 ? 's' : ''}`), { action: { label: tx('復原', 'Undo'), run: () => void saveJobs(before) } });
  };

  const groups = useMemo(() => {
    const out: { key: string; label: string; jobs: Job[] }[] = [];
    const open = filtered.filter((j) => j.status === 'active' || j.status === 'quote');
    if (open.length) out.push({ key: 'open', label: tx('進行中與詢價', 'Open'), jobs: open });
    const map = new Map<string, Job[]>();
    for (const j of filtered) {
      if (j.status === 'active' || j.status === 'quote') continue;
      const k = monthKey(incomeDate(j));
      map.set(k, [...(map.get(k) ?? []), j]);
    }
    for (const [k, list] of map) out.push({ key: k, label: fmtMonth(k, getLang(), 'long'), jobs: list });
    return out;
  }, [filtered]);

  const sum = totals(filtered);
  const base = settings.baseCurrency;

  const exportCSV = () => {
    const rows: (string | number | undefined)[][] = [
      ['id', 'title', 'client', 'status', 'source', 'target', 'service', 'domain', 'unit', 'quantity', 'words', 'rate', 'currency', 'gross', 'net', `gross_${base}`, 'received', 'due', 'delivered', 'invoiced', 'paid', 'cat_tool', 'po', 'notes', 'project'],
      ...filtered.map((j) => [
        j.id,
        j.title,
        j.clientId ? clientMap.get(j.clientId)?.name : '',
        j.status,
        j.sourceLang,
        j.targetLang,
        j.service,
        j.domain,
        j.unit,
        j.quantity,
        jobWords(j),
        j.rate,
        j.currency,
        jobGross(j),
        jobNet(j),
        Math.round(jobGrossBase(j)),
        j.receivedAt,
        j.dueAt,
        j.deliveredAt,
        j.invoicedAt,
        j.paidAt,
        j.catTool,
        j.poNumber,
        j.notes,
        j.projectId ? projectMap.get(j.projectId)?.name : '',
      ]),
    ];
    void downloadFile(`witimemo-jobs-${today}.csv`, toCSV(rows), 'text/csv');
  };

  const chips: { v: StatusFilter; label: string }[] = [
    { v: 'all', label: tx('全部', 'All') },
    { v: 'active', label: tx('進行中', 'In progress') },
    { v: 'unpaid', label: tx('待收款', 'Unpaid') },
    { v: 'paid', label: tx('已收款', 'Paid') },
    { v: 'quote', label: tx('詢價', 'Quotes') },
    { v: 'cancelled', label: tx('已取消', 'Cancelled') },
  ];

  return (
    <div>
      <PageHeader
        eyebrow={tx(`${jobs.length} 個案件`, `${jobs.length} jobs`)}
        title={tx('案件', 'Jobs')}
        actions={
          <>
            <Segmented
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: 'list', label: <span className="inline-flex items-center gap-1.5"><LayoutList size={14} />{tx('列表', 'List')}</span> },
                { value: 'board', label: <span className="inline-flex items-center gap-1.5"><SquareKanban size={14} />{tx('看板', 'Board')}</span> },
              ]}
            />
            <Button size="sm" variant={sel ? 'primary' : 'ghost'} icon={<CheckSquare size={15} />} onClick={() => (sel ? setSel(null) : startSelect())} aria-pressed={!!sel}>
              {sel ? tx('完成', 'Done') : tx('選取', 'Select')}
            </Button>
            <Button size="sm" variant="ghost" icon={<FileUp size={15} />} onClick={() => useUI.getState().openReportImport()}>
              {tx('匯入', 'Import')}
            </Button>
            <Button size="sm" variant="ghost" icon={<Download size={15} />} onClick={exportCSV}>
              CSV
            </Button>
            <Button size="sm" variant="primary" icon={<Plus size={15} />} onClick={() => openQuickAdd()} className="hidden sm:inline-flex">
              {tx('新增', 'New')}
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx('搜尋標題、客戶、PO、備註…', 'Search title, client, PO, notes…')} className="pl-9" aria-label={tx('搜尋案件', 'Search jobs')} />
          </div>
          <Select value={year} onChange={(e) => setYear(e.target.value)} className="w-auto" aria-label={tx('年份', 'Year')}>
            <option value="all">{tx('所有年份', 'All years')}</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
          <Select value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-auto max-w-[180px]" aria-label={tx('客戶', 'Client')}>
            <option value="">{tx('所有客戶', 'All clients')}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          {projects.length > 0 && (
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-auto max-w-[180px]" aria-label={tx('專案', 'Project')}>
              <option value="">{tx('所有專案', 'All projects')}</option>
              <option value={NO_PROJECT}>{tx('不屬於專案', 'Not in a project')}</option>
              {projects
                .filter((p) => !p.archived || p.id === projectId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </Select>
          )}
          <Select value={dom} onChange={(e) => setDom(e.target.value)} className="w-auto max-w-[160px]" aria-label={tx('領域', 'Field')}>
            <option value="">{tx('所有領域', 'All fields')}</option>
            {domains.map((d) => (
              <option key={d} value={d}>
                {domainName(d)}
              </option>
            ))}
          </Select>
        </div>
        {view === 'list' && (
          <div className="scroll-x -mx-4 flex gap-2 px-4 sm:mx-0 sm:px-0">
            {chips.map((c) => (
              <button key={c.v} type="button" className="chip" aria-pressed={status === c.v} onClick={() => setStatus(c.v)}>
                {c.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted">
          <span>
            {tx('共', '')} <b className="font-semibold text-ink tnum">{num(sum.jobs)}</b> {tx('件', 'jobs')}
          </span>
          <span>
            <b className="font-semibold text-ink tnum">{num(sum.words)}</b> {tx('字', 'words')}
          </span>
          <span>
            <b className="font-semibold text-ink tnum">{money(sum.income, base)}</b>
          </span>
        </div>
      </div>

      {view === 'list' ? (
        filtered.length ? (
          <div className="flex flex-col gap-4">
            {groups.map((g) => {
              const t = totals(g.jobs);
              return (
                <section key={g.key} className="card overflow-hidden">
                  <div className="flex items-baseline justify-between gap-3 border-b border-line bg-surface-2 px-4 py-2">
                    {sel ? (
                      <label className="inline-flex cursor-pointer items-center gap-2 text-[13.5px] font-semibold text-ink">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[var(--accent)]"
                          checked={g.jobs.every((j) => sel.has(j.id))}
                          onChange={(e) =>
                            setSel((s) => {
                              const n = new Set(s ?? []);
                              for (const j of g.jobs) (e.target.checked ? n.add(j.id) : n.delete(j.id));
                              return n;
                            })
                          }
                          aria-label={tx(`選取「${g.label}」全部`, `Select all in ${g.label}`)}
                        />
                        {g.label}
                      </label>
                    ) : (
                      <h2 className="text-[13.5px] font-semibold text-ink">{g.label}</h2>
                    )}
                    <span className="text-[12.5px] text-muted tnum">
                      {tx(`${g.jobs.length} 件`, `${g.jobs.length} jobs`)} · {money(t.income, base)}
                    </span>
                  </div>
                  <div className="hairline-list">
                    {g.jobs.map((j) => (
                      <JobRow
                        key={j.id}
                        job={j}
                        showDue
                        showTimer={j.status === 'active'}
                        select={{ selecting: !!sel, selected: !!sel?.has(j.id), toggle: () => toggle(j.id), longPress: () => (sel ? toggle(j.id) : startSelect(j.id)) }}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="card">
            <Empty icon={<Search size={20} />} title={tx('沒有符合條件的案件', 'No jobs match')} body={tx('換個關鍵字或清除篩選看看。', 'Try another keyword or clear the filters.')} />
          </div>
        )
      ) : (
        <Board
          jobs={filtered.filter((j) => j.status !== 'cancelled')}
          onMove={async (j, s) => {
            if (j.status === s) return;
            const prev = { status: j.status, deliveredAt: j.deliveredAt, invoicedAt: j.invoicedAt, paidAt: j.paidAt, progress: j.progress };
            await setJobStatus(j, s);
            // same moment as the job page: seal stamp for paid, small burst for delivered
            if (s === 'paid') {
              fireStamp(tx('已收款', 'PAID'), today.replace(/-/g, '.'));
              haptic([12, 40, 18]);
            } else if (s === 'delivered') celebrate('delivered');
            toast(tx(`已改為「${statusLabel(s)}」`, `Marked as ${statusLabel(s)}`), { action: { label: tx('復原', 'Undo'), run: () => void saveJob({ ...j, ...prev }) } });
          }}
          onOpen={(j) => navigate('/jobs/' + j.id)}
          base={base}
          today={today}
          clientName={(id) => (id ? clientMap.get(id)?.name : undefined)}
        />
      )}

      {sel && (
        <>
          {/* room so the bar never covers the last rows */}
          <div className="h-20" aria-hidden />
          <div
            className="no-print fixed inset-x-3 bottom-[74px] z-40 mx-auto flex max-w-xl items-center gap-1.5 rounded-[6px] border border-line bg-surface p-1.5 sm:gap-2 lg:bottom-5 lg:left-[248px]"
            style={{ boxShadow: 'var(--shadow-lg)', marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
            role="toolbar"
            aria-label={tx('選取的案件', 'Selected jobs')}
          >
            <Button size="sm" variant="ghost" iconOnly icon={<X size={16} />} onClick={() => setSel(null)} aria-label={tx('結束選取', 'Stop selecting')} />
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink tnum" aria-live="polite">
              {tx(`已選 ${picked.length} 件`, `${picked.length} selected`)}
            </span>
            <Button size="sm" variant="ghost" onClick={() => setSel(allPicked ? new Set() : new Set(filtered.map((j) => j.id)))}>
              {allPicked ? tx('全不選', 'None') : tx('全選', 'All')}
            </Button>
            <Button size="sm" icon={<Pencil size={14} />} disabled={!picked.length} onClick={() => setBulkOpen(true)}>
              {tx('編輯', 'Edit')}
            </Button>
            <Button size="sm" variant="danger" icon={<Trash2 size={14} />} disabled={!picked.length} onClick={() => void removePicked()}>
              {tx('刪除', 'Delete')}
            </Button>
          </div>
        </>
      )}
      <BulkEditSheet open={bulkOpen} count={picked.length} jobs={picked} onClose={() => setBulkOpen(false)} onApply={(e) => void editPicked(e)} />
    </div>
  );
}

const KEEP = '__keep';

/** The fields a batch of jobs can share; each starts as “no change”. */
function BulkEditSheet({ open, count, jobs, onClose, onApply }: { open: boolean; count: number; jobs: Job[]; onClose: () => void; onApply: (e: BulkEdit) => void }) {
  const { clients, projects, today } = useData();
  const [status, setStatus] = useState(KEEP);
  const [client, setClient] = useState(KEEP);
  const [project, setProject] = useState(KEEP);
  const [currency, setCurrency] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);
  const [paidAt, setPaidAt] = useState(today);
  useEffect(() => {
    if (!open) return;
    setStatus(KEEP);
    setClient(KEEP);
    setProject(KEEP);
    setCurrency(null);
    setPaid(false);
    setPaidAt(today);
  }, [open, today]);
  const shared = jobs.length && jobs.every((j) => j.currency === jobs[0].currency) ? jobs[0].currency : undefined;
  const edit: BulkEdit = {
    ...(status !== KEEP && { status: status as JobStatus }),
    ...(client !== KEEP && { clientId: client || null }),
    ...(project !== KEEP && { projectId: project || null }),
    ...(currency && currency !== shared && { currency }),
    ...(paid && { paidAt }),
  };
  const changes = Object.keys(edit).length;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="sm"
      title={tx(`編輯 ${count} 個案件`, `Edit ${count} job${count > 1 ? 's' : ''}`)}
      subtitle={tx('只會改動你有設定的欄位。', 'Only the fields you set are changed.')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tx('取消', 'Cancel')}
          </Button>
          <Button variant="primary" disabled={!changes} onClick={() => onApply(edit)}>
            {tx('套用', 'Apply')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label={tx('狀態', 'Status')} htmlFor="bulk-status">
          <Select id="bulk-status" value={status} onChange={(e) => setStatus(e.target.value)} disabled={paid}>
            <option value={KEEP}>{tx('（不變）', '(no change)')}</option>
            {[...PIPELINE, 'cancelled' as JobStatus].map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tx('客戶', 'Client')} htmlFor="bulk-client">
          <Select id="bulk-client" value={client} onChange={(e) => setClient(e.target.value)}>
            <option value={KEEP}>{tx('（不變）', '(no change)')}</option>
            <option value="">{tx('（無客戶）', '(no client)')}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tx('專案', 'Project')} htmlFor="bulk-project">
          <Select id="bulk-project" value={project} onChange={(e) => setProject(e.target.value)}>
            <option value={KEEP}>{tx('（不變）', '(no change)')}</option>
            <option value="">{tx('（不屬於專案）', '(not in a project)')}</option>
            {projects
              .filter((p) => !p.archived)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label={tx('幣別', 'Currency')} htmlFor="bulk-currency" hint={shared ? undefined : tx('選取的案件幣別不同；選一個就會全部改成它', 'The selected jobs use different currencies; pick one to set them all')}>
          <Select id="bulk-currency" value={currency ?? shared ?? ''} onChange={(e) => setCurrency(e.target.value || null)}>
            {!shared && <option value="">{tx('（不變）', '(no change)')}</option>}
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} · {getLang() === 'en' ? c.en : c.zh}
              </option>
            ))}
          </Select>
        </Field>
        <label className="flex items-center gap-2 text-[14px] text-ink">
          <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
          {tx('標記為已收款', 'Mark as paid')}
        </label>
        {paid && (
          <Field label={tx('收款日', 'Paid on')} htmlFor="bulk-paid">
            <Input id="bulk-paid" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value || today)} />
          </Field>
        )}
      </div>
    </Sheet>
  );
}

function Board({
  jobs,
  onMove,
  onOpen,
  base,
  today,
  clientName,
}: {
  jobs: Job[];
  onMove: (j: Job, s: JobStatus) => void;
  onOpen: (j: Job) => void;
  base: string;
  today: string;
  clientName: (id?: string) => string | undefined;
}) {
  const [over, setOver] = useState<JobStatus | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const cols = PIPELINE.map((s) => {
    let list = jobs.filter((j) => j.status === s);
    if (s === 'paid') list = list.sort((a, b) => (b.paidAt ?? '').localeCompare(a.paidAt ?? '')).slice(0, 12);
    return { s, list, total: list.reduce((acc, j) => acc + jobGrossBase(j), 0) };
  });
  return (
    <div className="scroll-x -mx-4 flex gap-3 px-4 pb-4 sm:mx-0 sm:px-0">
      {cols.map((c) => (
        <section
          key={c.s}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(c.s);
          }}
          onDragLeave={() => setOver((o) => (o === c.s ? null : o))}
          onDrop={(e) => {
            e.preventDefault();
            setOver(null);
            const j = jobs.find((x) => x.id === (dragId ?? e.dataTransfer.getData('text/plain')));
            if (j) onMove(j, c.s);
          }}
          className={cx('flex w-[270px] shrink-0 flex-col rounded-2xl border bg-surface-2 transition-colors', over === c.s ? 'border-accent bg-accent-soft' : 'border-line')}
        >
          <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
            <span className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-ink">
              <span className="h-2 w-2 rounded-[1px]" style={{ background: STATUS_COLOR[c.s] }} />
              {statusLabel(c.s)}
              <span className="font-normal text-muted tnum">{c.list.length}</span>
            </span>
            <span className="text-[12px] text-muted tnum">{money(c.total, base, { compact: true })}</span>
          </div>
          <div className="flex min-h-[120px] flex-col gap-2 px-2 pb-2">
            {c.list.map((j) => {
              const due = j.status === 'active' ? dueInfo(j.dueAt, today) : undefined;
              return (
                <article
                  key={j.id}
                  draggable
                  onDragStart={(e) => {
                    setDragId(j.id);
                    e.dataTransfer.setData('text/plain', j.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => setDragId(null)}
                  className={cx('cursor-grab rounded-xl border border-line bg-surface p-3 transition-shadow hover:shadow-[var(--shadow)] active:cursor-grabbing', dragId === j.id && 'opacity-50')}
                >
                  <div className="flex items-start gap-1">
                    <button type="button" onClick={() => onOpen(j)} className="line-clamp-2 min-w-0 flex-1 text-left text-[13.5px] font-medium leading-snug text-ink hover:underline">
                      {j.title || tx('（未命名）', '(Untitled)')}
                    </button>
                    <Menu
                      trigger={(p) => (
                        <button type="button" {...p} className="-m-1 grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink" aria-label={tx('移到…', 'Move to…')} title={tx('移到…', 'Move to…')}>
                          <MoreHorizontal size={15} />
                        </button>
                      )}
                      items={PIPELINE.map((s) => ({
                        label: (
                          <span className="inline-flex items-center gap-2">
                            <span className="h-2 w-2 rounded-[1px]" style={{ background: STATUS_COLOR[s] }} />
                            {statusLabel(s)}
                          </span>
                        ),
                        disabled: s === j.status,
                        onClick: () => onMove(j, s),
                      }))}
                    />
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
                    <Pair source={j.sourceLang} target={j.targetLang} />
                    <span className="truncate">{clientName(j.clientId)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-[12.5px]">
                    <span className="font-semibold text-ink tnum">{money(jobGross(j), j.currency)}</span>
                    {due ? (
                      <span className={cx('font-medium', due.tone === 'bad' ? 'text-bad' : due.tone === 'warn' ? 'text-warn' : 'text-muted')}>{due.text}</span>
                    ) : (
                      <span className="text-muted">{serviceName(j.service)}</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
