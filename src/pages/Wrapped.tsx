import { ChevronLeft, ChevronRight, Download, Pause, Play, Share2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useData } from '../db/data';
import { domainLabel } from '../domain/constants';
import { fmtMonth } from '../domain/dates';
import { jobWords } from '../domain/money';
import { isEarned, incomeDate, yearReview, type Persona, type YearReview } from '../domain/stats';
import { getLang, tx } from '../i18n';
import { money, num, pct } from '../ui/format';
import { cx } from '../ui/kit';
import { useUI } from '../ui/store';
import { RoundStamp } from '../app/Stamps';
import { downloadFile } from '../features/download';

const PERSONA: Record<Persona, { zh: string; en: string; zhBody: string; enBody: string }> = {
  medical: { zh: '白袍守門人', en: 'The Clinical Guardian', zhBody: '每個劑量、每條警語都經過你的手。你守護的，是永遠不會見面的病人。', enBody: 'Every dosage and warning passed through your hands. You protect patients you will never meet.' },
  legal: { zh: '條文煉金師', en: 'The Clause Alchemist', zhBody: '你把拗口的條文煉成精準的另一種語言，一字之差都逃不過你的眼睛。', enBody: 'You turn dense clauses into precise prose in another language. Not a comma escapes you.' },
  patent: { zh: '創新解碼者', en: 'The Innovation Decoder', zhBody: '你比全世界更早讀懂那些發明。', enBody: 'You understand inventions before the rest of the world does.' },
  games: { zh: '異世界嚮導', en: 'The Realm Guide', zhBody: '你讓玩家在另一種語言裡，也能愛上同一個世界。', enBody: 'You let players fall in love with the same world in another language.' },
  media: { zh: '字幕魔術師', en: 'The Subtitle Magician', zhBody: '你在兩秒鐘裡說完一整句話，觀眾卻從未察覺你的存在。', enBody: 'You say a whole sentence in two seconds, and the audience never notices you were there.' },
  literary: { zh: '文字擺渡人', en: 'The Word Ferryman', zhBody: '你把故事從一岸渡到另一岸，讓讀者以為它本來就在這裡。', enBody: 'You carry stories from one shore to another, until readers believe they were always here.' },
  marketing: { zh: '品牌說書人', en: 'The Brand Storyteller', zhBody: '你翻譯的不是文案，是讓人心動的理由。', enBody: 'You don’t translate copy. You translate reasons to care.' },
  tech: { zh: '技術翻譯官', en: 'The Tech Whisperer', zhBody: '你讓複雜的技術說起人話，而且是兩種語言。', enBody: 'You make complex technology speak plainly, in two languages.' },
  finance: { zh: '數字詩人', en: 'The Numbers Poet', zhBody: '在數字與術語之間，你找到清晰與節奏。', enBody: 'Between figures and jargon, you find clarity and rhythm.' },
  academic: { zh: '知識橋樑', en: 'The Knowledge Bridge', zhBody: '你讓研究跨越語言，走進更多人的視野。', enBody: 'You carry research across languages and into more minds.' },
  default: { zh: '跨語旅人', en: 'The Language Voyager', zhBody: '你在語言之間旅行，每一趟都留下足跡。', enBody: 'You travel between languages, leaving a trail every time.' },
};

const TRAIT = {
  nightOwl: { zh: '夜貓子', en: 'Night owl', zhBody: '晚上十點後，是你最專注的時刻。', enBody: 'After 10 p.m. is when you do your best work.' },
  earlyBird: { zh: '早起鳥', en: 'Early bird', zhBody: '城市還沒醒，你已經翻完一段。', enBody: 'You are a paragraph in before the city wakes up.' },
  marathoner: { zh: '馬拉松選手', en: 'Marathoner', zhBody: '五萬字以上的大案，你一口氣跑完。', enBody: 'Jobs over 50,000 words? You go the distance.' },
  sprinter: { zh: '閃電手', en: 'Sprinter', zhBody: '急件是你的主場。', enBody: 'Rush jobs are your home turf.' },
  explorer: { zh: '跨界探險家', en: 'Explorer', zhBody: '五個以上的領域，都有你的足跡。', enBody: 'Five or more fields carry your footprints.' },
};

