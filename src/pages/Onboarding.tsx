import { ArrowRight, CloudCog, FileClock, IdCard, Sparkles, Wallet } from 'lucide-react';
import { useState } from 'react';
import { useData } from '../db/data';
import { loadDemo, updateSettings } from '../db/repo';
import { DEFAULT_SETTINGS } from '../domain/constants';
import type { Lang } from '../domain/types';
import { setLang, tx } from '../i18n';
import { Button, Field, Input, Segmented } from '../ui/kit';
import { useUI } from '../ui/store';
import { CurrencySelect } from '../features/common';
import { LogoMark } from '../app/Logo';
import { RectStamp, RoundStamp } from '../app/Stamps';

export function Onboarding() {
  const { settings } = useData();
  const navigate = useUI((s) => s.navigate);
  const [lang, setL] = useState<Lang>(settings.lang);
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
    { icon: <Sparkles size={18} />, title: tx('一句話記下案件', 'Log a job in one sentence'), body: tx('「藍海翻譯社 說明書 英翻中 5000字 每字1.2 週五交」— 客戶、字數、費率、截止日一次到位。', '“Lumina app strings EN>ZH-TW 5k words $0.09/word due Fri” — client, volume, rate and deadline in one go.') },
    { icon: <Wallet size={18} />, title: tx('收款、扣繳、匯率一目了然', 'Payments, withholding and FX at a glance'), body: tx('多幣別自動換算，逾期款項、二代健保與報稅數字自動整理。', 'Multi-currency totals, overdue invoices, and tax figures organised for you.') },
    { icon: <FileClock size={18} />, title: tx('知道自己真正的時薪', 'Know your real hourly rate'), body: tx('內建計時器與工作負荷預測，接案前就知道排不排得進去。', 'A built-in timer and workload forecast tell you whether a job fits before you say yes.') },
    { icon: <IdCard size={18} />, title: tx('履歷與年度回顧，一鍵生成', 'Résumé and year in review, instantly'), body: tx('累積的每一筆紀錄，都會變成中英文履歷與可分享的年度成績單。', 'Every record becomes a bilingual CV section and a shareable year-in-review.') },
    { icon: <CloudCog size={18} />, title: tx('手機電腦同步，資料只屬於你', 'Phone and desktop in sync, data stays yours'), body: tx('離線可用；端對端加密，存在你自己的 GitHub 私人空間。', 'Works offline; end-to-end encrypted sync to your own private GitHub storage.') },
  ];

  return (
    <div key={lang} className="min-h-dvh px-4 py-8 sm:px-8 lg:py-14">
      <div className="mx-auto grid max-w-[1100px] items-start gap-x-10 gap-y-8 lg:grid-cols-[1.15fr_1fr]">
        <div className="page-enter">
          <div className="flex items-center gap-3">
            <LogoMark size={52} />
            <div>
              <div className="font-display text-[34px] leading-none text-ink">譯跡</div>
              <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.22em] text-muted">Wordtrail</div>
            </div>
          </div>
          <h1 className="font-display mt-8 max-w-[18ch] text-[38px] leading-[1.15] text-ink sm:text-[48px]">{tx('每一個字，都算數。', 'Every word counts.')}</h1>
          <p className="mt-4 max-w-[52ch] text-[16px] leading-relaxed text-ink-2">
            {tx('給自由譯者的工作紀錄本：從接案、交稿、請款到入帳，順手留下的每一筆，都在替你寫履歷。', 'A work log built for freelance translators. From inquiry to invoice to payment, every entry quietly writes your résumé.')}
          </p>
        </div>

        <div className="page-enter order-2 lg:order-none lg:col-start-1 lg:row-start-2">
          <div className="relative hidden h-[150px] sm:block" aria-hidden>
            <div className="absolute left-0 top-2">
              <RoundStamp top="EN → ZH-TW" center={tx('入境', 'ENTRY')} bottom="2021 · FREELANCE" color="var(--series-1)" rotate={-10} size={128} />
            </div>
            <div className="absolute left-[140px] top-8">
              <RectStamp title={tx('已收款', 'PAID')} sub="2026.09.25" rotate={7} />
            </div>
            <div className="absolute left-[310px] top-0">
              <RoundStamp top="1,000,000 WORDS" center={tx('百萬字', '1M')} bottom="MILESTONE" color="var(--accent)" rotate={12} size={124} />
            </div>
          </div>

          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {features.map((f) => (
              <li key={f.title} className="flex gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">{f.icon}</span>
                <span>
                  <span className="block text-[14.5px] font-semibold text-ink">{f.title}</span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-muted">{f.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <section className="card page-enter order-1 p-6 sm:p-7 lg:sticky lg:top-10 lg:order-none lg:col-start-2 lg:row-span-2 lg:row-start-1" style={{ boxShadow: 'var(--shadow)' }}>
          <h2 className="text-[18px] font-semibold text-ink">{tx('開始之前', 'Before we start')}</h2>
          <p className="mt-1 text-[13.5px] text-muted">{tx('三個小設定，之後都能在「設定」修改。', 'Three quick choices. You can change them later in Settings.')}</p>
          <div className="mt-5 flex flex-col gap-4">
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
          <div className="mt-6 flex flex-col gap-2">
            <Button variant="primary" size="lg" disabled={busy} onClick={() => void start(false)} icon={<ArrowRight size={18} />} className="flex-row-reverse">
              {tx('開始記錄', 'Start logging')}
            </Button>
            <Button variant="secondary" size="lg" disabled={busy} onClick={() => void start(true)}>
              {busy ? tx('載入中…', 'Loading…') : tx('先用示範資料逛逛', 'Explore with sample data')}
            </Button>
            {!__DEMO_BUILD__ && (
              <button
                type="button"
                className="mt-2 text-[13px] font-medium text-accent hover:underline"
                onClick={async () => {
                  await start(false);
                  navigate('/settings/sync');
                }}
              >
                {tx('我已經在其他裝置使用譯跡 →', 'I already use Wordtrail on another device →')}
              </button>
            )}
          </div>
          <p className="mt-5 text-[12px] leading-relaxed text-muted">{tx('資料預設只存在這台裝置，不會上傳到任何伺服器。示範資料之後可以在設定中一鍵清除。', 'Your data stays on this device unless you turn on sync. Sample data can be cleared in Settings with one tap.')}</p>
        </section>
      </div>
    </div>
  );
}
