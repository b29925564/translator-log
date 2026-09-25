import { Archive, ArrowLeft, Check, Copy, Crosshair, ExternalLink, FileText, Link2, MoreHorizontal, NotebookPen, Pencil, Plus, Send, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useData } from '../db/data';
import { newJob, saveJob, saveProject, deleteProject, uid } from '../db/repo';
import { diffDays, dateOnly } from '../domain/dates';
import { fxRate, jobGross, jobGrossBase } from '../domain/money';
import { PART_KINDS, partLabel, partTitle, projectStats, queriesText, shortPartName, sortQueries, templateFor } from '../domain/projects';
import { clientPrice } from '../domain/rates';
import { isEarned } from '../domain/stats';
import type { Job, JobStatus, Project, ProjectQuery, Unit } from '../domain/types';
import { getLang, tx } from '../i18n';
import { Timeline, type TimelineRow } from '../charts/Timeline';
import { dueInfo, money, num, qty } from '../ui/format';
import { Button, cx, Empty, Field, fitText, Input, Menu, NumberInput, PageHeader, Pair, Segmented, Select, Sheet, StatusPill, Textarea, statusLabel } from '../ui/kit';
import { useUI } from '../ui/store';
import { useSpeed } from '../features/common';
import { InvoiceBuilder } from '../features/InvoiceBuilder';
import { LogProgress } from '../features/TodayPlan';
import { copyText } from '../features/download';
import { UNITS } from '../domain/constants';