const BG = [
  'radial-gradient(120% 80% at 50% 0%, #135a50 0%, #0b1115 60%)',
  'linear-gradient(160deg, #06302a 0%, #0e7c6b 100%)',
  'linear-gradient(160deg, #0d1b3a 0%, #2a4fa8 100%)',
  'linear-gradient(160deg, #1b1036 0%, #4a3aa7 100%)',
  'linear-gradient(160deg, #2a0f0b 0%, #b8382a 100%)',
  'linear-gradient(160deg, #0b2a17 0%, #1f7a36 100%)',
  'linear-gradient(160deg, #0c1830 0%, #2a78d6 100%)',
  'linear-gradient(160deg, #2b1d05 0%, #b07400 100%)',
  'radial-gradient(120% 80% at 50% 100%, #135a50 0%, #0b1115 65%)',
];

const DURATION = 6500;

const useCount = (target: number, active: boolean, ms = 1400) => {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!active) {
      setV(0);
      return;
    }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setV(target);
      return;
    }
    const s = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - s) / ms);
      setV(target * (1 - Math.pow(1 - k, 4)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, ms]);
  return v;
};

function In({ d = 0, children, className, style }: { d?: number; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={cx('animate-[rise_.7s_cubic-bezier(.2,.8,.2,1)_both]', className)} style={{ animationDelay: `${d}ms`, ...style }}>
      {children}
    </div>
  );
}

function Big({ children }: { children: ReactNode }) {
  return <div className="text-[64px] font-bold leading-none tracking-tight sm:text-[88px]">{children}</div>;
}

