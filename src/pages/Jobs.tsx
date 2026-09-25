import { Download, FileUp, LayoutList, Plus, Search, SquareKanban } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useData } from '../db/data';
import { setJobStatus } from '../db/repo';
import { domainLabel, langInfo, PIPELINE } from '../domain/constants';
import { toCSV } from '../domain/csv';
import { fmtMonth, monthKey } from '../domain/dates';
import { jobGross, jobGrossBase, jobNet, jobWords } from '../domain/money';
import { incomeDate, totals } from '../domain/stats';
import type { Job, JobStatus } from '../domain/types';
import { getLang, tx } from '../i18n';
import { domain as domainName, dueInfo, money, num, service as serviceName } from '../ui/format';
import { Button, cx, Empty, Input, PageHeader, Pair, Segmented, Select, STATUS_COLOR, statusLabel } from '../ui/kit';
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
  const { openQuickAdd, navigate, fireStamp } = useUI();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [year, setYear] = useState<string>('all');
  const [clientId, setClientId] = useState<string>('');
  const [dom, setDom] = useState<string>('');
  const [projectId, setProjectId] = useState<string>('');
  const [view, setView] = useState<'list' | 'board'>(() => (readPref('wt:jobsView', 'list') as 'list' | 'board'));
  useEffect(() => writePref('wt:jobsView', view), [view]);

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
                    <h2 className="text-[13.5px] font-semibold text-ink">{g.label}</h2>
                    <span className="text-[12.5px] text-muted tnum">
                      {tx(`${g.jobs.length} 件`, `${g.jobs.length} jobs`)} · {money(t.income, base)}
                    </span>
                  </div>
                  <div className="hairline-list">
                    {g.jobs.map((j) => (
                      <JobRow key={j.id} job={j} showDue showTimer={j.status === 'active'} />
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
            await setJobStatus(j, s);
            if (s === 'paid') fireStamp(tx('已收款', 'PAID'), today.replace(/-/g, '.'));
          }}
          onOpen={(j) => navigate('/jobs/' + j.id)}
          base={base}
          today={today}
          clientName={(id) => (id ? clientMap.get(id)?.name : undefined)}
        />
      )}
    </div>
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
                  onClick={() => onOpen(j)}
                  className={cx('cursor-grab rounded-xl border border-line bg-surface p-3 transition-shadow hover:shadow-[var(--shadow)] active:cursor-grabbing', dragId === j.id && 'opacity-50')}
                >
                  <div className="line-clamp-2 text-[13.5px] font-medium leading-snug text-ink">{j.title}</div>
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
