// Passport-style stamps used for milestones and the welcome screen.

export function RoundStamp({ top, center, bottom, color = 'var(--accent)', size = 120, rotate = -8, faded = false }: { top: string; center: string; bottom?: string; color?: string; size?: number; rotate?: number; faded?: boolean }) {
  const id = `arc-${top}-${center}`.replace(/[^a-zA-Z0-9-]/g, '') + Math.round(size);
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" style={{ transform: `rotate(${rotate}deg)`, opacity: faded ? 0.28 : 1 }} aria-label={`${top} ${center} ${bottom ?? ''}`} role="img">
      <defs>
        <path id={id + 't'} d="M 20,60 A 40,40 0 0 1 100,60" />
        <path id={id + 'b'} d="M 16,60 A 44,44 0 0 0 104,60" />
      </defs>
      <circle cx="60" cy="60" r="56" fill="none" stroke={color} strokeWidth="3" />
      <circle cx="60" cy="60" r="49" fill="none" stroke={color} strokeWidth="1.2" />
      <circle cx="60" cy="60" r="30" fill="none" stroke={color} strokeWidth="1.2" />
      <text fontFamily="'IBM Plex Mono', monospace" fontSize="10" fontWeight="600" letterSpacing="2" fill={color}>
        <textPath href={`#${id}t`} startOffset="50%" textAnchor="middle">
          {top}
        </textPath>
      </text>
      {bottom && (
        <text fontFamily="'IBM Plex Mono', monospace" fontSize="9" fontWeight="500" letterSpacing="2" fill={color}>
          <textPath href={`#${id}b`} startOffset="50%" textAnchor="middle" dominantBaseline="hanging">
            {bottom}
          </textPath>
        </text>
      )}
      <text x="60" y="61" textAnchor="middle" dominantBaseline="central" fontFamily="'LXGW WenKai TC', 'IBM Plex Sans', serif" fontWeight="700" fontSize={center.length > 4 ? 13 : 19} fill={color}>
        {center}
      </text>
    </svg>
  );
}

export function RectStamp({ title, sub, color = 'var(--seal)', rotate = 6, width = 150 }: { title: string; sub?: string; color?: string; rotate?: number; width?: number }) {
  return (
    <svg width={width} height={width * 0.56} viewBox="0 0 150 84" style={{ transform: `rotate(${rotate}deg)` }} role="img" aria-label={`${title} ${sub ?? ''}`}>
      <rect x="4" y="4" width="142" height="76" rx="10" fill="none" stroke={color} strokeWidth="4" />
      <rect x="11" y="11" width="128" height="62" rx="6" fill="none" stroke={color} strokeWidth="1.2" />
      <text x="75" y={sub ? 42 : 48} textAnchor="middle" fontFamily="'LXGW WenKai TC', serif" fontWeight="700" fontSize="24" letterSpacing="3" fill={color}>
        {title}
      </text>
      {sub && (
        <text x="75" y="62" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="10" letterSpacing="2" fill={color}>
          {sub}
        </text>
      )}
    </svg>
  );
}
