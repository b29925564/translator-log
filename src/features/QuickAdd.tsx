import { CalendarClock, CornerDownLeft, Gauge, Mic, Sparkles, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../db/data';
import { saveJob } from '../db/repo';
import { langInfo } from '../domain/constants';
import { dateOnly } from '../domain/dates';
import { jobGross, jobGrossBase, jobWords } from '../domain/money';
import { parseQuickAdd, type QuickParse, type TokenKind } from '../domain/quickadd';
import { earliestFinish, estimateHours, rateBenchmark, workload } from '../domain/stats';
import { tx } from '../i18n';
import { aiAvailable, aiParseJob } from '../ai/claude';
import { date, domain as domainName, money, num, pct, qty, rate as fmtRateStr, service as serviceName, unitPer } from '../ui/format';
import { Button, cx, Kbd, Sheet, statusLabel } from '../ui/kit';
import { useUI } from '../ui/store';
import { useSpeed } from './common';
import { jobFromParse, persistNewClient } from './jobFactory';
import { useDictation } from './dictation';

const TOKEN_COLOR: Record<TokenKind, string> = {
  client: 'var(--series-7)',
  pair: 'var(--series-1)',
  qty: 'var(--series-3)',
  rate: 'var(--series-4)',
  fee: 'var(--series-4)',
  due: 'var(--series-2)',
  domain: 'var(--series-5)',
  service: 'var(--series-6)',
  status: 'var(--series-6)',
  tool: 'var(--series-6)',
  po: 'var(--series-6)',
};

const EXAMPLES = () => [
  tx('藍海翻譯社 醫療器材說明書 英翻中 12,500字 每字1.2 10/20交', 'Lumina Localization app strings EN>ZH-TW 3.2k words @ $0.09/word due fri'),
  tx('森田翻訳 手遊活動文案 日翻中 8000字 7円/字 下週三', 'Pixelforge Games patch notes en-zh-TW 5,000 words 10 cents/word in 5 days'),
  tx('明律法律事務所 保密協議 中譯英 3500字 2.2元/字 明天下午5點', 'Harbor & Quill clinical protocol 8000 words $0.11/word Oct 30'),
  tx('小滿國際會議 發表會口譯 3小時 每小時4000元 週五', 'Atlas Patent Partners patent claims 6k words 12 cents/word'),
];

/** Textarea with a mirror layer behind it that tints every recognised token. */
function HighlightInput({ value, onChange, tokens, onSubmit, extra }: { value: string; onChange: (v: string) => void; tokens: QuickParse['tokens']; onSubmit: () => void; extra?: React.ReactNode }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const parts: { text: string; kind?: TokenKind }[] = [];
  let pos = 0;
  const sorted = [...tokens].sort((a, b) => a.start - b.start).filter((t, i, arr) => i === 0 || t.start >= arr[i - 1].end);
  for (const t of sorted) {
    if (t.start > pos) parts.push({ text: value.slice(pos, t.start) });
    parts.push({ text: value.slice(t.start, t.end), kind: t.kind });
    pos = t.end;
  }
  parts.push({ text: value.slice(pos) + '​' });
  const shared = 'px-4 py-3.5 text-[17px] leading-[1.7] whitespace-pre-wrap break-words font-sans';
  return (
    <div className="relative rounded-[4px] border border-line-strong bg-surface transition-shadow focus-within:border-ink focus-within:shadow-[0_0_0_1px_var(--ink)]">
      <div ref={mirror} aria-hidden className={cx(shared, 'pointer-events-none absolute inset-0 overflow-hidden text-transparent')}>
        {parts.map((p, i) =>
          p.kind ? (
            <mark key={i} className="rounded-[2px] text-transparent" style={{ background: `color-mix(in srgb, ${TOKEN_COLOR[p.kind]} 22%, transparent)`, boxShadow: `inset 0 -2px 0 ${TOKEN_COLOR[p.kind]}` }}>
              {p.text}
            </mark>
          ) : (
            <span key={i}>{p.text}</span>
          ),
        )}
      </div>
      <textarea
        ref={ref}
        data-autofocus
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => {
          if (mirror.current) mirror.current.scrollTop = (e.target as HTMLTextAreaElement).scrollTop;
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder={tx('例如：藍海翻譯社 醫療器材說明書 英翻中 12,500字 每字1.2 10/20交', 'e.g. Lumina app strings EN>ZH-TW 3,200 words @ $0.09/word due Friday')}
        className={cx(shared, 'relative block w-full resize-none bg-transparent pb-12 text-ink caret-accent outline-none placeholder:text-muted')}
        aria-label={tx('用一句話描述案件', 'Describe the job in one line')}
        spellCheck={false}
      />
      {extra}
    </div>
  );
}

function Slot({ label, value, kind }: { label: string; value?: string; kind: TokenKind }) {
  return (
    <div className={cx('min-w-0 rounded-xl border px-3 py-2 transition-colors', value ? 'border-line bg-surface' : 'border-dashed border-line bg-transparent')}>
      <div className="flex items-center gap-1.5 text-[11.5px] text-muted">
        <span className="h-1.5 w-1.5" style={{ background: value ? TOKEN_COLOR[kind] : 'var(--line-strong)' }} />
        {label}
      </div>
      <div className={cx('mt-0.5 truncate text-[14px]', value ? 'font-medium text-ink' : 'text-muted')}>{value ?? '—'}</div>
    </div>
  );
}

export function QuickAdd() {
  const { quickAdd, closeQuickAdd, openJobEditor, navigate, toast } = useUI();
  const data = useData();
  const { clients, jobs, settings, today, clientMap } = data;
  const [text, setText] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiParse, setAiParse] = useState<QuickParse | null>(null);
  const speed = useSpeed();

  useEffect(() => {
    if (quickAdd.open) {
      setText(quickAdd.text);
      setAiParse(null);
    }
  }, [quickAdd.open, quickAdd.text]);

  const parsed = useMemo(
    () =>
      aiParse ??
      parseQuickAdd(text, {
        clients: clients.map((c) => ({ id: c.id, name: c.name, currency: c.currency })),
        today,
        baseCurrency: settings.baseCurrency,
        defaultTargetLang: settings.defaultTargetLang,
      }),
    [text, clients, today, settings.baseCurrency, settings.defaultTargetLang, aiParse],
  );

  const built = useMemo(() => (text.trim() || aiParse ? jobFromParse(parsed, { clients, jobs, settings, today }) : undefined), [parsed, text, aiParse, clients, jobs, settings, today]);
  const job = built?.job;

  const analysis = useMemo(() => {
    if (!job) return undefined;
    const words = jobWords(job);
    const bench = words > 0 && (job.unit === 'word' || job.unit === 'char') ? rateBenchmark(jobs, { ratePerWordBase: jobGrossBase(job) / words, sourceLang: job.sourceLang, targetLang: job.targetLang, domain: job.domain, unit: job.unit }) : undefined;
    const hours = estimateHours(job, speed.wph);
    const load = workload(jobs, settings.work, today, 45, speed.wph);
    const finish = hours > 0 ? earliestFinish(load, hours) : undefined;
    return { bench, hours, finish, hourly: hours > 0 ? jobGrossBase(job) / hours : undefined };
  }, [job, jobs, speed.wph, settings.work, today]);

  const canSave = !!job && !!(job.title || job.quantity || job.rate);

  const save = async (edit = false) => {
    if (!job) return;
    if (edit) {
      await persistNewClient(built?.newClient);
      openJobEditor(job, true);
      return;
    }
    await persistNewClient(built?.newClient);
    await saveJob(job);
    closeQuickAdd();
    toast(tx(`已新增「${job.title}」`, `Added “${job.title}”`), { action: { label: tx('查看', 'View'), run: () => navigate('/jobs/' + job.id) } });
  };

  const runAI = async () => {
    setAiBusy(true);
    try {
      const r = await aiParseJob(text, { clients, today, settings });
      setAiParse(r);
    } catch (e) {
      toast(tx(`AI 解析失敗：${(e as Error).message}`, `AI parsing failed: ${(e as Error).message}`));
    } finally {
      setAiBusy(false);
    }
  };

  const spokenFrom = useRef('');
  const dict = useDictation((heard, final) => {
    const base = spokenFrom.current;
    setText(base + (base && !/\s$/.test(base) ? ' ' : '') + heard.trim());
    setAiParse(null);
    if (final) spokenFrom.current = '';
  });
  const mic = dict.supported ? (
    <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-2">
      {dict.listening && <span className="text-[12px] font-medium text-gold animate-[pulseDot_1.2s_ease_infinite]">{tx('聆聽中…', 'Listening…')}</span>}
      <button
        type="button"
        onClick={() => {
          if (dict.listening) dict.stop();
          else {
            spokenFrom.current = text;
            dict.start();
          }
        }}
        className={cx('pointer-events-auto grid h-9 w-9 place-items-center rounded-[3px] border transition-colors', dict.listening ? 'border-gold bg-gold text-[#0b0b0c]' : 'border-line-strong bg-surface text-ink-2 hover:border-ink hover:text-ink')}
        aria-label={dict.listening ? tx('停止語音輸入', 'Stop dictation') : tx('用說的新增', 'Dictate the job')}
        aria-pressed={dict.listening}
        title={tx('用說的新增', 'Dictate the job')}
      >
        <Mic size={16} />
      </button>
    </div>
  ) : null;

  const client = job?.clientId ? clientMap.get(job.clientId) ?? built?.newClient : undefined;
  const dueOk = analysis?.finish && job?.dueAt ? analysis.finish <= dateOnly(job.dueAt) : undefined;

  return (
    <Sheet
      open={quickAdd.open}
      onClose={closeQuickAdd}
      size="lg"
      title={tx('一句話新增案件', 'Add a job in one line')}
      subtitle={tx('客戶、語言、字數、費率、截止日，打在同一行就好', 'Client, languages, volume, rate and deadline — all in one line')}
      footer={
        <>
          <span className="mr-auto hidden items-center gap-1.5 text-[12px] text-muted sm:flex">
            <Kbd>Enter</Kbd> {tx('建立', 'create')} · <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> {tx('換行', 'new line')}
          </span>
          <Button variant="ghost" onClick={() => (text.trim() ? save(true) : openJobEditor(undefined, true))}>
            {tx('詳細編輯', 'Full form')}
          </Button>
          <Button variant="primary" disabled={!canSave} onClick={() => save()} icon={<CornerDownLeft size={16} />}>
            {tx('建立案件', 'Create job')}
          </Button>
        </>
      }
    >
      <HighlightInput
        value={text}
        onChange={(v) => {
          setText(v);
          setAiParse(null);
        }}
        tokens={aiParse ? [] : parsed.tokens}
        onSubmit={() => canSave && save()}
        extra={mic}
      />

      {!text.trim() && (
        <div className="mt-4">
          <div className="mb-2 text-[12.5px] font-medium text-muted">{tx('試試這些：', 'Try one:')}</div>
          <div className="flex flex-col gap-2">
            {EXAMPLES().map((ex) => (
              <button key={ex} type="button" onClick={() => setText(ex)} className="rounded-xl border border-line bg-surface-2 px-3 py-2 text-left text-[13.5px] text-ink-2 transition-colors hover:border-accent hover:text-ink">
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      {aiAvailable() && text.trim().length > 20 && !aiParse && (
        <div className="mt-3 flex justify-end">
          <Button size="sm" variant="ghost" icon={<Wand2 size={15} />} onClick={runAI} disabled={aiBusy}>
            {aiBusy ? tx('AI 解析中…', 'Reading with AI…') : tx('用 AI 讀整封信件', 'Read the whole email with AI')}
          </Button>
        </div>
      )}
      {aiParse && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-accent-soft px-3 py-2 text-[13px] text-ink">
          <Sparkles size={15} className="text-gold" /> {tx('以下欄位由 Claude 從信件中擷取，請確認', 'Fields below were extracted by Claude — please check them')}
        </div>
      )}

      {job && (
        <div className="mt-5 skeleton-fade">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Slot kind="client" label={tx('客戶', 'Client')} value={client ? client.name + (built?.newClient ? tx('（新）', ' (new)') : '') : undefined} />
            <Slot kind="pair" label={tx('語言', 'Languages')} value={`${langInfo(job.sourceLang).short} → ${langInfo(job.targetLang).short}`} />
            <Slot kind="qty" label={tx('數量', 'Volume')} value={job.unit === 'flat' ? (job.words ? qty(job.words, 'word') : tx('整案', 'Flat')) : job.quantity ? qty(job.quantity, job.unit) : undefined} />
            <Slot kind="rate" label={job.unit === 'flat' ? tx('案費', 'Fee') : tx('單價', 'Rate')} value={job.amountOverride != null ? money(job.amountOverride, job.currency) : job.rate ? (job.unit === 'flat' ? money(job.rate, job.currency) : `${fmtRateStr(job.rate, job.currency)}/${unitPer(job.unit)}`) : undefined} />
            <Slot kind="due" label={tx('截止', 'Due')} value={job.dueAt ? date(job.dueAt, job.dueAt.includes('T') ? { month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false } : { month: 'short', day: 'numeric', weekday: 'short' }) : undefined} />
            <Slot kind="domain" label={tx('領域', 'Field')} value={job.domain ? domainName(job.domain) : undefined} />
            <Slot kind="service" label={tx('服務', 'Service')} value={serviceName(job.service) + (job.status !== 'active' ? ` · ${statusLabel(job.status)}` : '')} />
            <Slot kind="tool" label={tx('工具', 'Tool')} value={job.catTool} />
          </div>

          <div className="mt-3 rounded-2xl bg-surface-2 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-[13px] text-muted">{job.title || tx('（未命名）', '(Untitled)')}</div>
                <div className="text-[26px] font-medium tracking-[-0.03em] leading-tight text-ink">{money(jobGross(job), job.currency)}</div>
                {job.currency !== settings.baseCurrency && <div className="text-[13px] text-muted tnum">≈ {money(jobGrossBase(job), settings.baseCurrency)}</div>}
              </div>
              {(job.withholding || job.nhi) && (
                <div className="text-right text-[12.5px] text-muted">
                  {tx('預估實收', 'Est. net')}{' '}
                  <span className="font-semibold text-ink tnum">{money(jobGross(job) - (job.withholding || 0) - (job.nhi || 0), job.currency)}</span>
                  <div>
                    {tx('扣繳', 'Withholding')} {money(job.withholding || 0, job.currency)} · {tx('補充保費', 'NHI')} {money(job.nhi || 0, job.currency)}
                  </div>
                </div>
              )}
            </div>

            {analysis && (analysis.bench || analysis.hours > 0) && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {analysis.bench && analysis.bench.percentile != null && (
                  <div className="rounded-xl bg-surface p-3">
                    <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-2">
                      <Gauge size={14} /> {tx('費率落點', 'Rate check')}
                    </div>
                    <RateScale bench={analysis.bench} value={jobGrossBase(job) / jobWords(job)} currency={settings.baseCurrency} />
                    <div className="mt-2 text-[12.5px] text-muted">
                      {tx(
                        `高於你 ${pct(analysis.bench.percentile)} 的${analysis.bench.scope === 'all' ? '' : '同類'}案件（${analysis.bench.n} 件）`,
                        `Higher than ${pct(analysis.bench.percentile)} of your ${analysis.bench.scope === 'all' ? '' : 'similar '}jobs (${analysis.bench.n})`,
                      )}
                    </div>
                  </div>
                )}
                {analysis.hours > 0 && (
                  <div className="rounded-xl bg-surface p-3">
                    <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-2">
                      <CalendarClock size={14} /> {tx('排程檢查', 'Schedule check')}
                    </div>
                    <div className="mt-1.5 text-[14px] text-ink">
                      {tx(`約需 ${num(analysis.hours, 1)} 小時`, `About ${num(analysis.hours, 1)} h of work`)}
                      {analysis.hourly && <span className="text-muted"> · {tx('時薪', 'hourly')} {money(analysis.hourly, settings.baseCurrency)}</span>}
                    </div>
                    <div className={cx('mt-1 text-[12.5px]', dueOk === false ? 'font-medium text-bad' : 'text-muted')}>
                      {analysis.finish
                        ? tx(`以目前排程，最快 ${date(analysis.finish, { month: 'short', day: 'numeric', weekday: 'short' })} 可交`, `With your current load, earliest ${date(analysis.finish, { month: 'short', day: 'numeric', weekday: 'short' })}`)
                        : tx('未來 45 天內排不進去', 'Does not fit in the next 45 days')}
                      {dueOk === true && tx('，趕得上截止日 ✓', ' — makes the deadline ✓')}
                      {dueOk === false && tx('，可能趕不上截止日', ' — may miss the deadline')}
                    </div>
                    <div className="mt-1 text-[11.5px] text-muted">
                      {speed.measured
                        ? tx(`依你實測速度 ${num(speed.wph)} 字/小時`, `Based on your measured ${num(speed.wph)} words/h`)
                        : tx(`依設定速度 ${num(speed.wph)} 字/小時`, `Based on your setting of ${num(speed.wph)} words/h`)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}

export function RateScale({ bench, value, currency }: { bench: { p25: number; median: number; p75: number }; value: number; currency: string }) {
  const lo = Math.min(bench.p25 * 0.6, value);
  const hi = Math.max(bench.p75 * 1.4, value);
  const x = (v: number) => `${((v - lo) / (hi - lo || 1)) * 100}%`;
  return (
    <div className="mt-3">
      <div className="relative h-1.5 bg-surface-3">
        <div className="absolute inset-y-0" style={{ left: x(bench.p25), right: `calc(100% - ${x(bench.p75)})`, background: 'var(--heat-2)' }} />
        <div className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-ink-2" style={{ left: x(bench.median) }} />
        <div className="absolute top-1/2 h-4 w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-[1px] ring-2 ring-surface" style={{ left: x(value), background: 'var(--series-1)' }} />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted tnum">
        <span>P25 {fmtRateStr(bench.p25, currency)}</span>
        <span>{tx('中位', 'Median')} {fmtRateStr(bench.median, currency)}</span>
        <span>P75 {fmtRateStr(bench.p75, currency)}</span>
      </div>
    </div>
  );
}
