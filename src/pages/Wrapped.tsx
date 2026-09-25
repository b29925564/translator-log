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
import { Medallion, SunburstRays } from '../app/Stamps';
import { BRAND_GOLD, W_LINES, WGlyph } from '../app/Logo';
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

// Every slide is ink; what changes is the gold ornament behind it.
type MotifKind = 'sun' | 'corner' | 'arcs' | 'steps' | 'streams' | 'flutes' | 'none';
const MOTIF: MotifKind[] = ['sun', 'streams', 'arcs', 'steps', 'flutes', 'corner', 'none', 'streams', 'sun'];
const INK = '#0b0b0c';

function Motif({ kind }: { kind: MotifKind }) {
  const c = BRAND_GOLD;
  const wrap = 'pointer-events-none absolute inset-0 animate-[fadeIn_1.2s_ease_both] overflow-hidden';
  if (kind === 'sun')
    return (
      <div className={wrap}>
        <SunburstRays origin="bottom" count={40} opacity={0.2} color={c} />
      </div>
    );
  if (kind === 'corner')
    return (
      <div className={wrap}>
        <SunburstRays origin="bottom-right" count={26} opacity={0.24} color={c} />
      </div>
    );
  if (kind === 'arcs')
    return (
      <div className={wrap}>
        <svg className="absolute -right-px -top-px h-[min(90vw,620px)] w-[min(90vw,620px)]" viewBox="0 0 600 600" aria-hidden style={{ opacity: 0.32 }}>
          {[120, 190, 260, 330, 400, 470, 540].map((r, k) => (
            <circle key={r} cx="600" cy="0" r={r} fill="none" stroke={c} strokeWidth={k === 3 ? 2 : 0.8} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      </div>
    );
  if (kind === 'steps') {
    // a stepped Deco doorway framing the column; phones get quiet arcs instead
    const arch = (w: number, h: number) => {
      const x0 = 500 - w / 2;
      const x1 = 500 + w / 2;
      const t = 1000 - h;
      const s = 30;
      return `M${x0},1000 V${t + s * 2} H${x0 + s} V${t + s} H${x0 + s * 2} V${t} H${x1 - s * 2} V${t + s} H${x1 - s} V${t + s * 2} H${x1} V1000`;
    };
    return (
      <div className={wrap}>
        <svg className="absolute bottom-0 left-1/2 hidden h-[88%] w-[780px] -translate-x-1/2 sm:block" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden style={{ opacity: 0.32 }}>
          {[
            [1000, 1000],
            [900, 930],
            [800, 860],
          ].map(([w, h], k) => (
            <path key={k} d={arch(w, h)} fill="none" stroke={c} strokeWidth={k === 0 ? 2 : 0.8} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        <div className="sm:hidden">
          <Motif kind="arcs" />
        </div>
      </div>
    );
  }
  if (kind === 'streams')
    // three parallel lines, the strokes of the W stretched into speed lines
    return (
      <div className={wrap} style={{ opacity: 0.45 }}>
        {[0, 9, 18].map((o, k) => (
          <div key={o} className="absolute inset-x-0" style={{ bottom: `calc(11% + ${o}px)`, height: k === 1 ? 2 : 1, background: `linear-gradient(90deg, transparent, ${c} 30%, ${c} 70%, transparent)` }} />
        ))}
      </div>
    );
  if (kind === 'flutes')
    return (
      <div className={wrap}>
        <div
          className="absolute inset-y-0 right-0 w-[min(46vw,420px)]"
          style={{
            background: `repeating-linear-gradient(90deg, ${c} 0 1px, transparent 1px 14px)`,
            opacity: 0.22,
            maskImage: 'linear-gradient(90deg, transparent, #000 70%)',
            WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 70%)',
          }}
        />
      </div>
    );
  return null;
}

/** Gold wide-caps label above a figure. */
function Kicker({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <div className={cx('eyebrow', !muted && 'text-gold')}>{children}</div>;
}

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
  return <div className="tnum text-[68px] font-medium leading-[0.95] tracking-[-0.05em] sm:text-[96px]">{children}</div>;
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
      <div className="on-ink fixed inset-0 z-50 grid place-items-center p-6 text-center text-ink" style={{ background: INK }}>
        <Motif kind="sun" />
        <div className="relative">
          <WGlyph size={48} color={BRAND_GOLD} className="mx-auto" />
          <div className="font-display mt-6 text-[32px] leading-tight">{tx(`${year} 年還沒有完成的案件`, `No delivered jobs in ${year} yet`)}</div>
          <p className="mt-3 text-ink-2">{tx('完成幾個案件之後，這裡會變成你的年度成績單。', 'Deliver a few jobs and this becomes your annual report card.')}</p>
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

  const goldBtn = 'inline-flex h-12 items-center gap-2 rounded-[3px] bg-gold px-6 text-[14px] font-semibold text-[#0b0b0c] hover:brightness-110';
  const lineBtn = 'inline-flex h-12 items-center gap-2 rounded-[3px] border border-line-strong px-6 text-[14px] font-medium text-ink hover:border-ink';

  const slides: ReactNode[] = [
    // 0 cover
    <div key="c" className="flex h-full flex-col items-center justify-center text-center">
      <In className="relative grid place-items-center">
        <Medallion top={`WORDTRAIL · ${year}`} center="" bottom={tx('年度回顧', 'YEAR IN REVIEW')} color={BRAND_GOLD} size={196} rays={72} />
        <WGlyph size={62} color={BRAND_GOLD} className="absolute" />
      </In>
      <In d={250}>
        <div className="font-wide mt-9 text-[12px] tracking-[0.6em] text-gold">{year}</div>
      </In>
      <In d={400}>
        <h1 className="font-display mt-3 text-[44px] leading-[1.02] sm:text-[62px]">{tx('你的翻譯足跡', 'Your year in words')}</h1>
      </In>
      <In d={650}>
        <p className="mt-5 text-[15px] text-muted">{tx('點右側繼續，點左側返回', 'Tap right to continue, left to go back')}</p>
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
              className={cx('h-9 rounded-[3px] border px-4 font-mono text-[13px]', y === year ? 'border-gold bg-gold text-[#0b0b0c]' : 'border-line-strong text-ink-2 hover:border-ink')}
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
        <Kicker>{tx('案件', 'Jobs')}</Kicker>
        <p className="mt-3 text-[18px] text-ink-2">{tx('這一年，你完成了', 'This year you delivered')}</p>
      </In>
      <In d={200} className="mt-2">
        <Big>
          {num(r.totals.jobs)}
          <span className="ml-3 text-[26px] font-normal tracking-[-0.01em] text-ink-2">{tx('個案件', 'jobs')}</span>
        </Big>
      </In>
      <In d={450}>
        <p className="mt-6 text-[21px] leading-snug">
          {tx(`為 ${r.clients} 位客戶工作`, `for ${r.clients} clients`)}
          {r.newClients > 0 && <span className="text-ink-2">{tx(`，其中 ${r.newClients} 位是新朋友`, `, ${r.newClients} of them new`)}</span>}
        </p>
      </In>
      {r.busiestMonth && (
        <In d={750} className="mt-10 border-t border-line-strong pt-5">
          <Kicker>{tx('最忙的月份', 'Busiest month')}</Kicker>
          <div className="font-display mt-2 text-[36px] leading-tight">{fmtMonth(r.busiestMonth.month, getLang(), 'long')}</div>
          <div className="tnum mt-1 text-[15px] text-ink-2">{tx(`交出 ${num(Math.round(r.busiestMonth.words))} 字`, `${num(Math.round(r.busiestMonth.words))} words delivered`)}</div>
        </In>
      )}
    </div>,
    // 3 persona
    <div key="p" className="flex h-full flex-col justify-center">
      <In className="flex items-center gap-4">
        <Medallion top={tx('譯者人格', 'TRANSLATOR TYPE')} center={String(year)} bottom="WORDTRAIL" color={BRAND_GOLD} size={92} rays={40} />
        {r.topDomain && (
          <p className="text-[16px] leading-snug text-ink-2">
            {tx(`你最常翻譯的是「${domainLabel(r.topDomain.key, 'zh-TW')}」，佔全年 ${pct(r.topDomain.share)}`, `Your top field was ${domainLabel(r.topDomain.key, 'en')}: ${pct(r.topDomain.share)} of your words`)}
          </p>
        )}
      </In>
      <In d={300} className="mt-10">
        <Kicker>{tx('你的譯者人格', 'Your translator type')}</Kicker>
        <h2 className="font-display mt-3 text-[50px] leading-[1.02] sm:text-[64px]">{en ? persona.en : persona.zh}</h2>
        <div className="rule-deco mt-6 max-w-[240px] !border-gold" />
      </In>
      <In d={650}>
        <p className="mt-6 max-w-[32ch] text-[19px] leading-relaxed text-ink-2">{en ? persona.enBody : persona.zhBody}</p>
      </In>
      {trait && (
        <In d={1000} className="mt-8 border-l-2 border-gold pl-4">
          <div className="text-[16px] font-semibold">
            <span className="mr-1.5 text-gold">+</span>
            {en ? trait.en : trait.zh}
          </div>
          <div className="mt-0.5 text-[14.5px] text-ink-2">{en ? trait.enBody : trait.zhBody}</div>
        </In>
      )}
    </div>,
    // 4 top client
    <div key="tc" className="flex h-full flex-col justify-center">
      <In>
        <Kicker>{tx('年度夥伴', 'Partner of the year')}</Kicker>
        <p className="mt-3 text-[18px] text-ink-2">{tx('今年最重要的夥伴', 'The client who kept you busiest')}</p>
      </In>
      <In d={250}>
        <h2 className="font-display mt-3 text-[46px] leading-[1.04] sm:text-[58px]">{topClient?.name ?? '—'}</h2>
      </In>
      {r.topClient && (
        <In d={550}>
          <p className="mt-4 text-[19px] text-ink-2">
            {tx(`${r.topClient.jobs} 個案件，佔全年收入 ${pct(r.topClient.income / (r.totals.income || 1))}`, `${r.topClient.jobs} jobs, ${pct(r.topClient.income / (r.totals.income || 1))} of your income`)}
          </p>
        </In>
      )}
      <In d={850} className="mt-10 max-w-[70%]">
        <Kicker muted>{tx('其他前幾名', 'Also in your top five')}</Kicker>
        <ul className="mt-2">
          {[...new Set(jobs.filter((j) => isEarned(j) && incomeDate(j).startsWith(String(year)) && j.clientId && j.clientId !== r.topClient?.id).map((j) => j.clientId!))]
            .map((id) => ({ id, n: jobs.filter((j) => j.clientId === id && isEarned(j) && incomeDate(j).startsWith(String(year))).length }))
            .sort((a, b) => b.n - a.n)
            .slice(0, 4)
            .map((x, k) => (
              <li key={x.id} className="flex items-baseline gap-4 border-b border-line py-2.5 text-[17px]">
                <span className="w-5 font-mono text-[13px] text-gold">{String(k + 2).padStart(2, '0')}</span>
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
        <Kicker>{tx('節奏', 'Rhythm')}</Kicker>
        <p className="mt-3 text-[18px] text-ink-2">{tx('你的一年，像這樣', 'Your year looked like this')}</p>
      </In>
      <In d={250} className="mt-6">
        <MiniYear daily={r.daily} year={year} />
      </In>
      <In d={600} className="mt-8 grid grid-cols-2 border-t border-line-strong">
        <div className="pr-4 pt-5">
          <div className="tnum text-[48px] font-medium leading-none tracking-[-0.04em]">{r.activeDays}</div>
          <div className="mt-2 text-[13.5px] text-ink-2">{tx('有產出的日子', 'days with output')}</div>
        </div>
        <div className="border-l border-line-strong pl-5 pt-5">
          <div className="tnum text-[48px] font-medium leading-none tracking-[-0.04em]">{r.longestStreak}</div>
          <div className="mt-2 text-[13.5px] text-ink-2">{tx('最長連續工作天', 'longest streak (workdays)')}</div>
        </div>
      </In>
    </div>,
    // 7 biggest & fastest
    <div key="b" className="flex h-full flex-col justify-center gap-9">
      {r.biggestJob && (
        <In>
          <Kicker>{tx('今年最大的一案', 'Your biggest job')}</Kicker>
          <h3 className="font-display mt-3 text-[32px] leading-tight">{r.biggestJob.confidential ? tx(`${domainLabel(r.biggestJob.domain, 'zh-TW')}領域大型專案`, `A large ${domainLabel(r.biggestJob.domain, 'en')} project`) : r.biggestJob.title}</h3>
          <p className="tnum mt-1 text-[19px] text-ink-2">{tx(`${num(jobWords(r.biggestJob))} 字`, `${num(jobWords(r.biggestJob))} words`)}</p>
        </In>
      )}
      {r.fastestJob && (
        <In d={500} className="border-t border-line-strong pt-6">
          <Kicker>{tx('最快的一次衝刺', 'Your fastest sprint')}</Kicker>
          <p className="tnum mt-3 text-[48px] font-medium leading-none tracking-[-0.04em]">
            {num(Math.round(r.fastestJob.wordsPerDay))}
            <span className="ml-2 text-[18px] font-normal tracking-normal text-ink-2">{tx('字／天', 'words / day')}</span>
          </p>
        </In>
      )}
      {r.pairs.length > 0 && (
        <In d={900} className="border-t border-line-strong pt-6">
          <Kicker>{tx('語言組合', 'Language pairs')}</Kicker>
          <div className="mt-3 flex flex-wrap gap-2">
            {r.pairs.slice(0, 3).map((p) => (
              <span key={p.key} className="rounded-[2px] border border-line-strong px-2.5 py-1 font-mono text-[15px]">
                {p.key.replace('>', ' → ').toUpperCase()}
              </span>
            ))}
          </div>
        </In>
      )}
    </div>,
    // 8 summary
    <div key="s" className="flex h-full flex-col items-center justify-center text-center">
      <In className="relative w-full max-w-[380px] border border-gold/60 p-6 text-left" style={{ background: INK }}>
        <div className="pointer-events-none absolute inset-[5px] border border-gold/25" />
        <div className="relative flex items-center justify-between">
          <span className="flex items-center gap-2.5">
            <WGlyph size={22} color={BRAND_GOLD} />
            <span className="font-wide text-[10px] tracking-[0.3em]">Wordtrail</span>
          </span>
          <span className="font-wide text-[10px] tracking-[0.3em] text-gold">{year}</span>
        </div>
        <div className="relative mt-6">
          <Kicker muted>{tx('譯者人格', 'Translator type')}</Kicker>
          <div className="font-display mt-2 text-[28px] leading-tight">{en ? persona.en : persona.zh}</div>
        </div>
        <div className="relative mt-5 grid grid-cols-2 border-t border-line-strong">
          {[
            [num(r.totals.words), tx('字', 'words')],
            [num(r.totals.jobs), tx('案件', 'jobs')],
            [String(r.clients), tx('客戶', 'clients')],
            [String(r.activeDays), tx('工作日', 'active days')],
          ].map(([v, l], k) => (
            <div key={l} className={cx('py-4', k % 2 ? 'border-l border-line-strong pl-4' : 'pr-4', k > 1 && 'border-t border-line-strong')}>
              <div className="tnum text-[26px] font-medium leading-none tracking-[-0.03em]">{v}</div>
              <div className="mt-1.5 text-[12.5px] text-ink-2">{l}</div>
            </div>
          ))}
        </div>
        {r.topDomain && <div className="relative border-t border-line-strong pt-4 text-[13.5px] text-ink-2">{tx(`主力領域：${domainLabel(r.topDomain.key, 'zh-TW')}`, `Top field: ${domainLabel(r.topDomain.key, 'en')}`)}</div>}
      </In>
      <In d={500} className="mt-7 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void makeCard();
          }}
          className={goldBtn}
        >
          <Share2 size={17} /> {tx('產生分享圖卡', 'Create share card')}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            go(0);
          }}
          className={lineBtn}
        >
          {tx('再看一次', 'Replay')}
        </button>
      </In>
    </div>,
  ];

  const iconBtn = 'grid h-9 w-9 place-items-center rounded-[3px] text-ink-2 hover:bg-white/10 hover:text-ink';

  return (
    <div className="on-ink fixed inset-0 z-50 select-none overflow-hidden text-ink" style={{ background: INK }}>
      <Motif key={`${year}-${i}`} kind={MOTIF[i]} />
      <div className="relative mx-auto flex h-full max-w-[520px] flex-col px-5" style={{ paddingTop: 'max(14px, env(safe-area-inset-top))', paddingBottom: 'max(18px, env(safe-area-inset-bottom))' }}>
        <div className="flex gap-1" aria-hidden>
          {Array.from({ length: N }, (_, k) => (
            <div key={k} className="h-[2px] flex-1 overflow-hidden bg-white/20">
              <div className="h-full bg-gold" style={{ width: k < i ? '100%' : k === i ? `${progress * 100}%` : '0%' }} />
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="flex items-center gap-2.5">
            <WGlyph size={18} color={BRAND_GOLD} stroke={3.6} />
            <span className="font-wide text-[10px] tracking-[0.3em] text-ink-2">
              Wordtrail <span className="text-gold">· {year}</span>
            </span>
          </span>
          <div className="flex gap-1">
            <button type="button" className={iconBtn} onClick={() => setPaused((p) => !p)} aria-label={paused ? tx('播放', 'Play') : tx('暫停', 'Pause')}>
              {paused ? <Play size={17} /> : <Pause size={17} />}
            </button>
            <button type="button" className={iconBtn} onClick={() => navigate('/')} aria-label={tx('關閉', 'Close')}>
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
        <div className="hidden items-center justify-between sm:flex">
          <button type="button" className="grid h-10 w-10 place-items-center rounded-[3px] border border-line-strong hover:border-ink disabled:opacity-30" disabled={i === 0} onClick={() => go(i - 1)} aria-label={tx('上一頁', 'Previous')}>
            <ChevronLeft size={20} />
          </button>
          <span className="font-mono text-[12px] tracking-[0.2em] text-muted">
            {String(i + 1).padStart(2, '0')} / {String(N).padStart(2, '0')}
          </span>
          <button type="button" className="grid h-10 w-10 place-items-center rounded-[3px] border border-line-strong hover:border-ink disabled:opacity-30" disabled={i === N - 1} onClick={() => go(i + 1)} aria-label={tx('下一頁', 'Next')}>
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {shareUrl && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/85 p-6" onClick={() => setShareUrl(null)}>
          <img src={shareUrl} alt={tx('年度回顧分享圖卡', 'Year-in-review share card')} className="max-h-[70vh] rounded-[4px] shadow-2xl" onClick={(e) => e.stopPropagation()} />
          <p className="text-center text-[13px] text-ink-2">{tx('長按或按右鍵即可儲存圖片', 'Long-press or right-click to save the image')}</p>
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={goldBtn}
              onClick={async () => {
                const blob = await (await fetch(shareUrl)).blob();
                void downloadFile(`wordtrail-${year}.png`, blob, 'image/png');
              }}
            >
              <Download size={17} /> {tx('下載／分享', 'Save / share')}
            </button>
            <button type="button" className={lineBtn} onClick={() => setShareUrl(null)}>
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
        <Kicker>{tx('字數', 'Words')}</Kicker>
        <p className="mt-3 text-[18px] text-ink-2">{r.inProgress ? tx('今年到目前為止，你翻譯了', 'So far this year you translated') : tx(`${r.year} 年，你翻譯了`, `In ${r.year} you translated`)}</p>
      </In>
      <In d={150} className="mt-2">
        <Big>{num(Math.round(v))}</Big>
        <div className="mt-3 text-[22px] text-ink-2">{tx('個字', 'words')}</div>
      </In>
      {growth != null && (
        <In d={500}>
          <p className="mt-5 text-[17px]">
            <span className="mr-2 font-mono text-gold">{growth >= 0 ? '▲' : '▼'}</span>
            {growth >= 0
              ? tx(`比去年${r.inProgress ? '同期' : ''}多了 ${pct(growth)}`, `${pct(growth)} more than ${r.inProgress ? 'this time ' : ''}last year`)
              : tx(`比去年${r.inProgress ? '同期' : ''}少了 ${pct(-growth)}，也是好好生活的一年`, `${pct(-growth)} fewer than ${r.inProgress ? 'this time ' : ''}last year — a year of balance`)}
          </p>
        </In>
      )}
      <In d={800} className="mt-10 border-t border-line-strong">
        {[
          [num(r.novels, 1), tx('本長篇小說的份量（以 10 萬字一本計）', 'full-length novels (100,000 words each)')],
          [`${num(r.stackCm, 1)} cm`, tx(`印成 A4 疊起來的高度（${num(Math.round(r.a4Pages))} 頁）`, `tall if printed on A4 (${num(Math.round(r.a4Pages))} pages)`)],
        ].map(([val, label]) => (
          <div key={label} className="flex items-baseline gap-4 border-b border-line-strong py-4">
            <div className="tnum w-[38%] shrink-0 text-[30px] font-medium leading-none tracking-[-0.03em]">{val}</div>
            <div className="text-[13.5px] leading-snug text-ink-2">{label}</div>
          </div>
        ))}
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
        <Kicker>{tx('收入', 'Income')}</Kicker>
        <p className="mt-3 text-[18px] text-ink-2">{tx('這些字，換來了', 'Those words earned you')}</p>
      </In>
      <In d={150} className="mt-2">
        <div className="tnum text-[52px] font-medium leading-none tracking-[-0.05em] sm:text-[72px]">{money(v, base)}</div>
      </In>
      {growth != null && (
        <In d={450}>
          <p className="mt-5 text-[17px]">
            <span className="mr-2 font-mono text-gold">{growth >= 0 ? '▲' : '▼'}</span>
            {growth >= 0 ? tx(`比去年${r.inProgress ? '同期' : ''}成長 ${pct(growth)}`, `Up ${pct(growth)} on ${r.inProgress ? 'this time ' : ''}last year`) : tx(`比去年${r.inProgress ? '同期' : ''}少 ${pct(-growth)}`, `Down ${pct(-growth)} on ${r.inProgress ? 'this time ' : ''}last year`)}
          </p>
        </In>
      )}
      <In d={750} className="mt-10 grid grid-cols-2 border-t border-line-strong">
        {!!r.hourly && (
          <div className="pr-4 pt-5">
            <div className="tnum text-[26px] font-medium leading-none tracking-[-0.03em]">{money(r.hourly, base)}</div>
            <div className="mt-2 text-[13px] text-ink-2">{tx('有效時薪', 'effective hourly')}</div>
          </div>
        )}
        {!!r.ratePerWord && (
          <div className={cx('pt-5', !!r.hourly && 'border-l border-line-strong pl-5')}>
            <div className="tnum text-[26px] font-medium leading-none tracking-[-0.03em]">
              {money(r.ratePerWord, base, { decimals: 2 })}
              {rateGrowth != null && (
                <span className="ml-1.5 text-[13px] font-normal tracking-normal text-gold">
                  {rateGrowth >= 0 ? '▲' : '▼'}
                  {pct(Math.abs(rateGrowth))}
                </span>
              )}
            </div>
            <div className="mt-2 text-[13px] text-ink-2">{tx('每字平均收入', 'income per word')}</div>
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
  const fill = ['rgb(255 255 255 / 0.07)', 'rgb(212 179 108 / 0.3)', 'rgb(212 179 108 / 0.52)', 'rgb(212 179 108 / 0.76)', 'rgb(212 179 108 / 1)'];
  return (
    <div className="grid grid-flow-col grid-rows-7 gap-[2px]" style={{ gridAutoColumns: 'minmax(0,1fr)' }} aria-label="heatmap">
      {Array.from({ length: offset }, (_, k) => (
        <span key={'o' + k} />
      ))}
      {cells.map((c) => (
        <span key={c.d} className="aspect-square rounded-[1px]" style={{ background: fill[c.l] }} />
      ))}
    </div>
  );
}

/** Draws a 1080×1350 share card on a canvas and returns a PNG data URL. */
async function renderShareCard(r: YearReview, o: { year: number; persona: string; domain: string; name: string }): Promise<string> {
  const W = 1080;
  const H = 1350;
  const M = 90; // margin
  const GOLD = BRAND_GOLD;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const zhText = o.persona + o.domain + o.name + '譯跡我的翻譯足跡個字案件客戶工作日主力領域譯者人格年度回顧';
  try {
    await Promise.all([
      document.fonts.load('500 80px "Archivo"', 'WORDTRAIL0123456789,.'),
      document.fonts.load('600 80px "Archivo"', 'WORDTRAIL'),
      document.fonts.load('500 60px "Noto Sans TC"', zhText),
      document.fonts.load('700 60px "Noto Sans TC"', zhText),
    ]);
  } catch {
    /* fall back to system fonts */
  }
  const sans = '"Archivo", "Noto Sans TC", "PingFang TC", sans-serif';
  // canvas text styling that older engines may not support
  const style = (stretch: 'normal' | 'expanded', spacing: number) => {
    const t = g as CanvasRenderingContext2D & { fontStretch?: string; letterSpacing?: string };
    if ('fontStretch' in t) t.fontStretch = stretch;
    if ('letterSpacing' in t) t.letterSpacing = `${spacing}px`;
  };
  const text = (s: string, x: number, y: number, font: string, color: string, opts: { stretch?: 'normal' | 'expanded'; spacing?: number; align?: CanvasTextAlign } = {}) => {
    g.font = font;
    g.fillStyle = color;
    g.textAlign = opts.align ?? 'left';
    style(opts.stretch ?? 'normal', opts.spacing ?? 0);
    g.fillText(s, x, y);
  };
  const hline = (y: number, w = 1.5, color = 'rgba(255,255,255,0.18)') => {
    g.fillStyle = color;
    g.fillRect(M, y, W - M * 2, w);
  };

  g.fillStyle = INK;
  g.fillRect(0, 0, W, H);

  // sunburst from the bottom-right corner
  g.save();
  g.strokeStyle = 'rgba(212,179,108,0.16)';
  g.lineWidth = 1.5;
  for (let k = 0; k <= 30; k++) {
    const a = Math.PI + (k / 30) * (Math.PI / 2);
    g.beginPath();
    g.moveTo(W, H);
    g.lineTo(W + Math.cos(a) * 1900, H + Math.sin(a) * 1900);
    g.stroke();
  }
  for (const rad of [260, 520, 780]) {
    g.beginPath();
    g.arc(W, H, rad, Math.PI, Math.PI * 1.5);
    g.stroke();
  }
  g.restore();

  // header: the W mark, the name, the year
  g.save();
  g.translate(M, 92);
  const s = 1.15;
  g.scale(s, s);
  g.translate(3, -11);
  g.beginPath();
  g.rect(-10, 14, 90, 80);
  g.clip();
  g.strokeStyle = GOLD;
  g.lineWidth = 3;
  g.lineJoin = 'miter';
  g.miterLimit = 12;
  for (const line of W_LINES) {
    const pts = line.split(' ').map((p) => p.split(',').map(Number));
    g.beginPath();
    pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
  }
  g.restore();
  text('WORDTRAIL', M + 104, 132, `600 26px ${sans}`, '#f2f2ef', { stretch: 'expanded', spacing: 7 });
  text('譯跡', M + 104, 166, `500 20px ${sans}`, 'rgba(242,242,239,0.55)', { spacing: 10 });
  text(String(o.year), W - M, 132, `600 26px ${sans}`, GOLD, { stretch: 'expanded', spacing: 12, align: 'right' });
  text(tx('年度回顧', 'YEAR IN REVIEW'), W - M, 166, `600 17px ${sans}`, 'rgba(242,242,239,0.55)', { stretch: 'expanded', spacing: 5, align: 'right' });

  // thick-thin Deco rule
  hline(214, 4, '#f2f2ef');
  hline(224, 1.5, '#f2f2ef');

  text(tx('我的翻譯足跡', 'MY YEAR IN WORDS'), M, 310, `600 24px ${sans}`, GOLD, { stretch: 'expanded', spacing: 7 });
  if (o.name) text(o.name, M, 356, `500 32px ${sans}`, 'rgba(242,242,239,0.7)');

  text(r.totals.words.toLocaleString(getLang() === 'en' ? 'en-US' : 'zh-TW'), M - 8, 560, `500 200px ${sans}`, '#f2f2ef', { spacing: -10 });
  text(tx('個字', 'words translated'), M, 624, `400 38px ${sans}`, 'rgba(242,242,239,0.7)');

  // persona plaque: double frame
  g.strokeStyle = 'rgba(212,179,108,0.75)';
  g.lineWidth = 2;
  g.strokeRect(M, 694, W - M * 2, 190);
  g.strokeStyle = 'rgba(212,179,108,0.3)';
  g.lineWidth = 1.5;
  g.strokeRect(M + 10, 704, W - M * 2 - 20, 170);
  text(tx('譯者人格', 'TRANSLATOR TYPE'), M + 44, 766, `600 20px ${sans}`, GOLD, { stretch: 'expanded', spacing: 6 });
  text(o.persona, M + 44, 842, `600 60px ${sans}`, '#f2f2ef', { spacing: -1 });

  // three figures in a ruled row
  const stats: [string, string][] = [
    [r.totals.jobs.toLocaleString(), tx('案件', 'jobs')],
    [String(r.clients), tx('客戶', 'clients')],
    [String(r.activeDays), tx('工作日', 'active days')],
  ];
  const colW = (W - M * 2) / 3;
  hline(946);
  stats.forEach(([v, l], k) => {
    const x = M + k * colW + (k ? 36 : 0);
    if (k) {
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(M + k * colW, 946, 1.5, 150);
    }
    text(v, x, 1036, `500 84px ${sans}`, '#f2f2ef', { spacing: -3 });
    text(l, x, 1080, `400 28px ${sans}`, 'rgba(242,242,239,0.62)');
  });
  hline(1096);

  if (o.domain) text(tx(`主力領域：${o.domain}`, `Top field: ${o.domain}`), M, 1162, `500 32px ${sans}`, 'rgba(242,242,239,0.82)');

  // footer
  text('WORDTRAIL · 譯跡', M, H - 86, `600 20px ${sans}`, 'rgba(242,242,239,0.45)', { stretch: 'expanded', spacing: 6 });
  // the mark's three strokes, run out as speed lines
  const tw = g.measureText('WORDTRAIL · 譯跡').width;
  g.fillStyle = 'rgba(212,179,108,0.6)';
  [-102, -94, -86].forEach((y, k) => g.fillRect(M + tw + 28, H + y - 7, W - M * 2 - tw - 28, k === 1 ? 2 : 1));
  return c.toDataURL('image/png');
}
