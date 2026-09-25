import { useId } from 'react';
import { cx } from '../ui/kit';

// The mark: a W drawn in three parallel lines, cut flat at the cap height —
// Art Deco inline lettering that doubles as speed lines.
export const W_LINES = [
  '8.2,2.17 19.54,33.59 32,5.8 44.46,33.59 55.8,2.17',
  '3.12,4 19,48 32,19 45,48 60.88,4',
  '-1.96,5.83 18.46,62.41 32,32.2 45.54,62.41 65.96,5.83',
];

export const BRAND_NAME = 'Witimemo';
export const BRAND_ZH = '記譯';
export const BRAND_TAGLINE = 'Works in Translation & Interpretation';

export const BRAND_INK = '#0b0b0c';
export const BRAND_GOLD = '#d4b36c';

export function WGlyph({ size = 24, color = 'currentColor', stroke = 3, className }: { size?: number; color?: string; stroke?: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size * 0.8} viewBox="-3 11 70 56" className={className} aria-hidden>
      <defs>
        <clipPath id={`w${id}`}>
          <rect x="-10" y="14" width="90" height="80" />
        </clipPath>
      </defs>
      <g clipPath={`url(#w${id})`} fill="none" stroke={color} strokeWidth={stroke} strokeLinejoin="miter" strokeMiterlimit={12}>
        {W_LINES.map((p) => (
          <polyline key={p} points={p} />
        ))}
      </g>
    </svg>
  );
}

/** App-icon tile: brass W on ink, identical in both themes. */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cx('inline-grid shrink-0 place-items-center', className)}
      style={{ width: size, height: size, background: BRAND_INK, borderRadius: size * 0.22, boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.08)' }}
      aria-hidden
    >
      <WGlyph size={size * 0.7} color={BRAND_GOLD} stroke={size < 28 ? 3.6 : 3} />
    </span>
  );
}

/** WITI in gold, MEMO in the text colour: the acronym (Works in Translation & Interpretation) shows in the lettering. */
export function BrandName({ gold = 'var(--gold)', className }: { gold?: string; className?: string }) {
  return (
    <span className={className}>
      <span className="sr-only">{BRAND_NAME}</span>
      <span aria-hidden>
        <span style={{ color: gold }}>WITI</span>MEMO
      </span>
    </span>
  );
}

export function Wordmark({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-3', className)}>
      <LogoMark size={compact ? 28 : 32} />
      <span className="leading-none">
        <BrandName className="font-wide block text-[12.5px] tracking-[0.22em] text-ink" />
        <span className="mt-1 block text-[10.5px] font-medium tracking-[0.42em] text-muted">{BRAND_ZH}</span>
      </span>
    </span>
  );
}
