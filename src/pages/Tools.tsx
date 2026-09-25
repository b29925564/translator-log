import { ArrowLeftRight, FileUp, Plus } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { LoadChart } from '../charts/charts';
import { useData } from '../db/data';
import { newJob } from '../db/repo';
import { DEFAULT_CAT_GRID } from '../domain/constants';
import { weightedWords } from '../domain/cat';
import { addDays, dateOnly } from '../domain/dates';
import { extensionOf, extractFileText, SUPPORTED_EXTENSIONS } from '../domain/fileText';
import { convert, fxRate, jobGross, jobGrossBase } from '../domain/money';
import { earliestFinish, estimateHours, rateBenchmark, workload } from '../domain/stats';
import type { CatCounts, CatGrid, Job, Unit } from '../domain/types';
import { billableCount, countText } from '../domain/wordcount';
import { tx } from '../i18n';
import { date, money, num, pct, rate as fmtRateStr } from '../ui/format';
import { Button, cx, Field, Input, NumberInput, PageHeader, Segmented, Select, Textarea } from '../ui/kit';
import { useUI } from '../ui/store';
import { CatPanel } from '../features/CatPanel';
import { CurrencySelect, DomainSelect, LangSelect, useSpeed } from '../features/common';
import { RateScale } from '../features/QuickAdd';

type Tool = 'count' | 'quote' | 'cat' | 'fx';

export function Tools() {
  const [tool, setTool] = useState<Tool>('count');
  return (
    <div>
      <PageHeader eyebrow={tx('接案前後的小幫手', 'Handy before and after a job')} title={tx('工具', 'Tools')} />
      <div className="scroll-x -mx-4 mb-5 px-4 sm:mx-0 sm:px-0">
        <Segmented
          value={tool}
          onChange={setTool}
          options={[
            { value: 'count', label: tx('字數與估價', 'Word count') },
            { value: 'quote', label: tx('接案評估', 'Quote check') },
            { value: 'cat', label: tx('CAT 加權', 'CAT weighting') },
            { value: 'fx', label: tx('匯率換算', 'Currency') },
          ]}
        />
      </div>
      {tool === 'count' && <CountTool />}
      {tool === 'quote' && <QuoteTool />}
      {tool === 'cat' && <CatTool />}
      {tool === 'fx' && <FxTool />}
    </div>
  );
}

