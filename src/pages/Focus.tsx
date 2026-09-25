// Focus mode: a full-screen room for one job. A Deco clock runs the real
// timer, the screen stays awake, and the session ends by logging progress.

import { Pause, Play, Square, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BRAND_GOLD, WGlyph } from '../app/Logo';
import { SunburstRays } from '../app/Stamps';
import { useData } from '../db/data';
import { startTimer, stopTimer } from '../db/repo';
import { jobWords } from '../domain/money';
import { todayPlan } from '../domain/stats';
import { tx } from '../i18n';
import { dueInfo, num } from '../ui/format';
import { cx, Pair } from '../ui/kit';
import { haptic } from '../ui/motion';
import { useUI } from '../ui/store';
import { useSpeed } from '../features/common';
import { LogProgress } from '../features/TodayPlan';

const LENGTHS = [25, 50, 90, 0] as const; // 0 = open-ended

let audio: AudioContext | undefined;
const unlockAudio = () => {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    /* no audio */
  }
};
/** A soft two-note bell, synthesised so there is no asset to load. */
const chime = () => {
  if (!audio) return;
  const t = audio.currentTime;
  [659.25, 987.77].forEach((f, i) => {
    const o = audio!.createOscillator();
    const g = audio!.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + i * 0.18);
    g.gain.exponentialRampToValueAtTime(0.18, t + i * 0.18 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 1.6);
    o.connect(g).connect(audio!.destination);
    o.start(t + i * 0.18);
    o.stop(t + i * 0.18 + 1.7);
  });
};

const useWakeLock = (on: boolean) => {
  useEffect(() => {
    if (!on) return;
    let lock: { release: () => Promise<void> } | undefined;
    let cancelled = false;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    const get = () =>
      nav.wakeLock
        ?.request('screen')
        .then((l) => {
          if (cancelled) void l.release();
          else lock = l;
        })
        .catch(() => undefined);
    void get();
    const onVis = () => document.visibilityState === 'visible' && void get();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release().catch(() => undefined);
    };
  }, [on]);
};

const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
};

