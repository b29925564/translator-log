import { ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { useData } from '../db/data';
import { loadDemo, updateSettings } from '../db/repo';
import { DEFAULT_SETTINGS } from '../domain/constants';
import type { Lang } from '../domain/types';
import { setLang, tx } from '../i18n';
import { Button, Field, Input, Segmented } from '../ui/kit';
import { useUI } from '../ui/store';
import { CurrencySelect } from '../features/common';
import { BRAND_GOLD, BRAND_NAME, BRAND_TAGLINE, BRAND_ZH, BrandName, WGlyph } from '../app/Logo';
import { SunburstRays } from '../app/Stamps';

export function Onboarding() {
  const { settings } = useData();
  const navigate = useUI((s) => s.navigate);
  // first visit: follow the browser language (Chinese → 繁體中文, anything else → English)
  const [lang, setL] = useState<Lang>(() => {
    try {
      return /^zh/i.test(navigator.language) ? 'zh-TW' : 'en';
    } catch {
      return settings.lang;
    }
  });
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState(settings.baseCurrency);
  const [busy, setBusy] = useState(false);
  setLang(lang);

  const start = async (demo: boolean) => {
    setBusy(true);
    await updateSettings({
      lang,
      baseCurrency: currency,
      profile: { ...settings.profile, name: name.trim() },
      tax: { ...DEFAULT_SETTINGS.tax, region: currency === 'TWD' ? 'TW' : 'other' },
      onboarded: true,
    });
    if (demo) await loadDemo();
    setBusy(false);
  };

  const features = [
    { k: tx('記錄', 'Log'), title: tx('一句話記下案件', 'One sentence per job'), body: tx('客戶、語言、字數、費率、截止日，一次到位。', 'Client, languages, volume, rate and deadline in one go.') },
    { k: tx('收款', 'Get paid'), title: tx('收款與報稅一目了然', 'Payments and taxes, sorted'), body: tx('多幣別、帳齡、請款單、扣繳與二代健保。', 'Multi-currency, aging, invoices and withholding.') },
    { k: tx('判斷', 'Decide'), title: tx('接案前就知道值不值得', 'Know if a job is worth it'), body: tx('費率落點、真實時薪、排不排得進去。', 'Rate percentile, real hourly rate, schedule fit.') },
    { k: tx('成果', 'Show'), title: tx('履歷與年度回顧', 'Résumé and year in review'), body: tx('每一筆紀錄都在替你寫履歷。', 'Every entry quietly writes your CV.') },
  ];

  return (
    <div key={lang} className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr] lg:grid-rows-[auto_1fr]">
      {/* poster */}
      <section className="on-ink relative order-1 overflow-hidden px-6 pb-12 pt-8 text-ink sm:px-10 lg:col-start-1 lg:row-start-1 lg:px-14 lg:pt-12" style={{ background: '#0b0b0c' }}>
        <SunburstRays origin="bottom-right" count={28} opacity={0.22} color={BRAND_GOLD} />
        <div className="relative flex items-center gap-3">
          <WGlyph size={34} color={BRAND_GOLD} />
          <span className="leading-none">
            <BrandName gold={BRAND_GOLD} className="font-wide block text-[12.5px] tracking-[0.26em]" />
            <span className="mt-1 block text-[10.5px] tracking-[0.42em] text-muted">
              {BRAND_ZH}
              <span className="ml-2 hidden tracking-[0.08em] sm:inline">· {BRAND_TAGLINE}</span>
            </span>
          </span>
        </div>
        <div className="relative mt-16 max-w-[560px] lg:mt-24">
          <div className="font-wide text-[11px] tracking-[0.3em]" style={{ color: BRAND_GOLD }}>
            {tx('給筆譯與口譯者的工作紀錄', 'A work log for translators & interpreters')}
          </div>
          <h1 className="font-display mt-5 text-[46px] leading-[1.02] sm:text-[64px] lg:text-[76px]">{tx('每一個字，都算數。', 'Every word counts.')}</h1>
          <p className="mt-6 max-w-[46ch] text-[16px] leading-relaxed text-ink-2">
            {tx('從接案、交稿、請款到入帳，順手留下的每一筆，都會變成收入分析、報稅數字、中英文履歷與年度回顧。', 'From inquiry to invoice to payment, every entry becomes income insight, tax figures, a bilingual CV and your year in review.')}
          </p>
        </div>
      </section>

      <section className="on-ink relative order-3 px-6 pb-12 pt-10 text-ink sm:px-10 lg:order-none lg:pt-0 lg:col-start-1 lg:row-start-2 lg:px-14" style={{ background: '#0b0b0c' }}>
        <ul className="grid gap-px overflow-hidden rounded-[3px] border border-line bg-line sm:grid-cols-2">
          {features.map((f) => (
            <li key={f.k} className="bg-[#0b0b0c] p-5">
              <div className="font-wide text-[10px] tracking-[0.26em]" style={{ color: BRAND_GOLD }}>
                {f.k}
              </div>
              <div className="mt-3 text-[15px] font-semibold">{f.title}</div>
              <div className="mt-1 text-[13px] leading-snug text-muted">{f.body}</div>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-[12px] text-muted">{tx('離線可用・資料只存在你的裝置・可端對端加密同步', 'Works offline · your data stays on your device · optional end-to-end encrypted sync')}</p>
      </section>

      {/* setup */}
      <section className="order-2 flex items-start px-6 py-10 sm:px-10 lg:order-none lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:items-center lg:px-16">
        <div className="page-enter w-full max-w-[420px]">
          <div className="eyebrow">{tx('開始之前', 'Before we start')}</div>
          <h2 className="font-display mt-3 text-[30px] leading-tight text-ink">{tx('三個小設定', 'Three quick choices')}</h2>
          <div className="rule-deco mt-5" />
          <div className="mt-6 flex flex-col gap-5">
            <Field label={tx('介面語言', 'Language')}>
              <Segmented
                value={lang}
                onChange={(v) => setL(v)}
                options={[
                  { value: 'zh-TW', label: '繁體中文' },
                  { value: 'en', label: 'English' },
                ]}
              />
            </Field>
            <Field label={tx('你的名字', 'Your name')} hint={tx('會出現在請款單與履歷上', 'Used on invoices and your résumé')} htmlFor="ob-name">
              <Input id="ob-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={tx('例如：林予安', 'e.g. Yu-An Lin')} autoComplete="name" />
            </Field>
            <Field label={tx('主要記帳幣別', 'Home currency')} hint={tx('外幣案件會自動換算成這個幣別', 'Foreign-currency jobs are converted into this')} htmlFor="ob-cur">
              <CurrencySelect id="ob-cur" value={currency} onChange={setCurrency} />
            </Field>
          </div>
          <div className="mt-8 flex flex-col gap-2">
            <Button variant="primary" size="lg" disabled={busy} onClick={() => void start(false)} className="justify-between">
              {tx('開始記錄', 'Start logging')}
              <ArrowRight size={18} />
            </Button>
            <Button variant="secondary" size="lg" disabled={busy} onClick={() => void start(true)} className="justify-between">
              {busy ? tx('載入中…', 'Loading…') : tx('先用示範資料逛逛', 'Explore with sample data')}
              <ArrowRight size={18} className="opacity-50" />
            </Button>
            {!__DEMO_BUILD__ && (
              <button
                type="button"
                className="mt-3 self-start text-[13px] font-medium text-ink underline decoration-gold underline-offset-4"
                onClick={async () => {
                  await start(false);
                  navigate('/settings/sync');
                }}
              >
                {tx(`我已經在其他裝置使用${BRAND_ZH}`, `I already use ${BRAND_NAME} on another device`)}
              </button>
            )}
          </div>
          <p className="mt-8 text-[12px] leading-relaxed text-muted">{tx('資料預設只存在這台裝置，不會上傳到任何伺服器。示範資料之後可以在設定中一鍵清除。', 'Your data stays on this device unless you turn on sync. Sample data can be cleared in Settings with one tap.')}</p>
        </div>
      </section>
    </div>
  );
}