function CountTool() {
  const { settings } = useData();
  const openJobEditor = useUI((s) => s.openJobEditor);
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [unit, setUnit] = useState<'word' | 'char'>('word');
  const [punct, setPunct] = useState(false);
  const [rate, setRate] = useState<number | undefined>();
  const [cur, setCur] = useState(settings.baseCurrency);
  const inputRef = useRef<HTMLInputElement>(null);
  const speed = useSpeed();
  const c = useMemo(() => countText(text), [text]);
  const billable = billableCount(c, unit, punct);
  const amount = (rate || 0) * billable;

  const load = async (f: File) => {
    setErr(null);
    setBusy(true);
    try {
      const t = await extractFileText(f);
      setText(t);
      setFileName(f.name);
      const cc = countText(t);
      setUnit(cc.cjkDominant ? 'char' : 'word');
    } catch {
      setErr(tx('無法讀取這個檔案', 'Could not read this file'));
    } finally {
      setBusy(false);
    }
  };

  const stats = [
    { l: tx('中文／日韓字', 'CJK characters'), v: c.cjkChars },
    { l: tx('全形標點', 'CJK punctuation'), v: c.cjkPunct },
    { l: tx('英文等單字', 'Words (Latin etc.)'), v: c.words },
    { l: tx('Word 字數', 'MS Word count'), v: c.msWord },
    { l: tx('字元（不含空白）', 'Chars (no spaces)'), v: c.charsNoSpaces },
    { l: tx('字元（含空白）', 'Chars (with spaces)'), v: c.charsWithSpaces },
    { l: tx('段落', 'Paragraphs'), v: c.paragraphs },
    { l: tx('句子', 'Sentences'), v: c.sentences },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <section className="card p-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void load(f);
          }}
          className={cx('mb-3 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors', drag ? 'border-accent bg-accent-soft' : 'border-line-strong')}
        >
          <FileUp size={24} className="text-accent" />
          <div className="text-[14px] font-medium text-ink">{busy ? tx('讀取中…', 'Reading…') : fileName ?? tx('把檔案拖到這裡', 'Drop a file here')}</div>
          <div className="text-[12px] text-muted">{SUPPORTED_EXTENSIONS.slice(0, 10).map((e) => '.' + e).join(' ')}</div>
          <Button size="sm" onClick={() => inputRef.current?.click()}>
            {tx('選擇檔案', 'Choose file')}
          </Button>
          <input ref={inputRef} type="file" className="hidden" accept={SUPPORTED_EXTENSIONS.map((e) => '.' + e).join(',')} onChange={(e) => e.target.files?.[0] && void load(e.target.files[0])} />
          {err && <div className="text-[12.5px] text-bad">{err}</div>}
        </div>
        <Textarea
          rows={10}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setFileName(null);
          }}
          placeholder={tx('或直接貼上文字…', 'Or paste text…')}
          aria-label={tx('要計算的文字', 'Text to count')}
        />
        {fileName && extensionOf(fileName) && <p className="mt-2 text-[12px] text-muted">{tx(`已從 ${fileName} 擷取文字（不含圖片與內嵌物件）`, `Text extracted from ${fileName} (images and embedded objects excluded)`)}</p>}
      </section>

      <div className="flex flex-col gap-4">
        <section className="card p-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            {stats.map((s) => (
              <div key={s.l}>
                <div className="text-[12px] text-muted">{s.l}</div>
                <div className="text-[20px] font-medium tracking-[-0.03em] text-ink tnum">{num(s.v)}</div>
              </div>
            ))}
          </div>
        </section>
        <section className="card p-4">
          <h2 className="mb-3 text-[15px] font-semibold text-ink">{tx('快速估價', 'Quick quote')}</h2>
          <div className="flex flex-col gap-3">
            <Segmented value={unit} onChange={setUnit} options={[{ value: 'word', label: tx('以單字計', 'Per word') }, { value: 'char', label: tx('以中文字計', 'Per character') }]} />
            {unit === 'char' && (
              <label className="flex items-center gap-2 text-[13px] text-ink-2">
                <input type="checkbox" checked={punct} onChange={(e) => setPunct(e.target.checked)} className="accent-[var(--accent)]" />
                {tx('標點也計費', 'Count punctuation')}
              </label>
            )}
            <div className="flex gap-2">
              <NumberInput value={rate} onChange={setRate} placeholder={tx('單價', 'Rate')} aria-label={tx('單價', 'Rate')} />
              <CurrencySelect value={cur} onChange={setCur} className="w-[110px] shrink-0" />
            </div>
            <div className="rounded-xl bg-surface-2 p-3">
              <div className="text-[12.5px] text-muted">
                {num(billable)} {unit === 'char' ? tx('字', 'chars') : tx('字', 'words')} × {rate ? fmtRateStr(rate, cur) : '—'}
              </div>
              <div className="text-[26px] font-medium tracking-[-0.03em] text-ink">{money(amount, cur)}</div>
              {billable > 0 && (
                <div className="mt-1 text-[12.5px] text-muted">
                  {tx(`約 ${num((unit === 'char' ? billable / 1.6 : billable) / speed.wph, 1)} 小時工作量`, `About ${num((unit === 'char' ? billable / 1.6 : billable) / speed.wph, 1)} hours of work`)}
                </div>
              )}
            </div>
            <Button
              variant="primary"
              icon={<Plus size={16} />}
              disabled={!billable}
              onClick={() =>
                openJobEditor(
                  newJob({
                    title: fileName?.replace(/\.[^.]+$/, '') ?? '',
                    unit,
                    quantity: billable,
                    rate: rate ?? 0,
                    currency: cur,
                    fxToBase: fxRate(cur, settings.baseCurrency, settings.fx.rates),
                    sourceLang: unit === 'char' ? settings.defaultTargetLang : settings.defaultSourceLang,
                    targetLang: unit === 'char' ? settings.defaultSourceLang : settings.defaultTargetLang,
                  }),
                  true,
                )
              }
            >
              {tx('用這個建立案件', 'Create a job from this')}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

