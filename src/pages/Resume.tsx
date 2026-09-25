import { Copy, Download, Globe, Printer, Star, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useData } from '../db/data';
import { saveJob } from '../db/repo';
import { jobWords } from '../domain/money';
import { bigNumber, buildResume, resumeMarkdown, type ClientMode, type ResumeLang } from '../domain/resume';
import { incomeDate, isEarned, skylineMonths } from '../domain/stats';
import { buildPortfolio } from '../features/portfolio';
import { tx } from '../i18n';
import { aiAvailable, aiPolishResume } from '../ai/claude';
import { date, num } from '../ui/format';
import { Button, cx, Field, Pair, PageHeader, Segmented, Select, Sheet } from '../ui/kit';
import { useUI } from '../ui/store';
import { copyText, downloadFile, printPage } from '../features/download';

type Range = 'all' | '3y' | '5y' | 'custom';

export function Resume() {
  const { jobs, clients, settings, today, clientMap } = useData();
  const { toast, navigate } = useUI();
  const [lang, setLang] = useState<ResumeLang>(settings.lang === 'en' ? 'en' : 'zh');
  const [range, setRange] = useState<Range>('all');
  const [fromY, setFromY] = useState<string>('');
  const [toY, setToY] = useState<string>('');
  const [clientMode, setClientMode] = useState<ClientMode>('anonymous');
  const [count, setCount] = useState(6);
  const [view, setView] = useState<'card' | 'text'>('card');
  const [ai, setAi] = useState<{ busy: boolean; text?: string }>({ busy: false });

  const years = useMemo(() => [...new Set(jobs.filter(isEarned).map((j) => incomeDate(j).slice(0, 4)))].sort(), [jobs]);
  const y = Number(today.slice(0, 4));
  const from = range === '3y' ? `${y - 2}-01-01` : range === '5y' ? `${y - 4}-01-01` : range === 'custom' && fromY ? `${fromY}-01-01` : undefined;
  const to = range === 'custom' && toY ? `${toY}-12-31` : undefined;

  const r = useMemo(() => buildResume(jobs, clients, settings.profile, { lang, from, to, clientMode, projectCount: count }), [jobs, clients, settings.profile, lang, from, to, clientMode, count]);
  const md = useMemo(() => resumeMarkdown(r), [r]);
  const zh = lang === 'zh';
  const T = (a: string, b: string) => (zh ? a : b);

  const featuredPool = useMemo(
    () =>
      jobs
        .filter(isEarned)
        .sort((a, b) => Number(!!b.featured) - Number(!!a.featured) || jobWords(b) - jobWords(a))
        .slice(0, 24),
    [jobs],
  );

  const polish = async () => {
    setAi({ busy: true });
    try {
      const text = await aiPolishResume(md, lang, settings.profile.bio);
      setAi({ busy: false, text });
    } catch (e) {
      setAi({ busy: false });
      toast((e as Error).message);
    }
  };

  const maxDomain = Math.max(1, ...r.domains.map((d) => d.words));
  const [site, setSite] = useState(false);
  const siteHtml = useMemo(() => {
    if (!site) return '';
    const opts = { from, to, clientMode, projectCount: count };
    return buildPortfolio({
      zh: buildResume(jobs, clients, settings.profile, { ...opts, lang: 'zh' }),
      en: buildResume(jobs, clients, settings.profile, { ...opts, lang: 'en' }),
      profile: settings.profile,
      skyline: skylineMonths(jobs.filter((j) => j.status !== 'active'), today),
      defaultLang: lang,
    });
  }, [site, jobs, clients, settings.profile, from, to, clientMode, count, lang, today]);

  return (
    <div>
      <PageHeader
        eyebrow={tx('由你的紀錄自動生成', 'Generated from your log')}
        title={tx('履歷產生器', 'Résumé builder')}
        actions={
          <>
            <Button size="sm" variant="secondary" icon={<Globe size={15} />} onClick={() => setSite(true)}>
              {tx('個人網站', 'Portfolio site')}
            </Button>
            <Button size="sm" variant="ghost" icon={<Copy size={15} />} onClick={() => void copyText(ai.text ?? md)}>
              {tx('複製文字', 'Copy text')}
            </Button>
            <Button size="sm" variant="ghost" icon={<Download size={15} />} onClick={() => void downloadFile(`resume-${lang}-${today}.md`, ai.text ?? md, 'text/markdown')}>
              .md
            </Button>
            <Button size="sm" variant="primary" icon={<Printer size={15} />} onClick={printPage}>
              {tx('列印／PDF', 'Print / PDF')}
            </Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <aside className="no-print flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
          <section className="card flex flex-col gap-4 p-4">
            <Field label={tx('履歷語言', 'Language')}>
              <Segmented value={lang} onChange={(v) => { setLang(v); setAi({ busy: false }); }} options={[{ value: 'zh', label: '中文' }, { value: 'en', label: 'English' }]} />
            </Field>
            <Field label={tx('期間', 'Period')}>
              <Segmented size="sm" value={range} onChange={setRange} options={[{ value: 'all', label: tx('全部', 'All') }, { value: '5y', label: tx('近5年', '5 yrs') }, { value: '3y', label: tx('近3年', '3 yrs') }, { value: 'custom', label: tx('自訂', 'Custom') }]} />
              {range === 'custom' && (
                <div className="mt-2 flex items-center gap-2">
                  <Select className="input-sm" value={fromY} onChange={(e) => setFromY(e.target.value)} aria-label={tx('起始年', 'From')}>
                    <option value="">{tx('起', 'From')}</option>
                    {years.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </Select>
                  <span className="text-muted">–</span>
                  <Select className="input-sm" value={toY} onChange={(e) => setToY(e.target.value)} aria-label={tx('結束年', 'To')}>
                    <option value="">{tx('迄', 'To')}</option>
                    {years.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </Select>
                </div>
              )}
            </Field>
            <Field label={tx('客戶名稱', 'Client names')} hint={clientMode === 'anonymous' ? tx('以「國際醫療器材公司」等描述取代真名；可在客戶資料設定。', 'Replaced by descriptions like “global medical-device maker”, editable per client.') : undefined}>
              <Segmented size="sm" value={clientMode} onChange={setClientMode} options={[{ value: 'anonymous', label: tx('匿名', 'Anonymous') }, { value: 'named', label: tx('具名', 'Named') }, { value: 'hidden', label: tx('不顯示', 'Hidden') }]} />
            </Field>
            <Field label={tx('代表案例數', 'Selected projects')}>
              <Segmented size="sm" value={String(count)} onChange={(v) => setCount(Number(v))} options={['3', '6', '10'].map((v) => ({ value: v, label: v }))} />
            </Field>
            <Field label={tx('檢視', 'View')}>
              <Segmented size="sm" value={view} onChange={setView} options={[{ value: 'card', label: tx('履歷卡', 'Profile') }, { value: 'text', label: tx('純文字', 'Text') }]} />
            </Field>
            {aiAvailable() && (
              <Button variant="secondary" icon={<Wand2 size={15} />} onClick={() => void polish()} disabled={ai.busy}>
                {ai.busy ? tx('Claude 撰寫中…', 'Claude is writing…') : tx('請 Claude 潤飾成履歷段落', 'Have Claude polish it')}
              </Button>
            )}
            {!aiAvailable() && !__DEMO_BUILD__ && (
              <button type="button" className="text-left text-[12.5px] text-muted hover:text-ink" onClick={() => navigate('/settings/ai')}>
                {tx('想要 AI 潤飾？在設定加入 Claude API 金鑰 →', 'Want AI polishing? Add a Claude API key in Settings →')}
              </button>
            )}
          </section>
          {!settings.profile.name && (
            <p className="px-1 text-[12.5px] text-muted">
              {tx('提示：在「設定 → 個人資料」填入姓名與聯絡方式，履歷卡會更完整。', 'Tip: add your name and contact details in Settings → Profile.')}
            </p>
          )}
        </aside>

        <div className="min-w-0">
          {ai.text && (
            <section className="no-print card mb-4 border-accent p-5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="inline-flex items-center gap-2 text-[14px] font-semibold text-ink">
                  <Wand2 size={15} className="text-accent" /> {tx('Claude 潤飾版本', 'Polished by Claude')}
                </h2>
                <Button size="sm" variant="ghost" icon={<Copy size={14} />} onClick={() => void copyText(ai.text!)}>
                  {tx('複製', 'Copy')}
                </Button>
              </div>
              <pre className="whitespace-pre-wrap font-sans text-[14px] leading-relaxed text-ink-2">{ai.text}</pre>
            </section>
          )}

          {view === 'text' ? (
            <section className="card p-5">
              <pre className="whitespace-pre-wrap font-sans text-[14px] leading-relaxed text-ink">{md}</pre>
            </section>
          ) : (
            <article className="print-page mx-auto max-w-[820px] rounded-[4px] border border-line bg-white p-8 text-[#0b0b0c] sm:p-12" style={{ boxShadow: 'var(--shadow)', colorScheme: 'light' }}>
              <header className="pb-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="font-display text-[40px] leading-none">{r.name || T('你的名字', 'Your Name')}</h2>
                    {zh && settings.profile.nameEn && <div className="mt-1.5 text-[14px] tracking-wide text-[#51606d]">{settings.profile.nameEn}</div>}
                  </div>
                  <div className="text-right text-[12.5px] leading-relaxed text-[#51606d]">
                    {settings.profile.email && <div>{settings.profile.email}</div>}
                    {settings.profile.website && <div>{settings.profile.website}</div>}
                  </div>
                </div>
                <p className="mt-3 text-[15px] font-medium text-[#87672b]">{r.headline}</p>
              </header>
              <div className="h-[5px] border-y border-[#0b0b0c]" style={{ borderTopWidth: 2 }} />

              <section className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  { v: zh ? `${bigNumber(r.stats.words, 'zh')}` : bigNumber(r.stats.words, 'en'), l: T('累計字數', 'Words delivered'), u: zh ? '字' : '' },
                  { v: num(r.stats.jobs), l: T('完成案件', 'Projects'), u: zh ? '件' : '' },
                  { v: num(r.stats.clients), l: T('合作客戶', 'Clients'), u: zh ? '家' : '' },
                  { v: String(r.stats.years), l: T('自由譯者年資', 'Years freelancing'), u: zh ? '年' : '' },
                ].map((s) => (
                  <div key={s.l}>
                    <div className="text-[30px] font-medium leading-none tracking-[-0.03em]">
                      {s.v}
                      <span className="ml-0.5 text-[15px] font-medium text-[#51606d]">{s.u}</span>
                    </div>
                    <div className="mt-1.5 text-[11.5px] uppercase tracking-[0.1em] text-[#7a8793]">{s.l}</div>
                  </div>
                ))}
              </section>

              <p className="mt-6 text-[14.5px] leading-[1.8]">{r.summary}</p>

              <div className="mt-7 grid gap-8 sm:grid-cols-[1.3fr_1fr]">
                <section>
                  <h3 className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#7a8793]">{T('專業領域', 'Specialisations')}</h3>
                  <ul className="flex flex-col gap-2.5">
                    {r.domains.slice(0, 6).map((d) => (
                      <li key={d.label}>
                        <div className="flex justify-between text-[13.5px]">
                          <span>{d.label}</span>
                          <span className="text-[#51606d] tnum">{d.words ? (zh ? `${bigNumber(d.words, 'zh')}字` : `${bigNumber(d.words, 'en')} words`) : T(`${d.jobs} 件`, `${d.jobs} projects`)}</span>
                        </div>
                        <div className="mt-1.5 h-[3px] bg-[#e7e7e4]">
                          <div className="h-full bg-[#0b0b0c]" style={{ width: `${Math.max(3, (d.words / maxDomain) * 100)}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
                <section className="flex flex-col gap-5">
                  <div>
                    <h3 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#7a8793]">{T('語言組合', 'Language pairs')}</h3>
                    <ul className="text-[13.5px] leading-7">
                      {r.pairs.slice(0, 4).map((p) => (
                        <li key={p.label} className="flex justify-between gap-3">
                          <span>{p.label}</span>
                          <span className="text-[#51606d]">{Math.round(p.share * 100)}%</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {r.services.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#7a8793]">{T('服務項目', 'Services')}</h3>
                      <div className="flex flex-wrap gap-1.5">
                        {r.services.slice(0, 6).map((s) => (
                          <span key={s.label} className="rounded-[2px] border border-[#c9c9c4] px-2 py-0.5 text-[12px]">
                            {s.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.tools.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#7a8793]">{T('CAT 工具', 'CAT tools')}</h3>
                      <div className="flex flex-wrap gap-1.5">
                        {r.tools.slice(0, 6).map((s) => (
                          <span key={s} className="rounded-[2px] bg-[#ececea] px-2 py-0.5 font-mono text-[11.5px]">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              </div>

              {r.projects.length > 0 && (
                <section className="mt-8">
                  <h3 className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#7a8793]">{T('代表案例', 'Selected projects')}</h3>
                  <ul className="divide-y divide-[#e3e8eb] border-y border-[#e3e8eb]">
                    {r.projects.map((p, i) => (
                      <li key={i} className="grid grid-cols-[48px_1fr] gap-3 py-2.5 text-[13.5px]">
                        <span className="font-mono text-[#7a8793]">{p.year}</span>
                        <span>
                          <span className="font-medium">{p.title}</span>
                          <span className="block text-[12.5px] text-[#51606d]">{[p.client, p.detail].filter(Boolean).join(' · ')}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {r.clients.length > 0 && (
                <section className="mt-6">
                  <h3 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#7a8793]">{T('合作客戶', 'Clients')}</h3>
                  <p className="text-[13px] leading-relaxed text-[#51606d]">{r.clients.slice(0, 12).join(zh ? '、' : ' · ')}</p>
                </section>
              )}
              <footer className="mt-8 text-[11px] text-[#9aa5ae]">{T(`資料更新至 ${today}`, `Figures as of ${today}`)}</footer>
            </article>
          )}

          <section className="no-print card mt-5 overflow-hidden">
            <div className="px-4 pb-2 pt-4">
              <h2 className="text-[15px] font-semibold text-ink">{tx('挑選代表作', 'Pick your featured work')}</h2>
              <p className="mt-0.5 text-[12.5px] text-muted">{tx('加星號的案件會優先列入「代表案例」。保密案件只會顯示領域與規模。', 'Starred jobs go first in “Selected projects”. Confidential jobs only show their field and size.')}</p>
            </div>
            <ul className="divide-y divide-line border-t border-line">
              {featuredPool.map((j) => (
                <li key={j.id} className="flex items-center gap-3 px-4 py-2.5">
                  <button type="button" onClick={() => void saveJob({ ...j, featured: !j.featured })} aria-pressed={!!j.featured} aria-label={tx('代表作', 'Featured')} className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors', j.featured ? 'text-gold' : 'text-line-strong hover:text-muted')}>
                    <Star size={18} fill={j.featured ? 'currentColor' : 'none'} />
                  </button>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] text-ink">{j.title}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-muted">
                      <Pair source={j.sourceLang} target={j.targetLang} />
                      {j.clientId && clientMap.get(j.clientId)?.name}
                      <span>{date(incomeDate(j), { year: 'numeric', month: 'short' })}</span>
                      {j.confidential && <span className="rounded bg-surface-3 px-1.5 text-[11px]">{tx('保密', 'Confidential')}</span>}
                    </span>
                  </span>
                  <span className="shrink-0 text-[13px] text-ink-2 tnum">{num(jobWords(j))}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
      <Sheet
        open={site}
        onClose={() => setSite(false)}
        size="xl"
        title={tx('你的個人網站', 'Your portfolio website')}
        subtitle={tx('中英雙語、一個檔案，可放上 GitHub Pages、Netlify 或自己的網域。內容依左側的設定產生。', 'Bilingual, one file: host it on GitHub Pages, Netlify or your own domain. Built from the options on the left.')}
        footer={
          <>
            <span className="mr-auto hidden text-[12px] text-muted sm:block">{tx(`客戶名稱：${clientMode === 'named' ? '具名' : clientMode === 'hidden' ? '不顯示' : '匿名'}`, `Client names: ${clientMode}`)}</span>
            <Button variant="primary" icon={<Download size={15} />} onClick={() => void downloadFile(`portfolio-${(settings.profile.nameEn || 'translator').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.html`, siteHtml, 'text/html')}>
              {tx('下載網站檔案', 'Download website')}
            </Button>
          </>
        }
      >
        <div className="overflow-hidden rounded-[4px] border border-line">
          <iframe title={tx('個人網站預覽', 'Portfolio preview')} srcDoc={siteHtml} className="block h-[64dvh] w-full bg-white" sandbox="allow-scripts" />
        </div>
      </Sheet>
    </div>
  );
}
