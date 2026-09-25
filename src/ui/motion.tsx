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