function QuoteTool() {
  const { jobs, settings, today } = useData();
  const speed = useSpeed();
  const base = settings.baseCurrency;
  const [q, setQ] = useState({
    quantity: 5000 as number | undefined,
    unit: 'word' as Unit,
    rate: undefined as number | undefined,
    currency: base,
    sourceLang: settings.defaultSourceLang,
    targetLang: settings.defaultTargetLang,
    domain: undefined as string | undefined,
    due: addDays(today, 5),
  });
  const set = (p: Partial<typeof q>) => setQ((x) => ({ ...x, ...p }));
  const fx = fxRate(q.currency, base, settings.fx.rates);
  const job: Job = newJob({ id: '__quote', unit: q.unit, quantity: q.quantity ?? 0, rate: q.rate ?? 0, currency: q.currency, fxToBase: fx, sourceLang: q.sourceLang, targetLang: q.targetLang, domain: q.domain, dueAt: q.due, status: 'active', progress: 0 });
  const perWord = q.unit === 'word' || q.unit === 'char';
  const bench = useMemo(
    () => (perWord ? rateBenchmark(jobs, { ratePerWordBase: q.rate ? q.rate * fx : undefined, sourceLang: q.sourceLang, targetLang: q.targetLang, domain: q.domain, unit: q.unit }) : undefined),
    [jobs, q.rate, fx, q.sourceLang, q.targetLang, q.domain, q.unit, perWord],
  );
  const hours = estimateHours(job, speed.wph);
  const days = 21;
  const load = useMemo(() => workload(jobs, settings.work, today, days, speed.wph), [jobs, settings.work, today, speed.wph]);
  const withNew = useMemo(() => workload(jobs, settings.work, today, days, speed.wph, job), [jobs, settings.work, today, speed.wph, job]);
  const finish = earliestFinish(load, hours);
  const late = finish && q.due ? finish > dateOnly(q.due) : false;
  const overloaded = withNew.filter((d) => d.capacity > 0 && d.hours > d.capacity * 1.05).length;
  const suggested = bench ? bench.median / fx : undefined;
  const rush = late ? 0.3 : overloaded > 0 ? 0.15 : 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <section className="card flex flex-col gap-3 p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={tx('數量', 'Volume')}>
            <NumberInput value={q.quantity} onChange={(v) => set({ quantity: v })} />
          </Field>
          <Field label={tx('單位', 'Unit')}>
            <Select value={q.unit} onChange={(e) => set({ unit: e.target.value as Unit })}>
              <option value="word">{tx('單字', 'Words')}</option>
              <option value="char">{tx('中文字', 'Characters')}</option>
              <option value="hour">{tx('小時', 'Hours')}</option>
            </Select>
          </Field>
        </div>
        <Field label={tx('客戶開價（單價）', 'Offered rate')}>
          <div className="flex gap-2">
            <NumberInput value={q.rate} onChange={(v) => set({ rate: v })} placeholder="—" />
            <CurrencySelect value={q.currency} onChange={(v) => set({ currency: v })} className="w-[110px] shrink-0" />
          </div>
        </Field>
        <div className="flex items-end gap-2">
          <Field label={tx('原文', 'Source')} className="flex-1">
            <LangSelect value={q.sourceLang} onChange={(v) => set({ sourceLang: v })} />
          </Field>
          <Button iconOnly variant="ghost" icon={<ArrowLeftRight size={16} />} aria-label={tx('對調', 'Swap')} onClick={() => set({ sourceLang: q.targetLang, targetLang: q.sourceLang })} />
          <Field label={tx('譯文', 'Target')} className="flex-1">
            <LangSelect value={q.targetLang} onChange={(v) => set({ targetLang: v })} />
          </Field>
        </div>
        <Field label={tx('領域', 'Field')}>
          <DomainSelect value={q.domain} onChange={(v) => set({ domain: v })} />
        </Field>
        <Field label={tx('客戶要求的截止日', 'Requested deadline')}>
          <Input type="date" value={q.due} onChange={(e) => set({ due: e.target.value })} />
        </Field>
      </section>

      <div className="flex flex-col gap-4">
        <section className="card p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <div className="text-[12.5px] text-muted">{tx('這案子的收入', 'This job pays')}</div>
              <div className="text-[26px] font-medium tracking-[-0.03em] text-ink">{money(jobGross(job), q.currency)}</div>
              {q.currency !== base && <div className="text-[12.5px] text-muted">≈ {money(jobGrossBase(job), base)}</div>}
            </div>
            <div>
              <div className="text-[12.5px] text-muted">{tx('預估工時', 'Estimated work')}</div>
              <div className="text-[26px] font-medium tracking-[-0.03em] text-ink">{num(hours, 1)} h</div>
              <div className="text-[12.5px] text-muted">{speed.measured ? tx('依你的實測速度', 'From your measured speed') : tx('依設定速度', 'From your settings')}</div>
            </div>
            <div>
              <div className="text-[12.5px] text-muted">{tx('換算時薪', 'Works out to')}</div>
              <div className="text-[26px] font-medium tracking-[-0.03em] text-ink">{hours > 0 ? money(jobGrossBase(job) / hours, base) : '—'}</div>
              <div className="text-[12.5px] text-muted">{tx('每小時', 'per hour')}</div>
            </div>
          </div>
          {bench && (
            <div className="mt-5 rounded-xl bg-surface-2 p-4">
              <div className="text-[13px] font-medium text-ink-2">{tx('和你過去的同類案件相比', 'Against your similar past jobs')}</div>
              {q.rate ? <RateScale bench={bench} value={q.rate * fx} currency={base} /> : null}
              <div className="mt-3 text-[13.5px] text-ink">
                {bench.percentile != null && q.rate
                  ? bench.percentile < 0.25
                    ? tx(`這個價格低於你 ${pct(1 - bench.percentile)} 的案件，建議議價。`, `This rate is below ${pct(1 - bench.percentile)} of your jobs — worth negotiating.`)
                    : bench.percentile > 0.75
                      ? tx(`這是好價格，高於你 ${pct(bench.percentile)} 的案件。`, `A good rate: higher than ${pct(bench.percentile)} of your jobs.`)
                      : tx(`落在你的一般行情（高於 ${pct(bench.percentile)} 的案件）。`, `Within your usual range (above ${pct(bench.percentile)} of jobs).`)
                  : tx('輸入客戶開價，就能看到落點。', 'Enter the offered rate to see where it lands.')}
              </div>
              {suggested != null && (
                <div className="mt-2 text-[13px] text-muted">
                  {tx('建議報價', 'Suggested quote')}: <b className="text-ink">{fmtRateStr(suggested * (1 + rush), q.currency)}</b>
                  {rush > 0 && tx(`（含 ${pct(rush)} 急件加成）`, ` (includes a ${pct(rush)} rush fee)`)} · {tx(`依 ${bench.n} 件紀錄的中位數`, `median of ${bench.n} jobs`)}
                </div>
              )}
            </div>
          )}
        </section>
        <section className="card p-5">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-semibold text-ink">{tx('排得進去嗎？', 'Does it fit?')}</h2>
            <span className={cx('text-[13.5px] font-medium', late ? 'text-bad' : 'text-good')}>
              {finish
                ? late
                  ? tx(`最快 ${date(finish)} 才能完成，會超過截止日`, `Earliest finish ${date(finish)} — past the deadline`)
                  : tx(`最快 ${date(finish)} 可完成，趕得上 ✓`, `Earliest finish ${date(finish)} — on time ✓`)
                : tx(`未來 ${days} 天排不進去`, `Doesn’t fit in the next ${days} days`)}
            </span>
          </div>
          <LoadChart data={withNew.map((d) => ({ date: d.date, capacity: d.capacity, hours: load.find((x) => x.date === d.date)?.hours ?? 0, extra: Math.max(0, d.hours - (load.find((x) => x.date === d.date)?.hours ?? 0)) }))} height={170} />
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: 'var(--series-1)' }} />
              {tx('已接案件', 'Current work')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: 'var(--series-1)', opacity: 0.35 }} />
              {tx('這個新案件', 'This new job')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: 'var(--bad)' }} />
              {tx('超出負荷', 'Over capacity')}
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}

