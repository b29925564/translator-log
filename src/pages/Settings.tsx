import { Bot, CalendarPlus, Download, FileSpreadsheet, RefreshCw, Smartphone, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useData } from '../db/data';
import { clearDemo, exportBackup, hasDemo, importBackup, loadDemo, updateSettings, wipeAll, type BackupFile } from '../db/repo';
import { db } from '../db/db';
import { BUILTIN_DOMAINS, CURRENCIES } from '../domain/constants';
import { buildICS } from '../domain/ics';
import { fxRate } from '../domain/money';
import type { Settings } from '../domain/types';
import { getLang, tx } from '../i18n';
import { aiAvailable, saveAIKey, testAIKey, useAI } from '../ai/claude';
import { num } from '../ui/format';
import { Button, cx, Field, Input, Kbd, NumberInput, PageHeader, Segmented, Select, Textarea } from '../ui/kit';
import { useUI } from '../ui/store';
import { CurrencySelect, LangSelect } from '../features/common';
import { downloadFile } from '../features/download';
import { fetchRates } from '../features/fx';
import { platform, useInstall } from '../features/install';
import { SyncSettings } from '../sync/SyncSettings';
import { changeBus } from '../db/repo';

const SECTIONS = () => [
  { id: 'profile', label: tx('個人資料', 'Profile') },
  { id: 'prefs', label: tx('偏好', 'Preferences') },
  { id: 'goals', label: tx('目標與節奏', 'Goals & pace') },
  { id: 'sync', label: tx('同步', 'Sync') },
  { id: 'data', label: tx('備份與匯入', 'Backup & import') },
  { id: 'fx', label: tx('匯率', 'Exchange rates') },
  { id: 'tax', label: tx('稅務', 'Tax') },
  { id: 'ai', label: tx('AI 助理', 'AI assistant') },
  { id: 'install', label: tx('安裝 App', 'Install') },
  { id: 'about', label: tx('關於', 'About') },
];

