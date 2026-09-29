// Motion primitives: an odometer for big numbers, a tilt-and-sheen wrapper
// for brass objects, and helpers that wait for the opening sequence.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from './kit';
import { useUI } from './store';

export const reducedMotion = () => {
  try {
    return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

/** Light haptic tick on devices that support it. */
export const haptic = (pattern: number | number[] = 12) => {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignore */
  }
};

/** False while the opening sequence still covers the screen. */
export const useStageLive = () => !useUI((s) => s.overture);

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * Rolls each digit of `text` into place like a mechanical counter.
 * Non-digits (currency, separators) stay put; columns are keyed from the
 * right so a changed value rolls to its new digits instead of remounting.
 */
export function Odometer({ text, className, delay = 0 }: { text: string; className?: string; delay?: number }) {
  const live = useStageLive();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!live) return;
    let r2 = 0;
    const r1 = requestAnimationFrame(() => (r2 = requestAnimationFrame(() => setShown(true))));
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, [live]);
  const chars = [...text];
  const nDigits = chars.filter((c) => c >= '0' && c <= '9').length;
  let di = 0;
  return (
    <span className={cx('odometer', className)} role="img" aria-label={text}>
      {chars.map((ch, i) => {
        const fromRight = chars.length - i;
        if (ch < '0' || ch > '9')
          return (
            <span key={'s' + fromRight} className="odo-static" aria-hidden>
              {ch}
            </span>
          );
        const k = di++;
        return (
          <span key={'d' + fromRight} className="odo-col" aria-hidden>
            <span className="odo-strip" style={{ transform: `translateY(${shown ? -Number(ch) * 10 : 0}%)`, transitionDelay: `${delay + (nDigits - k) * 45}ms` }}>
              {DIGITS.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** Tilts toward the pointer and catches a highlight, like polished brass. */
export function Tilt({ children, className, max = 12 }: { children: ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const set = (x: number, y: number, on: boolean) => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--rx', `${(0.5 - y) * max}deg`);
    el.style.setProperty('--ry', `${(x - 0.5) * max}deg`);
    el.style.setProperty('--mx', `${x * 100}%`);
    el.style.setProperty('--my', `${y * 100}%`);
    if (on) el.dataset.hover = '1';
    else delete el.dataset.hover;
  };
  return (
    <div
      ref={ref}
      className={cx('tilt', className)}
      onPointerMove={(e) => {
        if (e.pointerType === 'touch' || reducedMotion()) return;
        const r = e.currentTarget.getBoundingClientRect();
        set((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, true);
      }}
      onPointerLeave={() => set(0.5, 0.5, false)}
    >
      {children}
      <span className="tilt-sheen" aria-hidden />
    </div>
  );
}

// Keyframes for celebrate(), injected once so the burst needs no stylesheet edits.
const CELEBRATE_CSS = `
.wm-burst{position:fixed;left:50%;top:42%;width:0;height:0;z-index:90;pointer-events:none}
.wm-burst-seal{position:absolute;left:-32px;top:-32px;width:64px;height:64px;border-radius:6px;border:3px solid var(--burst);color:var(--burst);display:grid;place-items:center;font-weight:700;font-size:22px;background:color-mix(in srgb,var(--burst) 10%,transparent);animation:wm-seal .9s cubic-bezier(.2,.8,.3,1) forwards}
.wm-burst-dot{position:absolute;left:-3px;top:-3px;width:6px;height:6px;border-radius:1px;background:var(--burst);animation:wm-dot .7s ease-out forwards}
@keyframes wm-seal{0%{transform:scale(1.8) rotate(-14deg);opacity:0}25%{transform:scale(.94) rotate(-8deg);opacity:1}40%{transform:scale(1) rotate(-8deg)}75%{opacity:1}100%{transform:scale(1) rotate(-8deg);opacity:0}}
@keyframes wm-dot{0%{transform:rotate(var(--a)) translateX(10px);opacity:0}20%{opacity:1}100%{transform:rotate(var(--a)) translateX(64px) scale(.4);opacity:0}}
`;

/** A small seal-stamp burst plus a haptic tick for delivering or getting paid. */
export const celebrate = (kind: 'delivered' | 'paid') => {
  haptic([12, 40, 18]);
  if (reducedMotion() || typeof document === 'undefined') return;
  try {
    if (!document.getElementById('wm-burst-css')) {
      const st = document.createElement('style');
      st.id = 'wm-burst-css';
      st.textContent = CELEBRATE_CSS;
      document.head.appendChild(st);
    }
    const el = document.createElement('div');
    el.className = 'wm-burst';
    el.setAttribute('aria-hidden', 'true');
    el.style.setProperty('--burst', kind === 'paid' ? 'var(--seal)' : 'var(--accent)');
    const seal = document.createElement('span');
    seal.className = 'wm-burst-seal';
    seal.textContent = kind === 'paid' ? '收' : '交';
    el.appendChild(seal);
    for (let i = 0; i < 8; i++) {
      const d = document.createElement('span');
      d.className = 'wm-burst-dot';
      d.style.setProperty('--a', `${i * 45 + 22}deg`);
      el.appendChild(d);
    }
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 900);
  } catch {
    /* ignore */
  }
};