export function Focus({ id }: { id: string }) {
  const { jobMap, running, settings, today, jobs } = useData();
  const navigate = useUI((s) => s.navigate);
  const speed = useSpeed();
  const job = jobMap.get(id);
  const [length, setLength] = useState<number>(50);
  const [banked, setBanked] = useState(0); // ms from earlier segments of this session
  const [now, setNow] = useState(() => Date.now());
  const [logging, setLogging] = useState(false);
  const [done, setDone] = useState<{ ms: number; words: number } | null>(null);
  const firedEnd = useRef(false);
  const mine = running?.jobId === id ? running : undefined;
  const elapsed = banked + (mine ? now - mine.start : 0);
  const target = length * 60_000;
  const left = length ? target - elapsed : 0;

  useWakeLock(!!mine);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const prev = document.title;
    document.title = `${mine ? '● ' : ''}${clock(length ? Math.max(0, left) : elapsed)} · Witimemo`;
    return () => {
      document.title = prev;
    };
  }, [mine, left, elapsed, length]);

  const pause = useCallback(async () => {
    if (!mine) return;
    setBanked((b) => b + (Date.now() - mine.start));
    await stopTimer();
  }, [mine]);

  const start = useCallback(async () => {
    unlockAudio();
    haptic(10);
    firedEnd.current = false;
    await startTimer(id);
  }, [id]);

  const finish = useCallback(async () => {
    await pause();
    setLogging(true);
  }, [pause]);

  // the block is over: ring the bell and ask for progress
  useEffect(() => {
    if (!length || !mine || firedEnd.current || left > 0) return;
    firedEnd.current = true;
    chime();
    haptic([20, 80, 20]);
    void finish();
  }, [left, length, mine, finish]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (logging || document.querySelector('[role="dialog"]')) return;
      if (e.key === ' ') {
        e.preventDefault();
        void (mine ? pause() : start());
      } else if (e.key === 'Escape') navigate('/');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mine, pause, start, navigate, logging]);

  const item = useMemo(() => todayPlan(jobs, settings.work, today, speed.wph).items.find((x) => x.job.id === id), [jobs, settings.work, today, speed.wph, id]);

  if (!job) {
    return (
      <div className="on-ink fixed inset-0 z-50 grid place-items-center text-ink" style={{ background: '#0b0b0c' }}>
        <div className="text-center">
          <p className="text-ink-2">{tx('找不到這個案件', 'Job not found')}</p>
          <button type="button" className="btn btn-secondary mt-4" onClick={() => navigate('/')}>
            {tx('回到總覽', 'Back to overview')}
          </button>
        </div>
      </div>
    );
  }

  const estWords = (elapsed / 3_600_000) * speed.wph * (job.unit === 'char' ? 1.6 : 1);
  const leftToday = item ? item.target - item.doneToday : 0;
  const metToday = !!item && item.target > 0 && leftToday <= 0;
  const sessionGoal = item && leftToday > 0 ? Math.min(leftToday, length ? (length / 60) * speed.wph * (job.unit === 'char' ? 1.6 : 1) : Infinity) : undefined;
  const due = dueInfo(job.dueAt, today);
  const frac = length ? Math.min(1, elapsed / target) : (elapsed % 3_600_000) / 3_600_000;
  const R = 150;
  const ticks = Array.from({ length: 60 }, (_, i) => {
    const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
    const long = i % 5 === 0;
    const lit = i / 60 < frac;
    return (
      <line
        key={i}
        x1={170 + Math.cos(a) * (long ? R - 14 : R - 8)}
        y1={170 + Math.sin(a) * (long ? R - 14 : R - 8)}
        x2={170 + Math.cos(a) * R}
        y2={170 + Math.sin(a) * R}
        stroke={lit ? BRAND_GOLD : 'rgb(255 255 255 / 0.16)'}
        strokeWidth={long ? 2 : 1.2}
        style={{ transition: 'stroke .4s' }}
      />
    );
  });

  return (
    <div className="on-ink fixed inset-0 z-50 flex flex-col overflow-hidden text-ink" style={{ background: '#0b0b0c' }}>
      <div className="pointer-events-none absolute inset-0" style={{ animation: 'fadeIn 1.2s ease both' }}>
        <SunburstRays origin="bottom" count={48} opacity={mine ? 0.2 : 0.1} color={BRAND_GOLD} />
      </div>
      <header className="relative flex items-center justify-between px-5 pt-[max(16px,env(safe-area-inset-top))] sm:px-8">
        <span className="flex items-center gap-2.5">
          <WGlyph size={20} color={BRAND_GOLD} stroke={3.6} />
          <span className="font-wide text-[10.5px] tracking-[0.34em] text-ink-2">{tx('專注', 'Focus')}</span>
        </span>
        <button type="button" onClick={() => navigate('/')} className="grid h-10 w-10 place-items-center rounded-[3px] text-ink-2 hover:bg-white/10 hover:text-ink" aria-label={tx('離開專注模式', 'Leave focus mode')}>
          <X size={20} />
        </button>
      </header>

      <main className="relative flex flex-1 flex-col items-center justify-center px-5 pb-6">
        <div className="max-w-[560px] text-center">
          <div className="flex flex-wrap items-center justify-center gap-2 text-[12.5px] text-muted">
            <Pair source={job.sourceLang} target={job.targetLang} />
            {due && <span className={cx(due.tone === 'bad' ? 'text-bad' : due.tone === 'warn' ? 'text-warn' : '')}>{due.text}</span>}
          </div>
          <h1 className="font-display mt-2 text-[24px] leading-tight sm:text-[30px]">{job.title}</h1>
        </div>

        <div className="relative mt-6 grid place-items-center">
          <svg width="340" height="340" viewBox="0 0 340 340" className="max-h-[52vh] max-w-[88vw]" aria-hidden>
            <circle cx="170" cy="170" r="166" fill="none" stroke={BRAND_GOLD} strokeOpacity={0.5} strokeWidth={1.2} />
            <circle cx="170" cy="170" r="160" fill="none" stroke={BRAND_GOLD} strokeOpacity={0.2} strokeWidth={0.8} />
            {ticks}
            <circle cx="170" cy="170" r="118" fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth={1} />
          </svg>
          <div className="absolute inset-0 grid place-items-center">
            <div className="text-center">
              <div className="font-wide text-[10px] tracking-[0.34em] text-gold">{length ? (mine ? tx('剩餘', 'Remaining') : tx('本節', 'Session')) : tx('已專注', 'Focused')}</div>
              <div className="mt-2 font-medium tabular-nums leading-none tracking-[-0.04em] text-ink" style={{ fontSize: 'min(72px, 17vw)' }} role="timer" aria-live="off">
                {clock(length ? Math.max(0, left) : elapsed)}
              </div>
              <div className="mt-3 text-[12.5px] text-ink-2 tnum">
                {elapsed > 60_000 ? tx(`約 ${num(Math.round(estWords))} 字`, `≈ ${num(Math.round(estWords))} words`) : sessionGoal ? tx(`目標 ${num(Math.round(sessionGoal))} 字`, `Goal ${num(Math.round(sessionGoal))} words`) : metToday ? tx('今日目標已完成 ✓', 'Today’s target met ✓') : ' '}
              </div>
            </div>
          </div>
        </div>

        {!mine && elapsed === 0 && (
          <div className="mt-6 inline-flex rounded-[3px] border border-line-strong p-0.5" role="group" aria-label={tx('時間長度', 'Session length')}>
            {LENGTHS.map((l) => (
              <button key={l} type="button" aria-pressed={length === l} onClick={() => setLength(l)} className={cx('h-9 rounded-[2px] px-3.5 text-[13px] font-medium tabular-nums', length === l ? 'bg-gold text-[#0b0b0c]' : 'text-ink-2 hover:text-ink')}>
                {l ? tx(`${l} 分`, `${l} min`) : tx('不限', 'Open')}
              </button>
            ))}
          </div>
        )}

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={() => void (mine ? pause() : start())}
            className="inline-flex h-14 min-w-[168px] items-center justify-center gap-2.5 rounded-[3px] bg-gold px-7 text-[15px] font-semibold text-[#0b0b0c] transition-transform hover:brightness-110 active:scale-[0.98]"
          >
            {mine ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
            {mine ? tx('暫停', 'Pause') : elapsed ? tx('繼續', 'Resume') : tx('開始專注', 'Start focusing')}
          </button>
          {elapsed > 0 && (
            <button type="button" onClick={() => void finish()} className="inline-flex h-14 items-center gap-2 rounded-[3px] border border-line-strong px-6 text-[15px] font-medium text-ink hover:border-ink">
              <Square size={15} fill="currentColor" /> {tx('結束並記錄', 'End & log')}
            </button>
          )}
        </div>

        {item && (
          <div className="mt-8 w-full max-w-[420px]">
            <div className="flex justify-between text-[12px] text-muted">
              <span>{tx('整體進度', 'Overall')}</span>
              <span className="tnum">
                {job.progress ?? 0}% · {tx(`今天目標 ${num(Math.round(item.target))} 字`, `today ${num(Math.round(item.target))} words`)}
              </span>
            </div>
            <div className="mt-2 h-[3px] bg-white/10">
              <div className="h-full bg-gold" style={{ width: `${job.progress ?? 0}%`, transition: 'width .8s' }} />
            </div>
          </div>
        )}
        <p className="mt-6 hidden text-[12px] text-muted sm:block">{tx('空白鍵開始／暫停 · Esc 離開（計時會繼續）', 'Space to start/pause · Esc to leave (the timer keeps running)')}</p>
      </main>

      {logging && (
        <LogProgress
          job={job}
          initial={Math.min(100, Math.round(((job.progress ?? 0) + (jobWords(job) ? (estWords / jobWords(job)) * 100 : 0)) * 10) / 10)}
          onClose={() => setLogging(false)}
          onSaved={(w) => {
            setDone({ ms: elapsed, words: w });
            setBanked(0);
          }}
        />
      )}
      {done && <SessionDone ms={done.ms} words={done.words} unit={job.unit} onAgain={() => setDone(null)} onLeave={() => navigate('/')} />}
    </div>
  );
}