export function ProjectDetail({ id }: { id: string }) {
  const { projectMap, jobs, clientMap, today, settings } = useData();
  const { navigate, openProjectEditor, openJobEditor, ask } = useUI();
  const speed = useSpeed();
  const p = projectMap.get(id);
  const parts = useMemo(
    () => jobs.filter((j) => j.projectId === id).sort((a, b) => (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999') || a.createdAt - b.createdAt),
    [jobs, id],
  );
  const s = useMemo(() => (p ? projectStats(p, parts, today, speed.wph) : undefined), [p, parts, today, speed.wph]);
  const [adding, setAdding] = useState(false);
  const [logging, setLogging] = useState<string | null>(null);
  const [invoicing, setInvoicing] = useState(false);
  const lang = getLang();
  const base = settings.baseCurrency;

  if (!p || !s) {
    return (
      <div className="card">
        <Empty title={tx('找不到這個專案', 'Project not found')} action={<Button onClick={() => navigate('/projects')}>{tx('回到專案', 'Back to projects')}</Button>} />
      </div>
    );
  }
  const client = p.clientId ? clientMap.get(p.clientId) : undefined;
  const t = templateFor(p.kind);
  const toInvoice = parts.filter((j) => j.status === 'delivered' || (j.status === 'invoiced' && !j.invoiceId));
  const daysLeft = p.dueAt ? diffDays(today, dateOnly(p.dueAt)) : undefined;

  const rows: TimelineRow[] = parts
    .filter((j) => j.status !== 'cancelled')
    .map((j) => {
      const end = dateOnly(j.deliveredAt ?? j.dueAt ?? p.dueAt ?? today);
      const start = dateOnly(j.receivedAt ?? today);
      return {
        key: j.id,
        label: shortPartName(j.title, p.name),
        start: start > end ? end : start,
        end,
        progress: (j.progress ?? 0) / 100,
        state: isEarned(j) ? 'done' : j.status === 'active' ? 'active' : 'planned',
        overdue: j.status === 'active' && !!j.dueAt && dateOnly(j.dueAt) < today,
        status: statusLabel(j.status),
      };
    });

  const remove = async () => {
    const ok = await ask({
      title: tx('刪除這個專案？', 'Delete this project?'),
      body: tx(`${parts.length} 個部分會保留為一般案件，收入紀錄不受影響。`, `Its ${parts.length} parts stay as ordinary jobs, so no income is lost.`),
      confirm: tx('刪除專案', 'Delete project'),
      danger: true,
    });
    if (!ok) return;
    await deleteProject(p.id, false);
    navigate('/projects');
  };

  const logJob = logging ? parts.find((j) => j.id === logging) : undefined;

  return (
    <div className="stagger flex flex-col gap-5">
      <div>
        <button type="button" onClick={() => navigate('/projects')} className="mb-3 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-muted hover:text-ink">
          <ArrowLeft size={16} /> {tx('專案', 'Projects')}
        </button>
        <PageHeader
          eyebrow={[lang === 'en' ? t.en : t.zh, client?.name].filter(Boolean).join(' · ')}
          title={p.name}
          actions={
            <>
              <Button size="sm" variant="primary" icon={<Plus size={15} />} onClick={() => setAdding(true)}>
                {tx('新增部分', 'Add part')}
              </Button>
              {toInvoice.length > 0 && (
                <Button size="sm" icon={<FileText size={15} />} onClick={() => setInvoicing(true)}>
                  {tx(`請款 ${toInvoice.length} 個已交稿部分`, `Invoice ${toInvoice.length} delivered`)}
                </Button>
              )}
              <Menu
                trigger={(tp) => <Button size="sm" iconOnly icon={<MoreHorizontal size={17} />} aria-label={tx('更多動作', 'More actions')} {...tp} />}
                items={[
                  { label: tx('編輯專案', 'Edit project'), icon: <Pencil size={15} />, onClick: () => openProjectEditor(p) },
                  { label: p.archived ? tx('取消封存', 'Unarchive') : tx('封存', 'Archive'), icon: <Archive size={15} />, onClick: () => void saveProject({ ...p, archived: !p.archived }) },
                  'divider',
                  { label: tx('刪除專案', 'Delete project'), icon: <Trash2 size={15} />, danger: true, onClick: () => void remove() },
                ]}
              />
            </>
          }
        />
        {p.sourceLang && p.targetLang && (
          <div className="-mt-3 mb-1 flex items-center gap-2 text-[13px] text-muted">
            <Pair source={p.sourceLang} target={p.targetLang} />
            {p.confidential && <span>{tx('保密專案', 'Confidential')}</span>}
          </div>
        )}
      </div>

      <div className="ruled grid-cols-2 md:grid-cols-5">
        <div className="col-span-2 p-5 md:col-span-1">
          <div className="eyebrow">{tx('完成度', 'Complete')}</div>
          <div className="tnum mt-3 text-[28px] font-medium leading-none tracking-[-0.03em] text-ink">{Math.round(s.progress * 100)}%</div>
          <div className="mt-3 h-[3px] bg-surface-3">
            <div className="h-full bg-gold" style={{ width: `${s.progress * 100}%`, transition: 'width .8s' }} />
          </div>
        </div>
        <Stat label={tx('部分', 'Parts')} value={`${s.done}/${s.parts}`} sub={tx(`${s.active} 進行中 · ${s.quotes} 待確認`, `${s.active} active · ${s.quotes} coming up`)} />
        <Stat
          label={tx('份量', 'Volume')}
          value={s.words ? num(s.words) : '—'}
          sub={[s.words ? tx('字', 'words') : '', s.minutes ? tx(`${num(s.minutes)} 分鐘影片`, `${num(s.minutes)} video min`) : '', s.hours ? tx(`${num(s.hours)} 小時`, `${num(s.hours)} h`) : ''].filter(Boolean).join(' · ')}
        />
        <Stat label={tx('總金額', 'Value')} value={s.value ? money(s.value, base, { compact: true }) : '—'} sub={s.earned ? tx(`已完成 ${money(s.earned, base, { compact: true })}`, `${money(s.earned, base, { compact: true })} earned`) : tx('尚未交稿', 'Nothing delivered yet')} />
        <Stat
          label={tx('最終截稿', 'Final deadline')}
          value={daysLeft == null ? '—' : daysLeft < 0 ? tx(`逾期 ${-daysLeft} 天`, `${-daysLeft}d late`) : tx(`${daysLeft} 天`, `${daysLeft} days`)}
          sub={p.dueAt ? dueInfo(p.dueAt, today)?.text : tx('尚未設定', 'Not set')}
          tone={daysLeft != null && daysLeft < 0 ? 'text-bad' : undefined}
        />
      </div>

      {rows.length > 0 && (
        <section className="card p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <div className="eyebrow mb-0.5">{s.start && s.end ? `${s.start.replace(/-/g, '.')} – ${s.end.replace(/-/g, '.')}` : ''}</div>
              <h2 className="text-[15px] font-semibold text-ink">{tx('時程', 'Schedule')}</h2>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-4 rounded-[2px]" style={{ background: 'var(--series-1)' }} />
                {tx('已完成的份量', 'Done')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-4 rounded-[2px]" style={{ background: 'var(--series-1)', opacity: 0.22 }} />
                {tx('尚未完成', 'Still to do')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-4 rounded-[2px] border border-dashed" style={{ borderColor: 'var(--series-1)' }} />
                {tx('待確認', 'Not confirmed')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-0.5 bg-gold" />
                {tx('今天', 'Today')}
              </span>
            </div>
          </div>
          <Timeline rows={rows} today={today} deadline={p.dueAt ? dateOnly(p.dueAt) : undefined} onSelect={(k) => navigate('/jobs/' + k)} />
        </section>
      )}

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 pb-3 pt-4">
          <h2 className="text-[15px] font-semibold text-ink">{tx(`部分（${parts.length}）`, `Parts (${parts.length})`)}</h2>
          <Button size="sm" variant="ghost" icon={<Plus size={15} />} onClick={() => setAdding(true)}>
            {tx('新增部分', 'Add part')}
          </Button>
        </div>
        {parts.length ? (
          <ul className="hairline-list border-t border-line">
            {parts.map((j) => (
              <PartRow key={j.id} job={j} project={p} onLog={() => setLogging(j.id)} onEdit={() => openJobEditor(j, false)} />
            ))}
          </ul>
        ) : (
          <p className="border-t border-line px-5 py-6 text-[13.5px] text-muted">{tx('還沒有部分。新增預告片、過場動畫、劇情對話等部分，分開追蹤。', 'No parts yet. Add a trailer, cutscenes, dialogue and so on to track each on its own.')}</p>
        )}
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[1.35fr_1fr]">
        <QueryLog project={p} parts={parts} />
        <References project={p} />
      </div>

      {adding && <AddPart project={p} onClose={() => setAdding(false)} />}
      {logJob && <LogProgress job={logJob} onClose={() => setLogging(null)} />}
      <InvoiceBuilder
        open={invoicing}
        onClose={() => setInvoicing(false)}
        presetClient={p.clientId}
        onlyJobs={toInvoice.map((j) => j.id)}
      />
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="min-w-0 p-4 [container-type:inline-size] sm:p-5">
      <div className="eyebrow truncate">{label}</div>
      <div className={cx('tnum mt-3 truncate font-medium leading-none tracking-[-0.03em]', tone || 'text-ink')} style={fitText(value, 24)}>
        {value}
      </div>
      {sub && <div className="mt-2 truncate text-[12px] text-muted">{sub}</div>}
    </div>
  );
}

function PartRow({ job, project, onLog, onEdit }: { job: Job; project: Project; onLog: () => void; onEdit: () => void }) {
  const { today } = useData();
  const navigate = useUI((s) => s.navigate);
  const due = job.status === 'active' || job.status === 'quote' ? dueInfo(job.dueAt, today) : undefined;
  const hasVolume = job.unit === 'flat' || job.quantity > 0;
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 sm:flex-nowrap">
      <button type="button" onClick={() => navigate('/jobs/' + job.id)} className="min-w-0 basis-full text-left sm:flex-1 sm:basis-auto">
        <div className="truncate text-[14.5px] font-medium text-ink hover:underline">{shortPartName(job.title, project.name)}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] text-muted">
          <StatusPill status={job.status} />
          <span className="tnum">{hasVolume ? qty(job.unit === 'flat' ? 1 : job.quantity, job.unit) : tx('份量未定', 'Volume TBC')}</span>
          {due && <span className={cx('font-medium', due.tone === 'bad' ? 'text-bad' : due.tone === 'warn' ? 'text-warn' : 'text-ink-2')}>{due.text}</span>}
        </div>
      </button>
      <div className={cx('w-[120px] shrink-0', job.status !== 'active' && 'hidden sm:block')}>
        {job.status === 'active' ? (
          <>
            <div className="flex justify-between text-[11.5px] text-muted tnum">
              <span>{tx('完成', 'Done')}</span>
              <span>{job.progress ?? 0}%</span>
            </div>
            <div className="mt-1 h-[3px] bg-surface-3">
              <div className="h-full bg-ink" style={{ width: `${job.progress ?? 0}%` }} />
            </div>
          </>
        ) : null}
      </div>
      <div className="ml-auto w-[104px] shrink-0 text-right text-[13.5px] font-medium text-ink tnum sm:ml-0">{jobGross(job) ? money(jobGross(job), job.currency) : <span className="text-muted">—</span>}</div>
      <div className="flex shrink-0 items-center gap-1">
        {job.status === 'active' && (
          <>
            <IconBtn label={tx('記錄進度', 'Log progress')} onClick={onLog}>
              <NotebookPen size={14} />
            </IconBtn>
            <IconBtn label={tx('專注模式', 'Focus mode')} onClick={() => navigate('/focus/' + job.id)}>
              <Crosshair size={14} />
            </IconBtn>
          </>
        )}
        {job.status === 'quote' && (
          <button type="button" onClick={() => void saveJob({ ...job, status: 'active', progress: job.progress ?? 0, receivedAt: today })} className="h-8 rounded-[3px] border border-line-strong px-2.5 text-[12.5px] font-medium text-ink-2 hover:border-ink hover:text-ink">
            {tx('開始', 'Start')}
          </button>
        )}
        <IconBtn label={tx('編輯部分', 'Edit part')} onClick={onEdit}>
          <Pencil size={14} />
        </IconBtn>
      </div>
    </li>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="grid h-8 w-8 place-items-center rounded-[3px] border border-line-strong text-ink-2 transition-colors hover:border-ink hover:text-ink" aria-label={label} title={label}>
      {children}
    </button>
  );
}

// ---------- query log ----------

const QUERY_TONE: Record<ProjectQuery['status'], string> = { open: 'var(--warn)', sent: 'var(--st-active)', answered: 'var(--good)' };

function QueryLog({ project, parts }: { project: Project; parts: Job[] }) {
  const { toast } = useUI();
  const [text, setText] = useState('');
  const [jobId, setJobId] = useState('');
  const [ref, setRef] = useState('');
  const [showAnswered, setShowAnswered] = useState(false);
  const [answering, setAnswering] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const lang = getLang();
  const names = new Map(parts.map((j) => [j.id, shortPartName(j.title, project.name)]));
  const all = sortQueries(project.queries);
  const open = all.filter((q) => q.status !== 'answered');
  const shown = showAnswered ? all : open;
  const label = (st: ProjectQuery['status']) => (st === 'open' ? tx('待提問', 'To ask') : st === 'sent' ? tx('已寄出', 'Sent') : tx('已回覆', 'Answered'));

  const update = (q: ProjectQuery, patch: Partial<ProjectQuery>) => saveProject({ ...project, queries: project.queries.map((x) => (x.id === q.id ? { ...x, ...patch } : x)) });

  const add = async () => {
    if (!text.trim()) return;
    await saveProject({
      ...project,
      queries: [...project.queries, { id: uid(), text: text.trim(), jobId: jobId || undefined, ref: ref.trim() || undefined, status: 'open', createdAt: Date.now() }],
    });
    setText('');
    setRef('');
  };

  const copyOpen = async () => {
    const body = queriesText(project, parts, lang);
    if (!body) return;
    if (await copyText(body)) {
      const toSend = project.queries.filter((q) => q.status === 'open');
      if (toSend.length)
        toast(tx(`已複製 ${open.length} 個問題，可以貼到信件裡`, `Copied ${open.length} questions, ready for your email`), {
          action: {
            label: tx('標為已寄出', 'Mark as sent'),
            run: () => void saveProject({ ...project, queries: project.queries.map((q) => (q.status === 'open' ? { ...q, status: 'sent' } : q)) }),
          },
        });
    }
  };

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-3 pt-4">
        <div>
          <div className="eyebrow mb-0.5">{tx(`${open.length} 個待回覆`, `${open.length} unanswered`)}</div>
          <h2 className="text-[15px] font-semibold text-ink">{tx('問題清單', 'Query log')}</h2>
        </div>
        <div className="flex items-center gap-1">
          {open.length > 0 && (
            <Button size="sm" variant="secondary" icon={<Copy size={14} />} onClick={() => void copyOpen()}>
              {tx('複製給客戶', 'Copy for client')}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setShowAnswered((v) => !v)} aria-pressed={showAnswered}>
            {showAnswered ? tx('隱藏已回覆', 'Hide answered') : tx(`顯示已回覆（${all.length - open.length}）`, `Show answered (${all.length - open.length})`)}
          </Button>
        </div>
      </div>

      <div className="border-t border-line bg-surface-2 px-5 py-3">
        <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={tx('記下要問客戶的問題，例如：角色名要保留英文嗎？', 'Note a question for the client, e.g. keep character names in English?')} aria-label={tx('新問題', 'New question')} />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Select className="input-sm w-auto max-w-[180px]" value={jobId} onChange={(e) => setJobId(e.target.value)} aria-label={tx('相關部分', 'Part')}>
            <option value="">{tx('整個專案', 'Whole project')}</option>
            {parts.map((j) => (
              <option key={j.id} value={j.id}>
                {names.get(j.id)}
              </option>
            ))}
          </Select>
          <Input className="input-sm w-[160px]" value={ref} onChange={(e) => setRef(e.target.value)} placeholder={tx('字串 ID／時間碼', 'String ID / timecode')} aria-label={tx('參照', 'Reference')} />
          <Button size="sm" variant="primary" className="ml-auto" disabled={!text.trim()} onClick={() => void add()} icon={<Plus size={14} />}>
            {tx('加入', 'Add')}
          </Button>
        </div>
      </div>

      {shown.length ? (
        <ul className="hairline-list border-t border-line">
          {shown.map((q) => (
            <li key={q.id} className="px-5 py-3">
              <div className="flex items-start gap-3">
                <span className="mt-1 inline-flex shrink-0 items-center gap-1.5 text-[11.5px] font-medium text-ink-2">
                  <span className="h-2 w-2 rounded-[1px]" style={{ background: QUERY_TONE[q.status] }} />
                  {label(q.status)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-line text-[14px] leading-snug text-ink">{q.text}</p>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-[12px] text-muted">
                    {q.jobId && names.get(q.jobId) && <span>{names.get(q.jobId)}</span>}
                    {q.ref && <span className="font-mono">{q.ref}</span>}
                  </div>
                  {q.answer && <p className="mt-2 border-l-2 border-gold pl-3 text-[13.5px] text-ink-2">{q.answer}</p>}
                  {answering === q.id && (
                    <div className="mt-2 flex gap-2">
                      <Input className="input-sm" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder={tx('客戶的回覆', 'The client’s answer')} aria-label={tx('回覆', 'Answer')} autoFocus />
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => {
                          void update(q, { status: 'answered', answer: answer.trim() || undefined, answeredAt: Date.now() });
                          setAnswering(null);
                          setAnswer('');
                        }}
                      >
                        {tx('儲存', 'Save')}
                      </Button>
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {q.status === 'open' && (
                    <IconBtn label={tx('標為已寄出', 'Mark as sent')} onClick={() => void update(q, { status: 'sent' })}>
                      <Send size={14} />
                    </IconBtn>
                  )}
                  {q.status !== 'answered' && (
                    <IconBtn
                      label={tx('記錄回覆', 'Record answer')}
                      onClick={() => {
                        setAnswering(answering === q.id ? null : q.id);
                        setAnswer('');
                      }}
                    >
                      <Check size={14} />
                    </IconBtn>
                  )}
                  <IconBtn label={tx('刪除', 'Delete')} onClick={() => void saveProject({ ...project, queries: project.queries.filter((x) => x.id !== q.id) })}>
                    <X size={14} />
                  </IconBtn>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-t border-line px-5 py-5 text-[13px] text-muted">{tx('沒有待回覆的問題。遇到不確定的地方就記在這裡，一次整理好寄給客戶。', 'Nothing waiting. Log anything unclear here and send it to the client in one go.')}</p>
      )}
    </section>
  );
}

// ---------- references & notes ----------

function References({ project }: { project: Project }) {
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const add = async () => {
    const u = url.trim();
    if (!u) return;
    const href = /^[a-z]+:/i.test(u) ? u : 'https://' + u;
    await saveProject({ ...project, links: [...project.links, { id: uid(), label: label.trim() || href.replace(/^https?:\/\//, ''), url: href }] });
    setLabel('');
    setUrl('');
  };
  return (
    <section className="card overflow-hidden">
      <div className="px-5 pb-3 pt-4">
        <div className="eyebrow mb-0.5">{tx('術語表、風格指南、設定集', 'Glossary, style guide, bible')}</div>
        <h2 className="text-[15px] font-semibold text-ink">{tx('參考資料', 'References')}</h2>
      </div>
      {project.links.length > 0 && (
        <ul className="hairline-list border-t border-line">
          {project.links.map((l) => (
            <li key={l.id} className="flex items-center gap-3 px-5 py-2.5">
              <Link2 size={15} className="shrink-0 text-muted" />
              <a href={l.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-[14px] text-ink underline decoration-gold decoration-1 underline-offset-4">
                {l.label}
              </a>
              <ExternalLink size={13} className="shrink-0 text-muted" />
              <button type="button" className="grid h-7 w-7 place-items-center rounded-[3px] text-muted hover:bg-surface-3 hover:text-ink" aria-label={tx('移除連結', 'Remove link')} onClick={() => void saveProject({ ...project, links: project.links.filter((x) => x.id !== l.id) })}>
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2 border-t border-line bg-surface-2 px-5 py-3">
        <Input className="input-sm min-w-0 flex-1 basis-[120px]" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={tx('名稱', 'Name')} aria-label={tx('連結名稱', 'Link name')} />
        <Input className="input-sm min-w-0 flex-[2] basis-[160px]" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" aria-label={tx('網址', 'URL')} onKeyDown={(e) => e.key === 'Enter' && void add()} />
        <Button size="sm" disabled={!url.trim()} onClick={() => void add()} icon={<Plus size={14} />}>
          {tx('加入', 'Add')}
        </Button>
      </div>
      <div className="border-t border-line px-5 py-4">
        <div className="eyebrow mb-2">{tx('備註', 'Notes')}</div>
        {project.notes ? <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-ink-2">{project.notes}</p> : <p className="text-[13px] text-muted">{tx('在「編輯專案」加入窗口、交稿格式、字數限制等。', 'Add contacts, delivery format and length limits under Edit project.')}</p>}
      </div>
    </section>
  );
}

// ---------- add a part ----------

function AddPart({ project, onClose }: { project: Project; onClose: () => void }) {
  const { clientMap, settings, today } = useData();
  const { toast } = useUI();
  const lang = getLang();
  const t = templateFor(project.kind);
  const kinds = [...t.parts, ...PART_KINDS.map((k) => k.id).filter((id) => !t.parts.includes(id))].map((id) => PART_KINDS.find((k) => k.id === id)!);
  const [kindId, setKindId] = useState(kinds[0].id);
  const kind = PART_KINDS.find((k) => k.id === kindId)!;
  const client = project.clientId ? clientMap.get(project.clientId) : undefined;
  const [name, setName] = useState(partLabel(kinds[0], lang, kinds[0].numbered ? 1 : undefined));
  const [unit, setUnit] = useState<Unit>(kinds[0].unit);
  const [quantity, setQuantity] = useState<number | undefined>();
  const priceFor = (k: (typeof kinds)[number], u: Unit) =>
    clientPrice(client, { service: k.service, sourceLang: project.sourceLang ?? settings.defaultSourceLang, targetLang: project.targetLang ?? settings.defaultTargetLang, unit: u, strictUnit: true })?.rate;
  const [rate, setRate] = useState<number | undefined>(() => priceFor(kinds[0], kinds[0].unit));
  const [due, setDue] = useState(project.dueAt ?? '');
  const [status, setStatus] = useState<JobStatus>('quote');
  const currency = client?.currency ?? settings.baseCurrency;

  const pick = (id: string) => {
    const k = PART_KINDS.find((x) => x.id === id)!;
    setKindId(id);
    setName(partLabel(k, lang, k.numbered ? 1 : undefined));
    setUnit(k.unit);
    setRate(priceFor(k, k.unit));
  };

  const save = async () => {
    const job = newJob({
      title: partTitle(project.name, name.trim() || partLabel(kind, lang), lang),
      projectId: project.id,
      part: kind.id,
      clientId: project.clientId,
      service: kind.service,
      unit,
      quantity: quantity ?? 0,
      rate: rate ?? 0,
      currency,
      fxToBase: fxRate(currency, settings.baseCurrency, settings.fx.rates),
      sourceLang: project.sourceLang ?? settings.defaultSourceLang,
      targetLang: project.targetLang ?? settings.defaultTargetLang,
      status,
      progress: 0,
      receivedAt: today,
      dueAt: due || undefined,
      incomeCategory: '9B',
      confidential: project.confidential || client?.kind === 'agency',
    });
    await saveJob(job);
    toast(tx(`已新增「${name}」`, `Added “${name}”`));
    onClose();
  };

  const preview = quantity && rate ? jobGrossBase(newJob({ unit, quantity, rate, currency, fxToBase: fxRate(currency, settings.baseCurrency, settings.fx.rates) })) : 0;

  return (
    <Sheet
      open
      onClose={onClose}
      size="md"
      title={tx('新增部分', 'Add a part')}
      subtitle={project.name}
      footer={
        <>
          {preview > 0 && <span className="mr-auto text-[13px] text-muted tnum">≈ {money(preview, settings.baseCurrency)}</span>}
          <Button variant="ghost" onClick={onClose}>
            {tx('取消', 'Cancel')}
          </Button>
          <Button variant="primary" onClick={() => void save()}>
            {tx('新增', 'Add')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={tx('類型', 'Kind')}>
          <div className="flex flex-wrap gap-2">
            {kinds.slice(0, 12).map((k) => (
              <button key={k.id} type="button" className="chip" aria-pressed={kindId === k.id} onClick={() => pick(k.id)}>
                {lang === 'en' ? k.en : k.zh}
              </button>
            ))}
          </div>
        </Field>
        <Field label={tx('名稱', 'Name')} htmlFor="part-name">
          <Input id="part-name" data-autofocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={tx('份量', 'Volume')} htmlFor="part-qty" hint={tx('還不知道可以先留空', 'Leave empty if unknown')}>
            <NumberInput id="part-qty" value={quantity} onChange={setQuantity} min={0} />
          </Field>
          <Field label={tx('單位', 'Unit')} htmlFor="part-unit">
            <Select id="part-unit" value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
              {UNITS.map((u) => (
                <option key={u.id} value={u.id}>
                  {lang === 'en' ? u.en : u.zh}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={tx(`單價（${currency}）`, `Rate (${currency})`)} htmlFor="part-rate">
            <NumberInput id="part-rate" value={rate} onChange={setRate} min={0} />
          </Field>
          <Field label={tx('截止日', 'Due')} htmlFor="part-due">
            <Input id="part-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
        </div>
        <Field label={tx('狀態', 'Status')}>
          <Segmented
            size="sm"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'quote', label: tx('待確認', 'Coming up') },
              { value: 'active', label: tx('進行中', 'In progress') },
            ]}
          />
        </Field>
      </div>
    </Sheet>
  );
}
