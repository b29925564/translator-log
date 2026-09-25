import { ArrowLeftRight, Calculator, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useData } from '../db/data';
import { deleteJob, restoreJob, saveJob, withStatus } from '../db/repo';
import { weightedWords } from '../domain/cat';
import { CAT_TOOLS, DEFAULT_CAT_GRID, SERVICES, STATUSES, UNITS } from '../domain/constants';
import { fxRate, jobGross, jobGrossBase, jobNet, suggestDeductions } from '../domain/money';
import { clientPrice, matchClientRate, rateLabel } from '../domain/rates';
import type { Job, JobStatus, Unit } from '../domain/types';
import { getLang, tx } from '../i18n';
import { money, num, rate as fmtRateStr, unitPer } from '../ui/format';
import { Button, cx, Field, Input, NumberInput, Select, Sheet, statusLabel, Textarea, Toggle } from '../ui/kit';
import { useUI } from '../ui/store';
import { CatPanel } from './CatPanel';
import { ClientSelect, clientHabits, CurrencySelect, DomainSelect, LangSelect } from './common';

function Block({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="border-t border-line pt-4 first:border-t-0 first:pt-0">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="eyebrow">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

const qtyLabel = (u: Unit) =>
  ({
    word: tx('字數（原文單字）', 'Word count'),
    char: tx('字數（中文字元）', 'Character count'),
    hour: tx('時數', 'Hours'),
    minute: tx('影音長度（分鐘）', 'Media minutes'),
    page: tx('頁數', 'Pages'),
    flat: tx('數量', 'Quantity'),
  })[u];

export function JobEditor() {
  const { jobEditor, closeJobEditor, ask, toast, navigate } = useUI();
  const { jobs, settings, clientMap, today, projects } = useData();
  const [d, setD] = useState<Job | null>(null);
  const [overrideOn, setOverrideOn] = useState(false);
  const [catOn, setCatOn] = useState(false);
  // the price last filled in from the client, so edits to service or languages can update it until the user types their own
  const autoPrice = useRef<{ rate: number; unit: Unit; minimumFee?: number } | null>(null);

  const defaults = useRef({ settings, today });
  defaults.current = { settings, today };
  useEffect(() => {
    const { settings, today } = defaults.current;
    autoPrice.current = null;
    if (jobEditor.open && jobEditor.job) {
      setD({ ...jobEditor.job });
      setOverrideOn(jobEditor.job.amountOverride != null);
      setCatOn(!!jobEditor.job.cat);
    } else if (jobEditor.open) {
      const cur = settings.baseCurrency;
      setD({
        id: crypto.randomUUID?.() ?? String(Date.now()),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        title: '',
        service: 'translation',
        sourceLang: settings.defaultSourceLang,
        targetLang: settings.defaultTargetLang,
        tags: [],
        unit: 'word',
        quantity: 0,
        rate: 0,
        currency: cur,
        fxToBase: 1,
        status: 'active',
        receivedAt: today,
        progress: 0,
        incomeCategory: '9B',
      });
      setOverrideOn(false);
      setCatOn(false);
    } else setD(null);
  }, [jobEditor.open, jobEditor.job]);

  const set = (patch: Partial<Job>) => setD((x) => (x ? { ...x, ...patch } : x));
  const client = d?.clientId ? clientMap.get(d.clientId) : undefined;
  const gross = d ? jobGross(d) : 0;

  const suggestion = useMemo(() => (d ? suggestDeductions(gross, d.currency, client, settings.tax) : undefined), [d, gross, client, settings.tax]);

  if (!d) return null;
  const isNew = jobEditor.isNew;
  const base = settings.baseCurrency;

  /** Price fields for `next` from its client's rate card, or {} when the user has set their own rate. */
  const reprice = (next: Job, force = false): Partial<Job> => {
    const a = autoPrice.current;
    const untouched = !d.rate || (a != null && a.rate === d.rate && a.unit === d.unit);
    if (!force && !untouched) return {};
    const c = next.clientId ? clientMap.get(next.clientId) : undefined;
    const p = clientPrice(c, { service: next.service, sourceLang: next.sourceLang, targetLang: next.targetLang, unit: next.unit });
    if (!p) return {};
    const unit = p.unit ?? next.unit;
    // keep a minimum fee the user typed; replace one that came from the previous rate
    const minimumFee = p.minimumFee ?? (a && d.minimumFee === a.minimumFee ? undefined : d.minimumFee);
    autoPrice.current = { rate: p.rate, unit, minimumFee: p.minimumFee };
    return { rate: p.rate, unit, minimumFee, ...(unit !== next.unit && unit === 'flat' ? { quantity: 1 } : {}) };
  };

  const setPriced = (patch: Partial<Job>) => set({ ...patch, ...reprice({ ...d, ...patch }) });

  const applyClient = (id?: string) => {
    const c = id ? clientMap.get(id) : undefined;
    const patch: Partial<Job> = { clientId: id };
    if (c && (isNew || !d.rate)) {
      const h = clientHabits(c.id, jobs);
      patch.currency = c.currency;
      patch.fxToBase = fxRate(c.currency, base, settings.fx.rates);
      if (h) {
        patch.sourceLang = h.sourceLang;
        patch.targetLang = h.targetLang;
        patch.domain = d.domain ?? h.domain;
        patch.catTool = d.catTool ?? h.catTool;
        patch.service = h.service ?? d.service;
      }
      const priced = reprice({ ...d, ...patch }, true);
      if (priced.rate) Object.assign(patch, priced);
      else {
        if (h?.unit) patch.unit = h.unit;
        if (h?.rate) patch.rate = h.rate;
        autoPrice.current = patch.rate ? { rate: patch.rate, unit: patch.unit ?? d.unit } : null;
      }
      patch.confidential = c.kind === 'agency';
      if (c.catGrid && d.cat) patch.cat = { ...d.cat, grid: c.catGrid };
    }
    set(patch);
  };

  const save = async () => {
    let job = { ...d };
    if (!overrideOn) job.amountOverride = undefined;
    if (!catOn) job.cat = undefined;
    if (!job.title.trim()) job.title = tx('未命名案件', 'Untitled job');
    const wasPaid = jobEditor.job?.status === 'paid';
    job = withStatus(job, job.status, today);
    // keep explicitly entered dates that withStatus would otherwise fill
    for (const k of ['deliveredAt', 'invoicedAt', 'paidAt'] as const) if (d[k]) job[k] = d[k];
    await saveJob(job);
    closeJobEditor();
    if (!wasPaid && job.status === 'paid') useUI.getState().fireStamp(tx('已收款', 'PAID'), today.replace(/-/g, '.'));
    else toast(isNew ? tx(`已新增「${job.title}」`, `Added “${job.title}”`) : tx('已儲存', 'Saved'));
    if (isNew) navigate('/jobs/' + job.id);
  };

  const remove = async () => {
    const ok = await ask({ title: tx('刪除這個案件？', 'Delete this job?'), body: tx('計時紀錄也會一併刪除。', 'Its time entries will be deleted too.'), confirm: tx('刪除', 'Delete'), danger: true });
    if (!ok) return;
    await deleteJob(d.id);
    closeJobEditor();
    navigate('/jobs');
    toast(tx('已刪除', 'Deleted'), { action: { label: tx('復原', 'Undo'), run: () => void restoreJob(d.id) } });
  };

  const setStatus = (s: JobStatus) => {
    const next = withStatus(d, s, today);
    setD(next);
  };

  const catCounts = d.cat?.counts ?? { noMatch: d.quantity || 0 };
  const catGrid = d.cat?.grid ?? client?.catGrid ?? DEFAULT_CAT_GRID;
  const perWord = d.unit === 'word' || d.unit === 'char';
  const cardRate = matchClientRate(client, { service: d.service, sourceLang: d.sourceLang, targetLang: d.targetLang, unit: d.unit });
  const cardApplied = cardRate && cardRate.rate === d.rate && cardRate.unit === d.unit;
  const en = getLang() === 'en';

  return (
    <Sheet
      open={jobEditor.open}
      onClose={closeJobEditor}
      size="lg"
      title={isNew ? tx('新增案件', 'New job') : tx('編輯案件', 'Edit job')}
      footer={
        <>
          {!isNew && (
            <Button variant="ghost" className="mr-auto text-bad" icon={<Trash2 size={16} />} onClick={remove}>
              {tx('刪除', 'Delete')}
            </Button>
          )}
          <Button variant="ghost" onClick={closeJobEditor}>
            {tx('取消', 'Cancel')}
          </Button>
          <Button variant="primary" onClick={save}>
            {isNew ? tx('建立', 'Create') : tx('儲存', 'Save')}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Block title={tx('基本資料', 'Basics')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={tx('案件名稱', 'Title')} className="sm:col-span-2" htmlFor="job-title">
              <Input id="job-title" data-autofocus value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder={tx('例如：輸液幫浦使用說明書 v3.2', 'e.g. Infusion pump IFU v3.2')} />
            </Field>
            <Field label={tx('客戶', 'Client')} htmlFor="job-client">
              <ClientSelect id="job-client" value={d.clientId} onChange={(id) => applyClient(id)} />
            </Field>
            {projects.length > 0 && (
              <Field label={tx('所屬專案', 'Project')} htmlFor="job-project">
                <Select
                  id="job-project"
                  value={d.projectId ?? ''}
                  onChange={(e) => {
                    const pj = projects.find((x) => x.id === e.target.value);
                    set({ projectId: pj?.id, part: pj ? d.part : undefined });
                    if (pj?.clientId && !d.clientId) applyClient(pj.clientId);
                  }}
                >
                  <option value="">{tx('（不屬於專案）', '(None)')}</option>
                  {projects
                    .filter((pj) => !pj.archived || pj.id === d.projectId)
                    .map((pj) => (
                      <option key={pj.id} value={pj.id}>
                        {pj.name}
                      </option>
                    ))}
                </Select>
              </Field>
            )}
            <Field label={tx('服務類型', 'Service')} htmlFor="job-service">
              <Select id="job-service" value={d.service} onChange={(e) => setPriced({ service: e.target.value as Job['service'] })}>
                {SERVICES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {en ? s.en : s.zh}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={tx('語言組合', 'Language pair')} className="sm:col-span-2">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <LangSelect id="job-src" value={d.sourceLang} onChange={(v) => setPriced({ sourceLang: v })} />
                </div>
                <Button iconOnly variant="ghost" icon={<ArrowLeftRight size={16} />} aria-label={tx('對調', 'Swap')} onClick={() => setPriced({ sourceLang: d.targetLang, targetLang: d.sourceLang })} />
                <div className="min-w-0 flex-1">
                  <LangSelect id="job-tgt" value={d.targetLang} onChange={(v) => setPriced({ targetLang: v })} />
                </div>
              </div>
            </Field>
            <Field label={tx('領域', 'Field')} htmlFor="job-domain">
              <DomainSelect id="job-domain" value={d.domain} onChange={(v) => set({ domain: v })} />
            </Field>
            <Field label={tx('CAT 工具', 'CAT tool')} htmlFor="job-tool">
              <Input id="job-tool" list="cat-tools" value={d.catTool ?? ''} onChange={(e) => set({ catTool: e.target.value || undefined })} placeholder="Trados Studio" />
              <datalist id="cat-tools">
                {CAT_TOOLS.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
          </div>
        </Block>

        <Block
          title={tx('數量與計價', 'Volume & pricing')}
          aside={
            perWord ? (
              <Toggle
                label={<span className="text-[13px]">{tx('CAT 加權', 'CAT weighting')}</span>}
                checked={catOn}
                onChange={(v) => {
                  setCatOn(v);
                  if (v && !d.cat) set({ cat: { counts: catCounts, grid: catGrid } });
                }}
              />
            ) : undefined
          }
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={tx('計價單位', 'Unit')} htmlFor="job-unit">
              <Select id="job-unit" value={d.unit} onChange={(e) => set({ unit: e.target.value as Unit, quantity: e.target.value === 'flat' ? 1 : d.quantity })}>
                {UNITS.map((u) => (
                  <option key={u.id} value={u.id}>
                    {en ? u.en : u.zh}
                  </option>
                ))}
              </Select>
            </Field>
            {d.unit !== 'flat' ? (
              <Field label={qtyLabel(d.unit)} htmlFor="job-qty">
                <NumberInput id="job-qty" value={d.quantity || undefined} onChange={(v) => set({ quantity: v ?? 0, ...(catOn && d.cat ? {} : {}) })} placeholder="0" disabled={catOn} />
              </Field>
            ) : (
              <Field label={tx('統計字數（選填）', 'Word count (optional)')} htmlFor="job-words">
                <NumberInput id="job-words" value={d.words} onChange={(v) => set({ words: v })} placeholder="0" />
              </Field>
            )}
            <Field
              label={d.unit === 'flat' ? tx('案費', 'Fee') : tx(`單價（每${unitPer(d.unit)}）`, `Rate (per ${unitPer(d.unit)})`)}
              htmlFor="job-rate"
              hint={
                cardRate && cardApplied ? (
                  <span data-testid="rate-source">
                    {tx('客戶費率：', 'Client rate: ')}
                    {rateLabel(cardRate, getLang())}
                    {cardRate.note ? ` · ${cardRate.note}` : ''}
                  </span>
                ) : cardRate ? (
                  <button
                    type="button"
                    className="text-accent underline-offset-2 hover:underline"
                    onClick={() => {
                      autoPrice.current = null;
                      set({ ...reprice({ ...d, rate: 0 }, true) });
                    }}
                  >
                    {tx(`套用客戶費率 ${fmtRateStr(cardRate.rate, d.currency)}`, `Use client rate ${fmtRateStr(cardRate.rate, d.currency)}`)}
                    {cardRate.unit !== 'flat' ? `/${unitPer(cardRate.unit)}` : ''}
                  </button>
                ) : undefined
              }
            >
              <div className="flex gap-2">
                <NumberInput id="job-rate" value={d.rate || undefined} onChange={(v) => set({ rate: v ?? 0 })} placeholder="0" className="min-w-0" />
                <CurrencySelect
                  value={d.currency}
                  onChange={(c) => set({ currency: c, fxToBase: fxRate(c, base, settings.fx.rates) })}
                  className="w-[88px] shrink-0 px-2 pr-7 text-[13px]"
                />
              </div>
            </Field>
            {(d.unit === 'hour' || d.unit === 'minute' || d.unit === 'page') && (
              <Field label={tx('統計字數（選填）', 'Word count (optional)')} htmlFor="job-words2">
                <NumberInput id="job-words2" value={d.words} onChange={(v) => set({ words: v })} placeholder="0" />
              </Field>
            )}
          </div>

          {catOn && perWord && (
            <div className="mt-3">
              <CatPanel
                counts={catCounts}
                grid={catGrid}
                onChange={(counts, grid) => set({ cat: { counts, grid }, quantity: Object.values(counts).reduce<number>((s, v) => s + (v || 0), 0) })}
              />
            </div>
          )}

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label={tx('急件加價／折扣 %', 'Rush / discount %')} htmlFor="job-sur">
              <NumberInput id="job-sur" value={d.surchargePct} onChange={(v) => set({ surchargePct: v })} placeholder="0" suffix="%" />
            </Field>
            <Field label={tx('最低收費', 'Minimum fee')} htmlFor="job-min">
              <NumberInput id="job-min" value={d.minimumFee} onChange={(v) => set({ minimumFee: v })} placeholder="—" />
            </Field>
            {d.currency !== base && (
              <Field label={tx(`匯率（1 ${d.currency} = ? ${base}）`, `FX (1 ${d.currency} = ? ${base})`)} htmlFor="job-fx">
                <NumberInput id="job-fx" value={d.fxToBase} onChange={(v) => set({ fxToBase: v ?? 1 })} />
              </Field>
            )}
          </div>

          <div className="mt-3 rounded-xl bg-surface-2 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[12px] text-muted">
                  {catOn && d.cat ? tx(`加權後 ${num(weightedWords(d.cat.counts, d.cat.grid), 1)} 字 × ${fmtRateStr(d.rate, d.currency)}`, `${num(weightedWords(d.cat.counts, d.cat.grid), 1)} weighted × ${fmtRateStr(d.rate, d.currency)}`) : tx('案件總額', 'Job total')}
                </div>
                <div className="text-[22px] font-medium tracking-[-0.03em] text-ink tnum">{money(gross, d.currency)}</div>
                {d.currency !== base && <div className="text-[12.5px] text-muted tnum">≈ {money(jobGrossBase(d), base)}</div>}
              </div>
              <Toggle label={<span className="text-[13px]">{tx('手動輸入總額', 'Set total manually')}</span>} checked={overrideOn} onChange={(v) => { setOverrideOn(v); if (v) set({ amountOverride: gross }); }} />
            </div>
            {overrideOn && (
              <div className="mt-2 max-w-[220px]">
                <NumberInput value={d.amountOverride} onChange={(v) => set({ amountOverride: v })} aria-label={tx('總額', 'Total')} />
              </div>
            )}
          </div>
        </Block>

        <Block title={tx('進度與日期', 'Status & dates')}>
          <div className="scroll-x -mx-1 flex gap-1.5 px-1 pb-1">
            {STATUSES.map((s) => (
              <button key={s} type="button" className="chip" aria-pressed={d.status === s} onClick={() => setStatus(s)}>
                {statusLabel(s)}
              </button>
            ))}
          </div>
          {d.status === 'active' && (
            <Field label={tx(`完成度 ${d.progress ?? 0}%`, `Progress ${d.progress ?? 0}%`)} className="mt-3" htmlFor="job-progress">
              <input id="job-progress" type="range" min={0} max={100} step={5} value={d.progress ?? 0} onChange={(e) => set({ progress: Number(e.target.value) })} className="w-full accent-[var(--accent)]" />
            </Field>
          )}
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label={tx('接案日', 'Received')} htmlFor="job-received">
              <Input id="job-received" type="date" value={d.receivedAt ?? ''} onChange={(e) => set({ receivedAt: e.target.value || undefined })} />
            </Field>
            <Field label={tx('截止日', 'Due date')} htmlFor="job-due">
              <Input id="job-due" type="date" value={d.dueAt?.slice(0, 10) ?? ''} onChange={(e) => set({ dueAt: e.target.value ? e.target.value + (d.dueAt?.includes('T') ? d.dueAt.slice(10) : '') : undefined })} />
            </Field>
            <Field label={tx('截止時間（選填）', 'Due time (optional)')} htmlFor="job-due-time">
              <Input
                id="job-due-time"
                type="time"
                value={d.dueAt?.includes('T') ? d.dueAt.slice(11, 16) : ''}
                onChange={(e) => set({ dueAt: d.dueAt ? d.dueAt.slice(0, 10) + (e.target.value ? 'T' + e.target.value : '') : e.target.value ? `${today}T${e.target.value}` : undefined })}
              />
            </Field>
            {['delivered', 'invoiced', 'paid'].includes(d.status) && (
              <Field label={tx('交稿日', 'Delivered')} htmlFor="job-delivered">
                <Input id="job-delivered" type="date" value={d.deliveredAt ?? ''} onChange={(e) => set({ deliveredAt: e.target.value || undefined })} />
              </Field>
            )}
            {['invoiced', 'paid'].includes(d.status) && (
              <Field label={tx('請款日', 'Invoiced')} htmlFor="job-invoiced">
                <Input id="job-invoiced" type="date" value={d.invoicedAt ?? ''} onChange={(e) => set({ invoicedAt: e.target.value || undefined })} />
              </Field>
            )}
            {d.status === 'paid' && (
              <Field label={tx('收款日', 'Paid')} htmlFor="job-paid">
                <Input id="job-paid" type="date" value={d.paidAt ?? ''} onChange={(e) => set({ paidAt: e.target.value || undefined })} />
              </Field>
            )}
            {['delivered', 'invoiced'].includes(d.status) && (
              <Field label={tx('付款期限', 'Payment due')} htmlFor="job-paydue" hint={client?.paymentTermsDays ? tx(`預設 ${client.paymentTermsDays} 天`, `Default net ${client.paymentTermsDays}`) : undefined}>
                <Input id="job-paydue" type="date" value={d.paymentDueAt ?? ''} onChange={(e) => set({ paymentDueAt: e.target.value || undefined })} />
              </Field>
            )}
          </div>
        </Block>

        <Block
          title={tx('扣繳與手續費', 'Deductions & fees')}
          aside={
            suggestion && (suggestion.withholding || suggestion.nhi) ? (
              <Button size="sm" variant="ghost" icon={<Calculator size={14} />} onClick={() => set({ withholding: suggestion.withholding || undefined, nhi: suggestion.nhi || undefined })}>
                {tx('依規則試算', 'Apply rules')}
              </Button>
            ) : undefined
          }
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label={tx('扣繳稅額', 'Tax withheld')} htmlFor="job-wh">
              <NumberInput id="job-wh" value={d.withholding} onChange={(v) => set({ withholding: v })} placeholder="0" />
            </Field>
            <Field label={tx('二代健保', 'NHI premium')} htmlFor="job-nhi">
              <NumberInput id="job-nhi" value={d.nhi} onChange={(v) => set({ nhi: v })} placeholder="0" />
            </Field>
            <Field label={tx('手續費', 'Fees')} htmlFor="job-fees" hint={tx('匯費、平台抽成', 'Bank, PayPal, platform')}>
              <NumberInput id="job-fees" value={d.fees} onChange={(v) => set({ fees: v })} placeholder="0" />
            </Field>
            {settings.tax.region === 'TW' && (
              <Field label={tx('所得類別', 'Income type')} htmlFor="job-cat">
                <Select id="job-cat" value={d.incomeCategory ?? '9B'} onChange={(e) => set({ incomeCategory: e.target.value as Job['incomeCategory'] })}>
                  <option value="9B">9B {tx('稿費', 'Royalties')}</option>
                  <option value="9A">9A {tx('執行業務', 'Professional')}</option>
                  <option value="50">50 {tx('薪資', 'Salary')}</option>
                  <option value="none">{tx('不適用', 'N/A')}</option>
                </Select>
              </Field>
            )}
          </div>
          {(d.withholding || d.nhi || d.fees) && (
            <div className="mt-2 text-[13px] text-muted">
              {tx('實收', 'Net received')} <span className="font-semibold text-ink tnum">{money(jobNet(d), d.currency)}</span>
            </div>
          )}
        </Block>

        <Block title={tx('履歷與作品集', 'Résumé & portfolio')}>
          <div className="flex flex-col gap-2">
            <Toggle checked={!!d.featured} onChange={(v) => set({ featured: v })} label={tx('列為代表作', 'Feature on my résumé')} description={tx('履歷產生器會優先放入這個案件', 'The résumé builder lists this job first')} />
            <Toggle checked={!!d.confidential} onChange={(v) => set({ confidential: v })} label={tx('保密案件', 'Confidential')} description={tx('對外只顯示領域與規模，不顯示原標題', 'Show only the field and size, never the real title')} />
            {(d.confidential || d.featured) && (
              <Field label={tx('對外顯示名稱（選填）', 'Public title (optional)')} htmlFor="job-public">
                <Input id="job-public" value={d.publicTitle ?? ''} onChange={(e) => set({ publicTitle: e.target.value || undefined })} placeholder={tx('例如：國際醫療器材大廠使用手冊', 'e.g. User manual for a global medical-device maker')} />
              </Field>
            )}
          </div>
        </Block>

        <Block title={tx('備註', 'Notes')}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="PO" htmlFor="job-po">
              <Input id="job-po" value={d.poNumber ?? ''} onChange={(e) => set({ poNumber: e.target.value || undefined })} />
            </Field>
            <Field label={tx('備註', 'Notes')} className="sm:col-span-2" htmlFor="job-notes">
              <Textarea id="job-notes" rows={2} value={d.notes ?? ''} onChange={(e) => set({ notes: e.target.value || undefined })} placeholder={tx('術語表、窗口、特殊要求…', 'Glossary, contact, special instructions…')} />
            </Field>
          </div>
        </Block>
        <button type="submit" className={cx('hidden')} aria-hidden tabIndex={-1} />
      </form>
    </Sheet>
  );
}
