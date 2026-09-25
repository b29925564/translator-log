// The opening sequence: brass lines draw the W on a pair of Deco elevator
// doors, which then part to reveal the app. Plays once per browser session,
// never under reduced motion, and any tap or key skips it.

import { useCallback, useEffect, useRef, useState } from 'react';
import { tx } from '../i18n';
import { reducedMotion } from '../ui/motion';
import { useUI } from '../ui/store';
import { BRAND_GOLD, BRAND_INK, BRAND_ZH, BrandName, W_LINES } from './Logo';

const KEY = 'wt-overture';

let decided: boolean | undefined;
const shouldPlay = () => {
  if (decided !== undefined) return decided;
  decided = !reducedMotion();
  try {
    if (sessionStorage.getItem(KEY)) decided = false;
    else sessionStorage.setItem(KEY, '1');
  } catch {
    /* storage blocked: play once per page load */
  }
  return decided;
};

const DRAW_MS = 1750; // doors stay shut at least this long
const OPEN_MS = 950;

export function Overture({ ready }: { ready: boolean }) {
  const [phase, setPhase] = useState<'shut' | 'open' | 'gone'>(() => (shouldPlay() ? 'shut' : 'gone'));
  const [minDone, setMinDone] = useState(false);
  const opened = useRef(false);

  const open = useCallback(() => {
    if (opened.current) return;
    opened.current = true;
    setPhase('open');
    delete document.documentElement.dataset.overture;
    useUI.setState({ overture: false });
    window.setTimeout(() => setPhase('gone'), OPEN_MS + 50);
  }, []);

  useEffect(() => {
    if (phase === 'gone') return;
    document.documentElement.dataset.overture = '1';
    useUI.setState({ overture: true });
    const t = window.setTimeout(() => setMinDone(true), DRAW_MS);
    return () => {
      window.clearTimeout(t);
      delete document.documentElement.dataset.overture;
    };
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase === 'shut' && minDone && ready) open();
  }, [phase, minDone, ready, open]);

  useEffect(() => {
    if (phase !== 'shut') return;
    const skip = () => ready && open();
    window.addEventListener('keydown', skip);
    return () => window.removeEventListener('keydown', skip);
  }, [phase, ready, open]);

  if (phase === 'gone') return null;
  const isOpen = phase === 'open';

  return (
    <div className="fixed inset-0 z-[200] overflow-hidden" onClick={() => ready && open()} aria-hidden={isOpen} role="presentation">
      {(['left', 'right'] as const).map((side) => (
        <div
          key={side}
          className="absolute inset-y-0 w-1/2 overflow-hidden"
          style={{
            [side]: 0,
            transform: isOpen ? `translateX(${side === 'left' ? '-101%' : '101%'})` : 'none',
            transition: `transform ${OPEN_MS}ms cubic-bezier(.76,0,.18,1)`,
            boxShadow: isOpen ? '0 0 80px rgb(0 0 0 / 0.6)' : undefined,
          }}
        >
          <div className="absolute inset-y-0 w-[100vw]" style={{ left: side === 'left' ? 0 : '-50vw', background: BRAND_INK }}>
            <DoorArt />
          </div>
        </div>
      ))}
      {/* the crack of light where the doors meet */}
      {!isOpen && (
        <div
          className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2"
          style={{ background: `linear-gradient(180deg, transparent, ${BRAND_GOLD} 30%, ${BRAND_GOLD} 70%, transparent)`, animation: 'seamIn 1.4s ease .5s both' }}
        />
      )}
      <span className="sr-only">{tx('記譯 Witimemo 載入中', 'Witimemo is opening')}</span>
    </div>
  );
}

function DoorArt() {
  const rays = 44;
  return (
    <div className="absolute inset-0">
      {/* fan of rays rising from the threshold, etched into both doors */}
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMax slice" aria-hidden style={{ transformOrigin: '50% 100%', animation: 'raysIn 1.6s cubic-bezier(.2,.8,.2,1) .15s both' }}>
        <g stroke={BRAND_GOLD} strokeOpacity={0.22} fill="none">
          {Array.from({ length: rays + 1 }, (_, i) => {
            const a = Math.PI + (i / rays) * Math.PI;
            return <line key={i} x1={500} y1={1000} x2={500 + Math.cos(a) * 1500} y2={1000 + Math.sin(a) * 1500} strokeWidth={0.9} vectorEffect="non-scaling-stroke" />;
          })}
          {[180, 330, 480].map((r) => (
            <circle key={r} cx={500} cy={1000} r={r} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
        </g>
      </svg>
      {/* inset door frames */}
      <div className="absolute inset-4 border sm:inset-6" style={{ borderColor: 'rgb(212 179 108 / 0.35)', animation: 'fadeIn 1s ease .2s both' }} />
      <div className="absolute inset-[22px] border sm:inset-[32px]" style={{ borderColor: 'rgb(212 179 108 / 0.14)', animation: 'fadeIn 1s ease .35s both' }} />
      {/* the mark */}
      <div className="absolute inset-0 grid place-items-center">
        <div className="flex flex-col items-center">
          <svg width="132" height="106" viewBox="-3 11 70 56" aria-hidden>
            <defs>
              <clipPath id="ov-clip">
                <rect x="-10" y="14" width="90" height="80" />
              </clipPath>
            </defs>
            <g clipPath="url(#ov-clip)" fill="none" stroke={BRAND_GOLD} strokeWidth={2.6} strokeLinejoin="miter" strokeMiterlimit={12}>
              {W_LINES.map((p, i) => (
                <polyline
                  key={p}
                  points={p}
                  pathLength={1}
                  style={{ strokeDasharray: 1, ['--len' as string]: 1, animation: `drawLine .8s cubic-bezier(.65,0,.35,1) ${0.1 + i * 0.16}s both` }}
                />
              ))}
            </g>
          </svg>
          <div className="font-wide mt-7 text-[16px] text-[#f2f2ef]" style={{ animation: 'trackIn 1.1s cubic-bezier(.2,.8,.2,1) .55s both' }}>
            <BrandName gold={BRAND_GOLD} />
          </div>
          <div className="mt-2 text-[12px] tracking-[0.6em] text-[#8a8a90]" style={{ animation: 'fadeIn .8s ease .85s both' }}>
            {BRAND_ZH}
          </div>
          <div className="mt-6 h-[5px] w-[180px] border-y" style={{ borderColor: BRAND_GOLD, borderTopWidth: 2, animation: 'ruleIn .9s cubic-bezier(.2,.8,.2,1) .7s both' }} />
        </div>
      </div>
    </div>
  );
}