function Card({ id, title, desc, children }: { id: string; title: string; desc?: ReactNode; children: ReactNode }) {
  return (
    <section id={`s-${id}`} className="card scroll-mt-6 p-5 sm:p-6">
      <h2 className="text-[16px] font-semibold text-ink">{title}</h2>
      {desc && <p className="mt-1 text-[13px] leading-relaxed text-muted">{desc}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Text field that saves on blur so typing never fights the live query. */
function LazyInput({ value, onSave, ...rest }: { value: string | undefined; onSave: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => setV(value ?? ''), [value]);
  return <Input value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== (value ?? '') && onSave(v)} {...rest} />;
}

function LazyNumber({ value, onSave, ...rest }: { value: number | undefined; onSave: (v: number | undefined) => void; suffix?: ReactNode; id?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return <NumberInput value={v} onChange={setV} onBlur={() => v !== value && onSave(v)} {...rest} />;
}

export function SettingsPage({ section }: { section?: string }) {
  const { settings, jobs, clientMap, today } = useData();
  const { toast, ask, navigate } = useUI();
  const [demo, setDemo] = useState(false);
  const [fxBusy, setFxBusy] = useState(false);
  const [aiKey, setAiKey] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const aiState = useAI();
  const install = useInstall();
  const fileRef = useRef<HTMLInputElement>(null);
  const s = settings;
  const p = s.profile;
  const en = getLang() === 'en';

  useEffect(() => {
    void hasDemo().then(setDemo);
  }, [jobs.length]);

  useEffect(() => {
    if (!section) return;
    const t = setTimeout(() => document.getElementById(`s-${section}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    return () => clearTimeout(t);
  }, [section]);

  const set = (patch: Partial<Settings>) => void updateSettings(patch);
  const setProfile = (patch: Partial<Settings['profile']>) => set({ profile: { ...p, ...patch } });

  const changeBase = async (next: string) => {
    if (next === s.baseCurrency) return;
    const ok = await ask({
      title: tx(`把記帳幣別改為 ${next}？`, `Switch home currency to ${next}?`),
      body: tx('所有案件會依原本鎖定的匯率比例重新換算，圖表與統計改以新幣別顯示。', 'Every job is re-converted using its locked-in rate, and charts switch to the new currency.'),
      confirm: tx('改變幣別', 'Switch'),
    });
    if (!ok) return;
    const factor = fxRate(s.baseCurrency, next, s.fx.rates);
    const all = await db.jobs.toArray();
    const t = Date.now();
    await db.jobs.bulkPut(all.map((j) => ({ ...j, fxToBase: j.currency === next ? 1 : Math.round((j.fxToBase || 1) * factor * 1e6) / 1e6, updatedAt: t })));
    await updateSettings({ baseCurrency: next });
    changeBus.dispatchEvent(new Event('change'));
    toast(tx('已切換記帳幣別', 'Home currency switched'));
  };

  const refreshFx = async () => {
    setFxBusy(true);
    try {
      const r = await fetchRates();
      await updateSettings({ fx: { rates: { ...s.fx.rates, ...r.rates }, base: 'USD', updatedAt: Date.now(), source: r.source } });
      toast(tx('匯率已更新', 'Rates updated'));
    } catch {
      toast(tx('無法取得最新匯率，請稍後再試', 'Could not fetch rates. Try again later'));
    } finally {
      setFxBusy(false);
    }
  };

  const exportJSON = async () => {
    const b = await exportBackup();
    await downloadFile(`wordtrail-backup-${today}.json`, JSON.stringify(b), 'application/json');
  };

  const importJSON = async (f: File) => {
    try {
      const data = JSON.parse(await f.text()) as BackupFile;
      const merge = await ask({
        title: tx('合併匯入這份備份？', 'Merge this backup?'),
        body: tx('每筆紀錄會保留兩邊較新的版本，現有資料不會遺失。', 'Each record keeps its newest version; nothing on this device is lost.'),
        confirm: tx('合併匯入', 'Merge'),
        cancel: tx('其他方式', 'Other options'),
      });
      if (!merge) {
        const replace = await ask({
          title: tx('改用備份取代這台裝置的資料？', 'Replace this device’s data with the backup?'),
          body: tx('這台裝置目前的資料會先被清空，無法復原。', 'Everything on this device is erased first. This cannot be undone.'),
          confirm: tx('清空並取代', 'Erase and replace'),
          danger: true,
        });
        if (!replace) return;
        await importBackup(data, 'replace');
      } else await importBackup(data, 'merge');
      toast(tx(`已匯入 ${data.data.jobs.length} 個案件`, `Imported ${data.data.jobs.length} jobs`));
    } catch {
      toast(tx('這不是譯跡的備份檔', 'That is not a Wordtrail backup file'));
    }
  };

  const exportICS = () => {
    const active = jobs.filter((j) => (j.status === 'active' || j.status === 'quote') && j.dueAt);
    if (!active.length) return toast(tx('目前沒有有截止日的案件', 'No upcoming deadlines'));
    void downloadFile(
      `wordtrail-deadlines-${today}.ics`,
      buildICS(active.map((j) => ({ uid: j.id, title: tx(`交稿：${j.title}`, `Due: ${j.title}`), when: j.dueAt!, description: j.clientId ? clientMap.get(j.clientId)?.name : undefined }))),
      'text/calendar',
    );
  };

  const plat = typeof navigator !== 'undefined' ? platform() : 'desktop';
  const workdayNames = [1, 2, 3, 4, 5, 6, 0].map((d) => ({ d, label: new Intl.DateTimeFormat(en ? 'en-US' : 'zh-TW', { weekday: 'short' }).format(new Date(2026, 0, 4 + d)) }));

  return (
    <div>
      <PageHeader title={tx('設定', 'Settings')} />
      <nav className="scroll-x -mx-4 mb-5 flex gap-2 px-4 sm:mx-0 sm:flex-wrap sm:px-0" aria-label={tx('設定分類', 'Settings sections')}>
        {SECTIONS().map((x) => (
          <button key={x.id} type="button" className="chip" aria-pressed={section === x.id} onClick={() => navigate('/settings/' + x.id, { replace: true })}>
            {x.label}
          </button>
        ))}
      </nav>

      <div className="flex max-w-[860px] flex-col gap-4">
        <Card id="profile" title={tx('個人資料', 'Profile')} desc={tx('出現在請款單、履歷與年度回顧。', 'Used on invoices, your résumé and your year in review.')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={tx('中文姓名', 'Name')} htmlFor="p-name">
              <LazyInput id="p-name" value={p.name} onSave={(v) => setProfile({ name: v })} />
            </Field>
            <Field label={tx('英文姓名', 'Name in English')} htmlFor="p-name-en">
              <LazyInput id="p-name-en" value={p.nameEn} onSave={(v) => setProfile({ nameEn: v || undefined })} />
            </Field>
            <Field label={tx('職稱', 'Title')} htmlFor="p-title">
              <LazyInput id="p-title" value={p.title} onSave={(v) => setProfile({ title: v || undefined })} placeholder={tx('英日譯中自由譯者', 'EN/JA>ZH freelance translator')} />
            </Field>
            <Field label={tx('開始接案年份', 'Freelancing since')} htmlFor="p-since">
              <LazyNumber id="p-since" value={p.since} onSave={(v) => setProfile({ since: v })} />
            </Field>
            <Field label="Email" htmlFor="p-email">
              <LazyInput id="p-email" type="email" value={p.email} onSave={(v) => setProfile({ email: v || undefined })} />
            </Field>
            <Field label={tx('電話', 'Phone')} htmlFor="p-phone">
              <LazyInput id="p-phone" value={p.phone} onSave={(v) => setProfile({ phone: v || undefined })} />
            </Field>
            <Field label={tx('網站／作品集', 'Website')} htmlFor="p-web">
              <LazyInput id="p-web" value={p.website} onSave={(v) => setProfile({ website: v || undefined })} />
            </Field>
            <Field label={tx('身分證字號／統編（請款單用）', 'Tax ID (for invoices)')} htmlFor="p-tax">
              <LazyInput id="p-tax" value={p.taxId} onSave={(v) => setProfile({ taxId: v || undefined })} />
            </Field>
            <Field label={tx('地址', 'Address')} className="sm:col-span-2" htmlFor="p-addr">
              <LazyInput id="p-addr" value={p.address} onSave={(v) => setProfile({ address: v || undefined })} />
            </Field>
            <Field label={tx('匯款資訊（印在請款單上）', 'Payment details (printed on invoices)')} className="sm:col-span-2" htmlFor="p-bank">
              <Textarea id="p-bank" rows={2} defaultValue={p.bank} onBlur={(e) => e.target.value !== (p.bank ?? '') && setProfile({ bank: e.target.value || undefined })} placeholder={tx('銀行、分行、帳號、戶名／PayPal／Wise', 'Bank, branch, account, name / PayPal / Wise')} />
            </Field>
          </div>
        </Card>

        <Card id="prefs" title={tx('偏好', 'Preferences')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={tx('介面語言', 'Language')}>
              <Segmented value={s.lang} onChange={(v) => set({ lang: v })} options={[{ value: 'zh-TW', label: '繁體中文' }, { value: 'en', label: 'English' }]} />
            </Field>
            <Field label={tx('外觀', 'Appearance')}>
              <Segmented value={s.theme} onChange={(v) => set({ theme: v })} options={[{ value: 'system', label: tx('跟隨系統', 'System') }, { value: 'light', label: tx('淺色', 'Light') }, { value: 'dark', label: tx('深色', 'Dark') }]} />
            </Field>
            <Field label={tx('記帳幣別', 'Home currency')} htmlFor="pref-cur">
              <CurrencySelect id="pref-cur" value={s.baseCurrency} onChange={(v) => void changeBase(v)} />
            </Field>
            <Field label={tx('報稅地區', 'Tax region')} htmlFor="pref-region">
              <Select id="pref-region" value={s.tax.region} onChange={(e) => set({ tax: { ...s.tax, region: e.target.value as 'TW' | 'other' } })}>
                <option value="TW">{tx('台灣', 'Taiwan')}</option>
                <option value="other">{tx('其他', 'Other')}</option>
              </Select>
            </Field>
            <Field label={tx('預設原文', 'Default source language')} htmlFor="pref-src">
              <LangSelect id="pref-src" value={s.defaultSourceLang} onChange={(v) => set({ defaultSourceLang: v })} />
            </Field>
            <Field label={tx('預設譯文', 'Default target language')} htmlFor="pref-tgt">
              <LangSelect id="pref-tgt" value={s.defaultTargetLang} onChange={(v) => set({ defaultTargetLang: v })} />
            </Field>
            <Field label={tx('自訂領域（以逗號分隔）', 'Custom fields (comma separated)')} className="sm:col-span-2" htmlFor="pref-domains" hint={tx(`內建：${BUILTIN_DOMAINS.map((d) => d.zh).join('、')}`, `Built in: ${BUILTIN_DOMAINS.map((d) => d.en).join(', ')}`)}>
              <LazyInput id="pref-domains" value={s.domains.join(', ')} onSave={(v) => set({ domains: v.split(/[,，、]/).map((x) => x.trim()).filter(Boolean) })} placeholder={tx('例如：半導體, 精品酒', 'e.g. Semiconductors, Wine')} />
            </Field>
          </div>
        </Card>

        <Card id="goals" title={tx('目標與節奏', 'Goals & pace')} desc={tx('用來計算年度進度、工作負荷與接案評估。', 'Used for yearly progress, workload and quote checks.')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={tx(`年度收入目標（${s.baseCurrency}）`, `Yearly income goal (${s.baseCurrency})`)} htmlFor="g-inc">
              <LazyNumber id="g-inc" value={s.goals.yearIncome} onSave={(v) => set({ goals: { ...s.goals, yearIncome: v } })} />
            </Field>
            <Field label={tx('年度字數目標', 'Yearly word goal')} htmlFor="g-words">
              <LazyNumber id="g-words" value={s.goals.yearWords} onSave={(v) => set({ goals: { ...s.goals, yearWords: v } })} />
            </Field>
            <Field label={tx('每天可工作時數', 'Hours per working day')} htmlFor="g-hours">
              <LazyNumber id="g-hours" value={s.work.hoursPerDay} onSave={(v) => set({ work: { ...s.work, hoursPerDay: v ?? 6 } })} suffix={tx('小時', 'h')} />
            </Field>
            <Field label={tx('預設翻譯速度', 'Default speed')} hint={tx('有計時資料後會改用你的實測速度', 'Replaced by your measured speed once you use the timer')} htmlFor="g-wph">
              <LazyNumber id="g-wph" value={s.work.wordsPerHour} onSave={(v) => set({ work: { ...s.work, wordsPerHour: v ?? 450 } })} suffix={tx('字/時', 'w/h')} />
            </Field>
            <Field label={tx('工作日', 'Working days')} className="sm:col-span-2">
              <div className="flex flex-wrap gap-1.5">
                {workdayNames.map(({ d, label }) => (
                  <button
                    key={d}
                    type="button"
                    className="chip"
                    aria-pressed={s.work.workDays.includes(d)}
                    onClick={() => set({ work: { ...s.work, workDays: s.work.workDays.includes(d) ? s.work.workDays.filter((x) => x !== d) : [...s.work.workDays, d].sort() } })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        </Card>

        <Card id="sync" title={tx('手機與電腦同步', 'Sync between devices')}>
          <SyncSettings />
        </Card>

        <Card id="data" title={tx('備份與匯入', 'Backup & import')} desc={tx('資料完全屬於你：隨時匯出，也能從舊的試算表匯入多年紀錄。', 'Your data is yours: export any time, and bring in years of records from an old spreadsheet.')}>
          <div className="flex flex-wrap gap-2">
            <Button icon={<Download size={15} />} onClick={() => void exportJSON()}>
              {tx('匯出完整備份', 'Export full backup')}
            </Button>
            <Button icon={<Upload size={15} />} onClick={() => fileRef.current?.click()}>
              {tx('從備份還原', 'Restore a backup')}
            </Button>
            <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => e.target.files?.[0] && void importJSON(e.target.files[0])} />
            <Button icon={<FileSpreadsheet size={15} />} onClick={() => useUI.getState().openReportImport()}>
              {tx('匯入報表或試算表', 'Import a report or spreadsheet')}
            </Button>
            <Button icon={<CalendarPlus size={15} />} onClick={exportICS}>
              {tx('截止日匯出到行事曆', 'Export deadlines to calendar')}
            </Button>
          </div>
          <div className="mt-5 border-t border-line pt-4">
            <div className="text-[13.5px] font-medium text-ink">{tx('示範資料', 'Sample data')}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {demo ? (
                <Button
                  variant="danger"
                  icon={<Trash2 size={15} />}
                  onClick={async () => {
                    const ok = await ask({ title: tx('清除所有示範資料？', 'Clear all sample data?'), body: tx('你自己建立的案件與客戶不受影響。', 'Jobs and clients you created yourself are kept.'), confirm: tx('清除', 'Clear'), danger: true });
                    if (ok) {
                      await clearDemo();
                      toast(tx('已清除示範資料', 'Sample data cleared'));
                    }
                  }}
                >
                  {tx('清除示範資料', 'Clear sample data')}
                </Button>
              ) : (
                <Button onClick={() => void loadDemo().then(() => toast(tx('已載入示範資料', 'Sample data loaded')))}>{tx('載入示範資料', 'Load sample data')}</Button>
              )}
              <Button
                variant="ghost"
                className="text-bad"
                onClick={async () => {
                  const ok = await ask({ title: tx('清空這台裝置的所有資料？', 'Erase everything on this device?'), body: tx('無法復原。若已開啟同步，雲端資料不會被刪除。', 'This cannot be undone. The cloud copy (if syncing) is not deleted.'), confirm: tx('全部清空', 'Erase'), danger: true });
                  if (ok) {
                    await wipeAll();
                    location.hash = '#/';
                    location.reload();
                  }
                }}
              >
                {tx('清空所有資料', 'Erase all data')}
              </Button>
            </div>
          </div>
        </Card>

        <Card id="fx" title={tx('匯率', 'Exchange rates')} desc={tx('每個案件建立時會鎖定當下匯率，之後匯率變動不會改寫過去的收入。', 'Each job locks in the rate when it is created, so later swings never rewrite past income.')}>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <Button size="sm" icon={<RefreshCw size={14} className={fxBusy ? 'animate-spin' : ''} />} disabled={fxBusy || __DEMO_BUILD__} onClick={() => void refreshFx()}>
              {tx('更新最新匯率', 'Fetch latest rates')}
            </Button>
            <span className="text-[12.5px] text-muted">{s.fx.updatedAt ? tx(`更新於 ${new Date(s.fx.updatedAt).toLocaleDateString('zh-TW')}`, `Updated ${new Date(s.fx.updatedAt).toLocaleDateString('en-US')}`) : tx('目前使用內建參考匯率', 'Using built-in reference rates')}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
            {CURRENCIES.filter((c) => c.code !== s.baseCurrency).map((c) => (
              <div key={c.code} className="flex items-center justify-between gap-2 text-[13.5px]">
                <span className="font-mono text-ink-2">1 {c.code}</span>
                <span className="text-ink tnum">
                  {num(fxRate(c.code, s.baseCurrency, s.fx.rates), 4)} {s.baseCurrency}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {s.tax.region === 'TW' && (
          <Card id="tax" title={tx('稅務參數（台灣）', 'Tax parameters (Taiwan)')} desc={tx('預設值依現行常見規定：單次給付超過 2 萬元扣繳 10%、達 2 萬元收取 2.11% 補充保費、稿費每年 18 萬元免稅。法規變動時可自行調整。', 'Defaults follow current common rules: 10% withholding above NT$20,000 per payment, a 2.11% NHI premium from NT$20,000, and NT$180,000 of royalty income tax-free each year.')}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={tx('扣繳率', 'Withholding rate')}>
                <LazyNumber value={s.tax.withholdingRate * 100} onSave={(v) => set({ tax: { ...s.tax, withholdingRate: (v ?? 10) / 100 } })} suffix="%" />
              </Field>
              <Field label={tx('扣繳門檻（超過）', 'Withholding above')}>
                <LazyNumber value={s.tax.withholdingThreshold} onSave={(v) => set({ tax: { ...s.tax, withholdingThreshold: v ?? 20000 } })} />
              </Field>
              <Field label={tx('補充保費率', 'NHI premium rate')}>
                <LazyNumber value={Math.round(s.tax.nhiRate * 10000) / 100} onSave={(v) => set({ tax: { ...s.tax, nhiRate: (v ?? 2.11) / 100 } })} suffix="%" />
              </Field>
              <Field label={tx('補充保費門檻（達）', 'NHI from')}>
                <LazyNumber value={s.tax.nhiThreshold} onSave={(v) => set({ tax: { ...s.tax, nhiThreshold: v ?? 20000 } })} />
              </Field>
              <Field label={tx('稿費免稅額', '9B exemption')}>
                <LazyNumber value={s.tax.exemption9B} onSave={(v) => set({ tax: { ...s.tax, exemption9B: v ?? 180000 } })} />
              </Field>
              <Field label={tx('稿費必要費用率', '9B expense rate')}>
                <LazyNumber value={s.tax.expenseRate9B * 100} onSave={(v) => set({ tax: { ...s.tax, expenseRate9B: (v ?? 30) / 100 } })} suffix="%" />
              </Field>
            </div>
          </Card>
        )}

        <Card id="ai" title={tx('AI 助理（選用）', 'AI assistant (optional)')} desc={tx('加入你自己的 Claude API 金鑰，就能把整封客戶來信貼進「新增案件」自動擷取欄位，或請 Claude 潤飾履歷。金鑰只存在這台裝置，不會同步或匯出。', 'Add your own Claude API key to paste whole client emails into “New job” and have fields extracted, or to polish your résumé. The key stays on this device and is never synced or exported.')}>
          {__DEMO_BUILD__ ? (
            <p className="text-[13.5px] text-muted">{tx('示範版不提供 AI 功能。', 'AI features are off in the preview.')}</p>
          ) : aiAvailable() ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 text-[14px] text-ink">
                <Bot size={16} className="text-accent" /> {tx('已設定金鑰', 'Key saved')} <span className="font-mono text-muted">…{aiState.key?.slice(-4)}</span>
              </span>
              <Button
                size="sm"
                disabled={aiBusy}
                onClick={async () => {
                  setAiBusy(true);
                  try {
                    await testAIKey();
                    toast(tx('連線成功', 'Connection works'));
                  } catch (e) {
                    toast((e as Error).message);
                  } finally {
                    setAiBusy(false);
                  }
                }}
              >
                {tx('測試連線', 'Test')}
              </Button>
              <Button size="sm" variant="ghost" className="text-bad" onClick={() => void saveAIKey(undefined)}>
                {tx('移除金鑰', 'Remove key')}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input type="password" autoComplete="off" value={aiKey} onChange={(e) => setAiKey(e.target.value)} placeholder="sk-ant-…" className="font-mono" aria-label="Claude API key" />
              <Button variant="primary" disabled={!aiKey.trim()} onClick={() => void saveAIKey(aiKey).then(() => setAiKey(''))}>
                {tx('儲存', 'Save')}
              </Button>
            </div>
          )}
          {!__DEMO_BUILD__ && (
            <p className="mt-2 text-[12px] text-muted">
              {tx('在 ', 'Get a key at ')}
              <a className="text-accent underline" href="https://platform.claude.com/" target="_blank" rel="noreferrer">
                platform.claude.com
              </a>
              {tx(' 取得金鑰。費用直接由你的 Anthropic 帳戶計費。', '. Usage is billed to your own Anthropic account.')}
            </p>
          )}
        </Card>

        <Card id="install" title={tx('安裝到手機與電腦', 'Install on phone and computer')} desc={tx('譯跡是可安裝的網頁 App：離線也能用，桌面與主畫面都有圖示。', 'Wordtrail is an installable web app: it works offline and gets its own icon.')}>
          {install.installed ? (
            <p className="text-[14px] text-good">{tx('已安裝為 App ✓', 'Installed as an app ✓')}</p>
          ) : install.prompt ? (
            <Button variant="primary" icon={<Smartphone size={16} />} onClick={() => void install.prompt!.prompt()}>
              {tx('安裝譯跡', 'Install Wordtrail')}
            </Button>
          ) : null}
          <ul className="mt-3 grid gap-3 text-[13.5px] leading-relaxed text-ink-2 sm:grid-cols-3">
            <li className={cx('rounded-xl border p-3', plat === 'ios' ? 'border-accent' : 'border-line')}>
              <b className="text-ink">iPhone／iPad</b>
              <br />
              {tx('用 Safari 開啟 → 分享按鈕 → 加入主畫面', 'Open in Safari → Share → Add to Home Screen')}
            </li>
            <li className={cx('rounded-xl border p-3', plat === 'android' ? 'border-accent' : 'border-line')}>
              <b className="text-ink">Android</b>
              <br />
              {tx('用 Chrome 開啟 → 選單 → 安裝應用程式', 'Open in Chrome → menu → Install app')}
            </li>
            <li className={cx('rounded-xl border p-3', plat === 'desktop' ? 'border-accent' : 'border-line')}>
              <b className="text-ink">Mac／Windows</b>
              <br />
              {tx('Chrome 或 Edge 網址列右側的「安裝」圖示', 'Click the install icon at the right of the address bar in Chrome or Edge')}
            </li>
          </ul>
        </Card>

        <Card id="about" title={tx('關於譯跡', 'About Wordtrail')}>
          <div className="grid gap-4 text-[13.5px] leading-relaxed text-ink-2 sm:grid-cols-2">
            <div>
              <p>{tx('為自由譯者設計的工作紀錄 App。所有資料預設只存在你的裝置；開啟同步後以端對端加密存在你自己的 GitHub。沒有追蹤、沒有廣告、沒有伺服器。', 'A work log designed for freelance translators. Data lives on your device by default; with sync it is end-to-end encrypted in your own GitHub account. No tracking, no ads, no servers.')}</p>
              <p className="mt-2 font-mono text-[12px] text-muted">v{__APP_VERSION__}</p>
            </div>
            <div>
              <div className="mb-1.5 font-medium text-ink">{tx('鍵盤快捷鍵', 'Keyboard shortcuts')}</div>
              <ul className="flex flex-col gap-1.5">
                {[
                  ['N', tx('新增案件', 'New job')],
                  ['⌘K / /', tx('搜尋與指令', 'Search & commands')],
                  ['G → D', tx('總覽', 'Overview')],
                  ['G → J', tx('案件', 'Jobs')],
                  ['G → M', tx('收款', 'Payments')],
                  ['G → I', tx('洞察', 'Insights')],
                ].map(([k, l]) => (
                  <li key={k} className="flex items-center justify-between gap-3">
                    <span>{l}</span>
                    <Kbd>{k}</Kbd>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
