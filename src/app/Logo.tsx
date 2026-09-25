import { cx } from '../ui/kit';

/** The seal mark: 譯 inside a rounded passport-stamp square with a trail of dots. */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={cx('shrink-0', className)} aria-hidden>
      <rect x="2" y="2" width="60" height="60" rx="16" fill="var(--accent)" />
      <rect x="7" y="7" width="50" height="50" rx="11" fill="none" stroke="var(--accent-ink)" strokeOpacity="0.35" strokeWidth="1.5" />
      <text
        x="32"
        y="33"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="'LXGW WenKai TC', 'PingFang TC', 'Noto Sans TC', serif"
        fontWeight="700"
        fontSize="32"
        fill="var(--accent-ink)"
      >
        譯
      </text>
      <circle cx="47" cy="50" r="2" fill="var(--accent-ink)" opacity="0.9" />
      <circle cx="52.5" cy="45" r="1.5" fill="var(--accent-ink)" opacity="0.6" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-2.5', className)}>
      <LogoMark size={30} />
      <span className="leading-none">
        <span className="font-display block text-[19px] text-ink">譯跡</span>
        <span className="mt-0.5 block font-mono text-[9.5px] uppercase tracking-[0.18em] text-muted">Wordtrail</span>
      </span>
    </span>
  );
}
