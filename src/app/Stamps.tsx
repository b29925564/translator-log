// Deco medallions: concentric rings, a sunburst of ticks, text on an arc.
// Used for milestones, the welcome screen and the “paid” moment.

import { useId } from 'react';

export function Medallion({
  top,
  center,
  bottom,
  color = 'var(--gold)',
  size = 120,
  faded = false,
  rays = 48,
}: {
  top: string;
  center: string;
  bottom?: string;
  color?: string;
  size?: number;
  faded?: boolean;
  rays?: number;
}) {
  const id = useId().replace(/:/g, '');
  const ticks = Array.from({ length: rays }, (_, i) => {
    const a = (i / rays) * Math.PI * 2;
    const long = i % 4 === 0;
    const r1 = long ? 36 : 38.5;
    return <line key={i} x1={60 + Math.cos(a) * r1} y1={60 + Math.sin(a) * r1} x2={60 + Math.cos(a) * 42} y2={60 + Math.sin(a) * 42} stroke={color} strokeWidth={long ? 1.2 : 0.7} />;
  });
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" style={{ opacity: faded ? 0.3 : 1 }} role="img" aria-label={`${top} ${center} ${bottom ?? ''}`}>
      <defs>
        <path id={`t${id}`} d="M 12,60 A 48,48 0 0 1 108,60" />
        <path id={`b${id}`} d="M 9,60 A 51,51 0 0 0 111,60" />
      </defs>
      <circle cx="60" cy="60" r="58" fill="none" stroke={color} strokeWidth="1.6" />
      <circle cx="60" cy="60" r="55" fill="none" stroke={color} strokeWidth="0.6" />
      <circle cx="60" cy="60" r="44" fill="none" stroke={color} strokeWidth="0.8" />
      {ticks}
      <circle cx="60" cy="60" r="33" fill="none" stroke={color} strokeWidth="0.8" />
      <text fill={color} style={{ fontFamily: "'Archivo', sans-serif", fontStretch: '125%', fontWeight: 600, fontSize: 7.4, letterSpacing: '0.24em' }}>
        <textPath href={`#t${id}`} startOffset="50%" textAnchor="middle">
          {top}
        </textPath>
      </text>
      {bottom && (
        <text fill={color} style={{ fontFamily: "'Archivo', sans-serif", fontStretch: '125%', fontWeight: 600, fontSize: 6.6, letterSpacing: '0.26em' }}>
          <textPath href={`#b${id}`} startOffset="50%" textAnchor="middle" dominantBaseline="hanging">
            {bottom}
          </textPath>
        </text>
      )}
      <text
        x="60"
        y="61"
        textAnchor="middle"
        dominantBaseline="central"
        fill={color}
        style={{ fontFamily: "'Archivo', 'Noto Sans TC', sans-serif", fontWeight: 600, fontSize: center.length > 5 ? 11 : center.length > 3 ? 14 : 18, letterSpacing: '-0.01em' }}
      >
        {center}
      </text>
    </svg>
  );
}

/** Stepped-corner Deco plaque, e.g. PAID on an invoice. */
export function Plaque({ title, sub, color = 'var(--gold)', width = 170 }: { title: string; sub?: string; color?: string; width?: number }) {
  const step = 'M10 2 H140 V6 H146 V10 H150 V70 H146 V74 H140 V78 H10 V74 H4 V70 H0 V10 H4 V6 H10 Z';
  return (
    <svg width={width} height={width * 0.52} viewBox="-2 0 154 80" role="img" aria-label={`${title} ${sub ?? ''}`}>
      <path d={step} fill="none" stroke={color} strokeWidth="2" />
      <rect x="9" y="11" width="132" height="58" fill="none" stroke={color} strokeWidth="0.8" />
      <text x="75" y={sub ? 42 : 47} textAnchor="middle" fill={color} style={{ fontFamily: "'Archivo', 'Noto Sans TC', sans-serif", fontStretch: '125%', fontWeight: 700, fontSize: 19, letterSpacing: '0.2em' }}>
        {title}
      </text>
      {sub && (
        <text x="75" y="59" textAnchor="middle" fill={color} style={{ fontFamily: "'Geist Mono', monospace", fontSize: 8.5, letterSpacing: '0.2em' }}>
          {sub}
        </text>
      )}
    </svg>
  );
}

/** Radiating hairlines for hero panels and posters (drawn, not a bitmap). */
export function SunburstRays({ count = 36, color = 'var(--gold)', opacity = 0.35, origin = 'bottom' as 'bottom' | 'bottom-right' | 'center' }: { count?: number; color?: string; opacity?: number; origin?: 'bottom' | 'bottom-right' | 'center' }) {
  const ox = origin === 'bottom-right' ? 400 : 200;
  const oy = origin === 'center' ? 200 : 400;
  const span = origin === 'bottom' ? Math.PI : origin === 'bottom-right' ? Math.PI / 2 : Math.PI * 2;
  const start = origin === 'bottom' ? Math.PI : origin === 'bottom-right' ? Math.PI : 0;
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 400 400" preserveAspectRatio={origin === 'bottom-right' ? 'xMaxYMax slice' : 'xMidYMax slice'} aria-hidden style={{ opacity }}>
      {Array.from({ length: count + 1 }, (_, i) => {
        const a = start + (i / count) * span;
        return <line key={i} x1={ox} y1={oy} x2={ox + Math.cos(a) * 700} y2={oy + Math.sin(a) * 700} stroke={color} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />;
      })}
      {[60, 120, 180].map((r) => (
        <circle key={r} cx={ox} cy={oy} r={r} fill="none" stroke={color} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}