function CatTool() {
  const { settings } = useData();
  const [counts, setCounts] = useState<CatCounts>({});
  const [grid, setGrid] = useState<CatGrid>(DEFAULT_CAT_GRID);
  const [rate, setRate] = useState<number | undefined>();
  const [cur, setCur] = useState(settings.baseCurrency);
  const w = weightedWords(counts, grid);
  const total = Object.values(counts).reduce<number>((s, v) => s + (v || 0), 0);
  return (
    <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
      <CatPanel counts={counts} grid={grid} onChange={(c, g) => { setCounts(c); setGrid(g); }} />
      <section className="card flex flex-col gap-3 p-5">
        <Field label={tx('單價（每字）', 'Rate per word')}>
          <div className="flex gap-2">
            <NumberInput value={rate} onChange={setRate} />
            <CurrencySelect value={cur} onChange={setCur} className="w-[110px] shrink-0" />
          </div>
        </Field>
        <div className="rounded-xl bg-surface-2 p-4">
          <div className="text-[12.5px] text-muted">{tx('全額計價', 'Without discounts')}</div>
          <div className="text-[18px] font-semibold text-ink-2 line-through decoration-muted/60">{money(total * (rate || 0), cur)}</div>
          <div className="mt-2 text-[12.5px] text-muted">{tx('加權後應收', 'After CAT weighting')}</div>
          <div className="text-[28px] font-medium tracking-[-0.03em] text-ink">{money(w * (rate || 0), cur)}</div>
          {total > 0 && <div className="mt-1 text-[12.5px] text-muted">{tx(`折讓 ${pct(1 - w / total)}`, `${pct(1 - w / total)} discount`)}</div>}
        </div>
      </section>
    </div>
  );
}