export function Wrapped() {
  const { jobs, sessions, settings, today, clientMap } = useData();
  const navigate = useUI((s) => s.navigate);
  const years = useMemo(() => [...new Set(jobs.filter(isEarned).map((j) => Number(incomeDate(j).slice(0, 4))))].sort((a, b) => b - a), [jobs]);
  const [year, setYear] = useState<number>(() => years[0] ?? Number(today.slice(0, 4)));
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const started = useRef(performance.now());
  const [progress, setProgress] = useState(0);
  const r = useMemo(() => yearReview(jobs, sessions, year, today, settings.work.workDays), [jobs, sessions, year, today, settings.work.workDays]);
  const base = settings.baseCurrency;
  const en = getLang() === 'en';
  const N = 9;

  const go = useCallback((n: number) => {
    setI(Math.max(0, Math.min(N - 1, n)));
    started.current = performance.now();
    setProgress(0);
  }, []);

  useEffect(() => {
    let raf = 0;
    let pausedAt = 0;
    const tick = (t: number) => {
      if (paused) {
        if (!pausedAt) pausedAt = t;
      } else {
        if (pausedAt) {
          started.current += t - pausedAt;
          pausedAt = 0;
        }
        const p = (t - started.current) / DURATION;
        if (p >= 1 && i < N - 1) go(i + 1);
        else setProgress(Math.min(1, p));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [i, paused, go]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') go(i + 1);
      else if (e.key === 'ArrowLeft') go(i - 1);
      else if (e.key === 'Escape') navigate('/');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [i, go, navigate]);

  const persona = PERSONA[r.persona];
  const trait = r.trait ? TRAIT[r.trait] : undefined;
  const topClient = r.topClient ? clientMap.get(r.topClient.id) : undefined;

  if (!r.totals.jobs) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center p-6 text-center text-white" style={{ background: BG[0] }}>
        <div>
          <div className="font-display text-[32px]">{tx(`${year} 年還沒有完成的案件`, `No delivered jobs in ${year} yet`)}</div>
          <p className="mt-3 text-white/70">{tx('完成幾個案件之後，這裡會變成你的年度成績單。', 'Deliver a few jobs and this becomes your annual report card.')}</p>
          <button type="button" className="btn btn-secondary mt-6" onClick={() => navigate('/')}>
            {tx('回到總覽', 'Back to overview')}
          </button>
        </div>
      </div>
    );
  }

  const makeCard = async () => {
    const url = await renderShareCard(r, { year, persona: en ? persona.en : persona.zh, domain: r.topDomain ? domainLabel(r.topDomain.key, getLang()) : '', name: en ? settings.profile.nameEn || settings.profile.name : settings.profile.name });
    setShareUrl(url);
    setPaused(true);
  };

  const slides: ReactNode[] = [
    // 0 cover
    <div key="c" className="flex h-full flex-col items-center justify-center text-center">
      <In>
        <RoundStamp top={`WORDTRAIL · ${year}`} center={tx('年度', 'YEAR')} bottom="IN REVIEW" color="#ffffff" size={150} rotate={-8} />
      </In>
      <In d={250}>
        <div className="mt-8 font-mono text-[14px] tracking-[0.3em] text-white/70">{year}</div>
      </In>
      <In d={400}>
        <h1 className="font-display mt-2 text-[44px] leading-tight sm:text-[60px]">{tx('你的翻譯足跡', 'Your year in words')}</h1>
      </In>
      <In d={650}>
        <p className="mt-4 text-[16px] text-white/70">{tx('點右側繼續，點左側返回', 'Tap right to continue, left to go back')}</p>
      </In>
      {years.length > 1 && (
        <In d={800} className="mt-8 flex flex-wrap justify-center gap-2">
          {years.slice(0, 6).map((y) => (
            <button
              key={y}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setYear(y);
                go(0);
              }}
              className={cx('rounded-full border px-4 py-1.5 font-mono text-[13px]', y === year ? 'border-white bg-white text-[#0b1115]' : 'border-white/40 text-white/80')}
            >
              {y}
            </button>
          ))}
        </In>
      )}
    </div>,
    // 1 words
    <WordsSlide key="w" r={r} active={i === 1} />,
    // 2 jobs & clients
    <div key="j" className="flex h-full flex-col justify-center">
      <In>
        <p className="text-[18px] text-white/80">{tx('這一年，你完成了', 'This year you delivered')}</p>
      </In>
      <In d={200}>
        <Big>
          {num(r.totals.jobs)}
          <span className="ml-2 text-[28px] font-medium text-white/70">{tx('個案件', 'jobs')}</span>
        </Big>
      </In>
      <In d={450}>
        <p className="mt-6 text-[22px] leading-snug">
          {tx(`為 ${r.clients} 位客戶工作`, `for ${r.clients} clients`)}
          {r.newClients > 0 && <span className="text-white/70">{tx(`，其中 ${r.newClients} 位是新朋友`, `, ${r.newClients} of them new`)}</span>}
        </p>
      </In>
      {r.busiestMonth && (
        <In d={750}>
          <div className="mt-10 rounded-2xl bg-white/10 p-5 backdrop-blur">
            <div className="text-[14px] text-white/70">{tx('最忙的月份', 'Busiest month')}</div>
            <div className="mt-1 font-display text-[34px]">{fmtMonth(r.busiestMonth.month, getLang(), 'long')}</div>
            <div className="text-[15px] text-white/80">{tx(`交出 ${num(Math.round(r.busiestMonth.words))} 字`, `${num(Math.round(r.busiestMonth.words))} words delivered`)}</div>
          </div>
        </In>
      )}
    </div>,
    // 3 persona
    <div key="p" className="flex h-full flex-col justify-center">
      {r.topDomain && (
        <In>
          <p className="text-[18px] text-white/80">
            {tx(`你最常翻譯的是「${domainLabel(r.topDomain.key, 'zh-TW')}」，佔全年 ${pct(r.topDomain.share)}`, `Your top field was ${domainLabel(r.topDomain.key, 'en')}: ${pct(r.topDomain.share)} of your words`)}
          </p>
        </In>
      )}
      <In d={300} className="mt-8">
        <div className="text-[15px] font-mono tracking-[0.2em] text-white/60">{tx('你的譯者人格', 'YOUR TRANSLATOR TYPE')}</div>
        <h2 className="font-display mt-2 text-[52px] leading-tight sm:text-[64px]">{en ? persona.en : persona.zh}</h2>
      </In>
      <In d={650}>
        <p className="mt-4 max-w-[30ch] text-[19px] leading-relaxed text-white/85">{en ? persona.enBody : persona.zhBody}</p>
      </In>
      {trait && (
        <In d={1000} className="mt-8 inline-flex self-start rounded-full bg-white/15 px-4 py-2 text-[15px]">
          + {en ? trait.en : trait.zh} · <span className="ml-1 text-white/75">{en ? trait.enBody : trait.zhBody}</span>
        </In>
      )}
    </div>,
    // 4 top client
    <div key="tc" className="flex h-full flex-col justify-center">
      <In>
        <p className="text-[18px] text-white/80">{tx('今年最重要的夥伴', 'Your partner of the year')}</p>
      </In>
      <In d={250}>
        <h2 className="font-display mt-3 text-[46px] leading-tight sm:text-[58px]">{topClient?.name ?? '—'}</h2>
      </In>
      {r.topClient && (
        <In d={550}>
          <p className="mt-4 text-[20px] text-white/85">
            {tx(`${r.topClient.jobs} 個案件，佔全年收入 ${pct(r.topClient.income / (r.totals.income || 1))}`, `${r.topClient.jobs} jobs, ${pct(r.topClient.income / (r.totals.income || 1))} of your income`)}
          </p>
        </In>
      )}
      <In d={850} className="mt-10">
        <div className="text-[14px] text-white/70">{tx('其他前幾名', 'Also in your top five')}</div>
        <ul className="mt-2 text-[17px] leading-8">
          {[...new Set(jobs.filter((j) => isEarned(j) && incomeDate(j).startsWith(String(year)) && j.clientId && j.clientId !== r.topClient?.id).map((j) => j.clientId!))]
            .map((id) => ({ id, n: jobs.filter((j) => j.clientId === id && isEarned(j) && incomeDate(j).startsWith(String(year))).length }))
            .sort((a, b) => b.n - a.n)
            .slice(0, 4)
            .map((x, k) => (
              <li key={x.id} className="flex gap-3">
                <span className="w-5 font-mono text-white/50">{k + 2}</span>
                {clientMap.get(x.id)?.name}
              </li>
            ))}
        </ul>
      </In>
    </div>,
    // 5 money
    <MoneySlide key="m" r={r} active={i === 5} base={base} />,
    // 6 rhythm
    <div key="r" className="flex h-full flex-col justify-center">
      <In>
        <p className="text-[18px] text-white/80">{tx('你的一年，像這樣', 'Your year looked like this')}</p>
      </In>
      <In d={250} className="mt-6">
        <MiniYear daily={r.daily} year={year} />
      </In>
      <In d={600} className="mt-8 grid grid-cols-2 gap-4">
        <div>
          <div className="text-[44px] font-bold leading-none">{r.activeDays}</div>
          <div className="mt-1 text-[14px] text-white/70">{tx('有產出的日子', 'days with output')}</div>
        </div>
        <div>
          <div className="text-[44px] font-bold leading-none">{r.longestStreak}</div>
          <div className="mt-1 text-[14px] text-white/70">{tx('最長連續工作天', 'longest streak (workdays)')}</div>
        </div>
      </In>
    </div>,
    // 7 biggest & fastest
    <div key="b" className="flex h-full flex-col justify-center gap-10">
      {r.biggestJob && (
        <In>
          <p className="text-[16px] text-white/75">{tx('今年最大的一案', 'Your biggest job')}</p>
          <h3 className="font-display mt-2 text-[34px] leading-tight">{r.biggestJob.confidential ? tx(`${domainLabel(r.biggestJob.domain, 'zh-TW')}領域大型專案`, `A large ${domainLabel(r.biggestJob.domain, 'en')} project`) : r.biggestJob.title}</h3>
          <p className="mt-1 text-[20px] font-semibold">{tx(`${num(jobWords(r.biggestJob))} 字`, `${num(jobWords(r.biggestJob))} words`)}</p>
        </In>
      )}
      {r.fastestJob && (
        <In d={500}>
          <p className="text-[16px] text-white/75">{tx('最快的一次衝刺', 'Your fastest sprint')}</p>
          <p className="mt-2 text-[40px] font-bold leading-none">
            {num(Math.round(r.fastestJob.wordsPerDay))}
            <span className="ml-2 text-[20px] font-medium text-white/75">{tx('字／天', 'words / day')}</span>
          </p>
        </In>
      )}
      {r.pairs.length > 0 && (
        <In d={900}>
          <p className="text-[16px] text-white/75">{tx('語言組合', 'Language pairs')}</p>
          <p className="mt-2 font-mono text-[20px]">{r.pairs.slice(0, 3).map((p) => p.key.replace('>', ' → ').toUpperCase()).join('   ')}</p>
        </In>
      )}
    </div>,
    // 8 summary
    <div key="s" className="flex h-full flex-col items-center justify-center text-center">
      <In>
        <p className="font-mono text-[13px] tracking-[0.3em] text-white/60">WORDTRAIL · {year}</p>
      </In>
      <In d={200} className="mt-5 w-full max-w-[360px] rounded-3xl bg-white/10 p-6 text-left backdrop-blur">
        <div className="font-display text-[26px]">{en ? persona.en : persona.zh}</div>
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
          {[
            [num(r.totals.words), tx('字', 'words')],
            [num(r.totals.jobs), tx('案件', 'jobs')],
            [String(r.clients), tx('客戶', 'clients')],
            [String(r.activeDays), tx('工作日', 'active days')],
          ].map(([v, l]) => (
            <div key={l}>
              <div className="text-[26px] font-bold leading-none">{v}</div>
              <div className="mt-1 text-[13px] text-white/65">{l}</div>
            </div>
          ))}
        </div>
        {r.topDomain && <div className="mt-4 text-[14px] text-white/80">{tx(`主力領域：${domainLabel(r.topDomain.key, 'zh-TW')}`, `Top field: ${domainLabel(r.topDomain.key, 'en')}`)}</div>}
      </In>
      <In d={500} className="mt-6 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void makeCard();
          }}
          className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-[15px] font-semibold text-[#0b1115]"
        >
          <Share2 size={18} /> {tx('產生分享圖卡', 'Create share card')}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            go(0);
          }}
          className="inline-flex h-12 items-center rounded-full border border-white/40 px-6 text-[15px] font-medium"
        >
          {tx('再看一次', 'Replay')}
        </button>
      </In>
    </div>,
  ];

  return (
    <div className="fixed inset-0 z-50 select-none overflow-hidden text-white" style={{ background: BG[i], transition: 'background 0.6s ease' }}>
      <div className="mx-auto flex h-full max-w-[520px] flex-col px-5" style={{ paddingTop: 'max(14px, env(safe-area-inset-top))', paddingBottom: 'max(18px, env(safe-area-inset-bottom))' }}>
        <div className="flex gap-1" aria-hidden>
          {Array.from({ length: N }, (_, k) => (
            <div key={k} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/25">
              <div className="h-full bg-white" style={{ width: k < i ? '100%' : k === i ? `${progress * 100}%` : '0%' }} />
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="font-mono text-[12px] tracking-[0.2em] text-white/70">譯跡 · {year}</span>
          <div className="flex gap-1">
            <button type="button" className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10" onClick={() => setPaused((p) => !p)} aria-label={paused ? tx('播放', 'Play') : tx('暫停', 'Pause')}>
              {paused ? <Play size={17} /> : <Pause size={17} />}
            </button>
            <button type="button" className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10" onClick={() => navigate('/')} aria-label={tx('關閉', 'Close')}>
              <X size={19} />
            </button>
          </div>
        </div>
        <div
          className="relative min-h-0 flex-1"
          onClick={(e) => {
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            if (e.clientX - rect.left < rect.width * 0.3) go(i - 1);
            else go(i + 1);
          }}
        >
          <div key={`${year}-${i}`} className="h-full py-6">
            {slides[i]}
          </div>
        </div>
        <div className="hidden justify-between sm:flex">
          <button type="button" className="grid h-10 w-10 place-items-center rounded-full bg-white/10 disabled:opacity-30" disabled={i === 0} onClick={() => go(i - 1)} aria-label={tx('上一頁', 'Previous')}>
            <ChevronLeft size={20} />
          </button>
          <button type="button" className="grid h-10 w-10 place-items-center rounded-full bg-white/10 disabled:opacity-30" disabled={i === N - 1} onClick={() => go(i + 1)} aria-label={tx('下一頁', 'Next')}>
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {shareUrl && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/80 p-6" onClick={() => setShareUrl(null)}>
          <img src={shareUrl} alt={tx('年度回顧分享圖卡', 'Year-in-review share card')} className="max-h-[70vh] rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()} />
          <p className="text-center text-[13px] text-white/70">{tx('長按或按右鍵即可儲存圖片', 'Long-press or right-click to save the image')}</p>
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 font-semibold text-[#0b1115]"
              onClick={async () => {
                const blob = await (await fetch(shareUrl)).blob();
                void downloadFile(`wordtrail-${year}.png`, blob, 'image/png');
              }}
            >
              <Download size={17} /> {tx('下載／分享', 'Save / share')}
            </button>
            <button type="button" className="inline-flex h-11 items-center rounded-full border border-white/40 px-5" onClick={() => setShareUrl(null)}>
              {tx('關閉', 'Close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function WordsSlide({ r, active }: { r: YearReview; active: boolean }) {
  const v = useCount(r.totals.words, active);
  const growth = r.prevWords ? (r.totals.words - r.prevWords) / r.prevWords : undefined;
  return (
    <div className="flex h-full flex-col justify-center">
      <In>
        <p className="text-[18px] text-white/80">{r.inProgress ? tx('今年到目前為止，你翻譯了', 'So far this year you translated') : tx(`${r.year} 年，你翻譯了`, `In ${r.year} you translated`)}</p>
      </In>
      <In d={150}>
        <Big>{num(Math.round(v))}</Big>
        <div className="mt-2 text-[24px] font-medium text-white/80">{tx('個字', 'words')}</div>
      </In>
      {growth != null && (
        <In d={500}>
          <p className="mt-5 text-[17px]">{growth >= 0
              ? tx(`比去年${r.inProgress ? '同期' : ''}多了 ${pct(growth)}`, `${pct(growth)} more than ${r.inProgress ? 'this time ' : ''}last year`)
              : tx(`比去年${r.inProgress ? '同期' : ''}少了 ${pct(-growth)}，也是好好生活的一年`, `${pct(-growth)} fewer than ${r.inProgress ? 'this time ' : ''}last year — a year of balance`)}</p>
        </In>
      )}
      <In d={800} className="mt-10 grid gap-3">
        <div className="rounded-2xl bg-white/10 p-4 backdrop-blur">
          <div className="text-[30px] font-bold leading-none">{num(r.novels, 1)}</div>
          <div className="mt-1 text-[14px] text-white/75">{tx('本長篇小說的份量（以 10 萬字一本計）', 'full-length novels (100,000 words each)')}</div>
        </div>
        <div className="rounded-2xl bg-white/10 p-4 backdrop-blur">
          <div className="text-[30px] font-bold leading-none">{num(r.stackCm, 1)} cm</div>
          <div className="mt-1 text-[14px] text-white/75">{tx(`印成 A4 疊起來的高度（${num(Math.round(r.a4Pages))} 頁）`, `tall if printed on A4 (${num(Math.round(r.a4Pages))} pages)`)}</div>
        </div>
      </In>
    </div>
  );
}

function MoneySlide({ r, active, base }: { r: YearReview; active: boolean; base: string }) {
  const v = useCount(r.totals.income, active);
  const growth = r.prevIncome ? (r.totals.income - r.prevIncome) / r.prevIncome : undefined;
  const rateGrowth = r.ratePerWord && r.prevRatePerWord ? (r.ratePerWord - r.prevRatePerWord) / r.prevRatePerWord : undefined;
  return (
    <div className="flex h-full flex-col justify-center">
      <In>
        <p className="text-[18px] text-white/80">{tx('這些字，換來了', 'Those words earned you')}</p>
      </In>
      <In d={150}>
        <div className="text-[52px] font-bold leading-none tracking-tight sm:text-[70px]">{money(v, base)}</div>
      </In>
      {growth != null && (
        <In d={450}>
          <p className="mt-4 text-[18px]">{growth >= 0 ? tx(`比去年${r.inProgress ? '同期' : ''}成長 ${pct(growth)}`, `Up ${pct(growth)} on ${r.inProgress ? 'this time ' : ''}last year`) : tx(`比去年${r.inProgress ? '同期' : ''}少 ${pct(-growth)}`, `Down ${pct(-growth)} on ${r.inProgress ? 'this time ' : ''}last year`)}</p>
        </In>
      )}
      <In d={750} className="mt-10 grid grid-cols-2 gap-3">
        {r.hourly && (
          <div className="rounded-2xl bg-white/10 p-4 backdrop-blur">
            <div className="text-[26px] font-bold leading-none">{money(r.hourly, base)}</div>
            <div className="mt-1 text-[13px] text-white/75">{tx('有效時薪', 'effective hourly')}</div>
          </div>
        )}
        {r.ratePerWord && (
          <div className="rounded-2xl bg-white/10 p-4 backdrop-blur">
            <div className="text-[26px] font-bold leading-none">
              {money(r.ratePerWord, base, { decimals: 2 })}
              {rateGrowth != null && <span className="ml-1 text-[14px] font-medium text-white/75">{rateGrowth >= 0 ? '▲' : '▼'}{pct(Math.abs(rateGrowth))}</span>}
            </div>
            <div className="mt-1 text-[13px] text-white/75">{tx('每字平均收入', 'income per word')}</div>
          </div>
        )}
      </In>
    </div>
  );
}

function MiniYear({ daily, year }: { daily: Map<string, number>; year: number }) {
  const vals = [...daily.values()].filter((v) => v > 0).sort((a, b) => a - b);
  const q = (p: number) => vals[Math.floor(p * (vals.length - 1))] ?? 0;
  const cuts = [q(0.25), q(0.5), q(0.75)];
  const cells: { d: string; l: number }[] = [];
  const start = new Date(year, 0, 1);
  for (let k = 0; k < 366; k++) {
    const dt = new Date(year, 0, 1 + k);
    if (dt.getFullYear() !== year) break;
    const iso = `${year}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    const v = daily.get(iso) || 0;
    cells.push({ d: iso, l: v <= 0 ? 0 : v <= cuts[0] ? 1 : v <= cuts[1] ? 2 : v <= cuts[2] ? 3 : 4 });
  }
  const offset = (start.getDay() + 6) % 7;
  const alpha = [0.08, 0.3, 0.5, 0.72, 1];
  return (
    <div className="grid grid-flow-col grid-rows-7 gap-[2px]" style={{ gridAutoColumns: 'minmax(0,1fr)' }} aria-label="heatmap">
      {Array.from({ length: offset }, (_, k) => (
        <span key={'o' + k} />
      ))}
      {cells.map((c) => (
        <span key={c.d} className="aspect-square rounded-[2px]" style={{ background: `rgba(255,255,255,${alpha[c.l]})` }} />
      ))}
    </div>
  );
}

/** Draws a 1080×1350 share card on a canvas and returns a PNG data URL. */
async function renderShareCard(r: YearReview, o: { year: number; persona: string; domain: string; name: string }): Promise<string> {
  const W = 1080;
  const H = 1350;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  try {
    await Promise.all([
      document.fonts.load('700 80px "LXGW WenKai TC"', o.persona + '譯跡年度回顧字案件客戶工作日主力領域'),
      document.fonts.load('700 80px "IBM Plex Sans"'),
      document.fonts.load('500 30px "IBM Plex Mono"'),
    ]);
  } catch {
    /* fall back to system fonts */
  }
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#06302a');
  grad.addColorStop(0.55, '#0b1115');
  grad.addColorStop(1, '#0d1b3a');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // faint guilloché rings, the passport-page texture
  g.strokeStyle = 'rgba(255,255,255,0.05)';
  g.lineWidth = 2;
  for (let k = 0; k < 18; k++) {
    g.beginPath();
    g.arc(W * 0.85, H * 0.12, 80 + k * 38, 0, Math.PI * 2);
    g.stroke();
  }
  const sans = '"IBM Plex Sans", "PingFang TC", "Noto Sans TC", sans-serif';
  const disp = '"LXGW WenKai TC", "PingFang TC", serif';
  const mono = '"IBM Plex Mono", monospace';
  g.fillStyle = 'rgba(255,255,255,0.65)';
  g.font = `500 30px ${mono}`;
  g.fillText(`WORDTRAIL · ${o.year}`, 90, 140);
  g.fillStyle = '#fff';
  g.font = `700 78px ${disp}`;
  g.fillText(tx('我的翻譯足跡', 'My year in words'), 90, 250);
  if (o.name) {
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.font = `500 34px ${sans}`;
    g.fillText(o.name, 90, 310);
  }
  g.fillStyle = '#fff';
  g.font = `700 190px ${sans}`;
  g.fillText(r.totals.words.toLocaleString(getLang() === 'en' ? 'en-US' : 'zh-TW'), 82, 560);
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.font = `500 40px ${sans}`;
  g.fillText(tx('個字', 'words translated'), 92, 625);
  // persona band
  g.fillStyle = 'rgba(255,255,255,0.1)';
  roundRect(g, 90, 700, W - 180, 170, 28);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.6)';
  g.font = `500 26px ${mono}`;
  g.fillText(tx('譯者人格', 'TRANSLATOR TYPE'), 130, 758);
  g.fillStyle = '#fff';
  g.font = `700 60px ${disp}`;
  g.fillText(o.persona, 130, 834);
  const stats: [string, string][] = [
    [r.totals.jobs.toLocaleString(), tx('案件', 'jobs')],
    [String(r.clients), tx('客戶', 'clients')],
    [String(r.activeDays), tx('工作日', 'active days')],
  ];
  stats.forEach(([v, l], k) => {
    const x = 90 + k * 310;
    g.fillStyle = '#fff';
    g.font = `700 84px ${sans}`;
    g.fillText(v, x, 1010);
    g.fillStyle = 'rgba(255,255,255,0.65)';
    g.font = `500 32px ${sans}`;
    g.fillText(l, x, 1060);
  });
  if (o.domain) {
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.font = `500 36px ${sans}`;
    g.fillText(tx(`主力領域：${o.domain}`, `Top field: ${o.domain}`), 90, 1150);
  }
  g.fillStyle = 'rgba(255,255,255,0.45)';
  g.font = `500 26px ${mono}`;
  g.fillText('譯跡 WORDTRAIL', 90, H - 90);
  // seal
  g.save();
  g.translate(W - 190, H - 200);
  g.rotate(-0.16);
  g.strokeStyle = '#ef5a44';
  g.lineWidth = 7;
  roundRect(g, -110, -70, 220, 140, 18);
  g.stroke();
  g.fillStyle = '#ef5a44';
  g.font = `700 64px ${disp}`;
  g.textAlign = 'center';
  g.fillText(String(o.year), 0, 22);
  g.restore();
  return c.toDataURL('image/png');
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