function SessionDone({ ms, words, unit, onAgain, onLeave }: { ms: number; words: number; unit: string; onAgain: () => void; onLeave: () => void }) {
  const pace = ms > 60_000 ? words / (ms / 3_600_000) : 0;
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-[#0b0b0c] p-6" style={{ animation: 'fadeIn .4s ease both' }}>
      <div className="w-full max-w-[380px] border border-gold/60 p-7 text-center" style={{ animation: 'pop .35s ease both' }}>
        <div className="font-wide text-[10.5px] tracking-[0.34em] text-gold">{tx('本節完成', 'Session complete')}</div>
        <div className="mt-4 text-[56px] font-medium leading-none tracking-[-0.04em] tabular-nums">{clock(ms)}</div>
        <div className="mt-6 grid grid-cols-2 border-t border-line-strong">
          <div className="pt-4">
            <div className="text-[24px] font-medium tracking-[-0.02em] tabular-nums">{words > 0 ? `+${num(Math.round(words))}` : '—'}</div>
            <div className="mt-1 text-[12px] text-ink-2">{unit === 'char' ? tx('字', 'chars') : tx('字', 'words')}</div>
          </div>
          <div className="border-l border-line-strong pt-4">
            <div className="text-[24px] font-medium tracking-[-0.02em] tabular-nums">{pace ? num(Math.round(pace)) : '—'}</div>
            <div className="mt-1 text-[12px] text-ink-2">{tx('字／小時', 'per hour')}</div>
          </div>
        </div>
        <div className="mt-7 flex justify-center gap-2">
          <button type="button" onClick={onAgain} className="inline-flex h-11 items-center rounded-[3px] bg-gold px-5 text-[14px] font-semibold text-[#0b0b0c]">
            {tx('再來一節', 'Another session')}
          </button>
          <button type="button" onClick={onLeave} className="inline-flex h-11 items-center rounded-[3px] border border-line-strong px-5 text-[14px] font-medium">
            {tx('回到總覽', 'Back to overview')}
          </button>
        </div>
      </div>
    </div>
  );
}