function FxTool() {
  const { settings } = useData();
  const [amount, setAmount] = useState<number | undefined>(100);
  const [from, setFrom] = useState('USD');
  const [to, setTo] = useState(settings.baseCurrency);
  const out = convert(amount || 0, from, to, settings.fx.rates);
  const common = ['USD', 'EUR', 'JPY', 'GBP', 'CNY', 'HKD'].filter((c) => c !== settings.baseCurrency);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card flex flex-col gap-3 p-5">
        <div className="flex items-end gap-2">
          <Field label={tx('金額', 'Amount')} className="flex-1">
            <NumberInput value={amount} onChange={setAmount} />
          </Field>
          <Field label={tx('從', 'From')}>
            <CurrencySelect value={from} onChange={setFrom} className="w-[120px]" />
          </Field>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1 rounded-xl bg-surface-2 p-3">
            <div className="text-[12.5px] text-muted">{tx('換算結果', 'Result')}</div>
            <div className="text-[26px] font-medium tracking-[-0.03em] text-ink">{money(out, to)}</div>
          </div>
          <Button iconOnly variant="ghost" icon={<ArrowLeftRight size={16} />} aria-label={tx('對調', 'Swap')} onClick={() => { setFrom(to); setTo(from); }} />
          <Field label={tx('到', 'To')}>
            <CurrencySelect value={to} onChange={setTo} className="w-[120px]" />
          </Field>
        </div>
        <p className="text-[12px] text-muted">
          {settings.fx.updatedAt
            ? tx(`匯率更新於 ${new Date(settings.fx.updatedAt).toLocaleString('zh-TW')}（${settings.fx.source ?? ''}）`, `Rates updated ${new Date(settings.fx.updatedAt).toLocaleString('en-US')} (${settings.fx.source ?? ''})`)
            : tx('使用內建參考匯率，可在設定中更新為最新匯率。', 'Using built-in reference rates. Update them in Settings.')}
        </p>
      </section>
      <section className="card p-5">
        <h2 className="mb-3 text-[15px] font-semibold text-ink">{tx(`1 單位換算成 ${settings.baseCurrency}`, `1 unit in ${settings.baseCurrency}`)}</h2>
        <ul className="divide-y divide-line">
          {common.map((c) => (
            <li key={c} className="flex justify-between py-2 text-[14px]">
              <span className="font-mono text-ink-2">{c}</span>
              <span className="font-medium text-ink tnum">{num(fxRate(c, settings.baseCurrency, settings.fx.rates), 4)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
