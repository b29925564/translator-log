// Project timeline: one row per part, the bar spans received → due and fills
// with completion. One hue only; state reads from fill (done / in progress)
// versus a dashed outline (not yet confirmed), plus text in the tooltip and
// the parts list below, which is this chart's table twin.

import { useMemo, useState } from 'react';
import { addDays, diffDays, eachDay, parseISO } from '../domain/dates';
import { getLang, tx } from '../i18n';
import { Tip, useWidth } from './charts';

export interface TimelineRow {
  key: string;
  label: string;
  start: string;
  end: string;
  /** 0–1 */
  progress: number;
  state: 'done' | 'active' | 'planned';
  overdue?: boolean;
  status: string;
}

const COLOR = 'var(--series-1)';

export function Timeline({ rows, today, deadline, onSelect }: { rows: TimelineRow[]; today: string; deadline?: string; onSelect?: (key: string) => void }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const narrow = width < 560;
  const labelW = narrow ? 92 : 150;
  const rowH = 32;
  const barH = 12;
  const top = 26;
  const height = top + rows.length * rowH + 8;
  const lang = getLang();

  const range = useMemo(() => {
    const dates = [...rows.flatMap((r) => [r.start, r.end]), today, ...(deadline ? [deadline] : [])].sort();
    return { from: addDays(dates[0], -2), to: addDays(dates[dates.length - 1], 3) };
  }, [rows, today, deadline]);
  const days = Math.max(1, diffDays(range.from, range.to));
  const plotW = Math.max(0, width - labelW - 8);
  const x = (d: string) => labelW + (diffDays(range.from, d) / days) * plotW;

  const ticks = useMemo(() => {
    // month starts when the span is long, Mondays when it is short
    const all = eachDay(range.from, range.to);
    const monthly = days > 75;
    return all.filter((d) => (monthly ? d.endsWith('-01') : parseISO(d).getDay() === 1));
  }, [range, days]);
  const fmt = new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'zh-TW', days > 75 ? { month: 'short' } : { month: 'numeric', day: 'numeric' });

  const h = hover != null ? rows[hover] : undefined;
  const summary = tx(`${rows.length} 個部分的時程`, `Schedule of ${rows.length} parts`);

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }} onPointerLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={summary}>
          {/* grid */}
          {ticks.map((d) => {
            // date labels give way to the Today and deadline labels
            const tx0 = x(d);
            const clash = Math.abs(tx0 - x(today)) < 34 || (deadline && tx0 > x(deadline) - 64 && tx0 < x(deadline) + 34);
            return (
              <g key={d}>
                <line x1={tx0} x2={tx0} y1={top - 4} y2={height - 4} stroke="var(--grid)" strokeWidth={1} />
                {!clash && (
                  <text x={tx0 + 3} y={top - 10} fontSize={10.5} fill="var(--muted)" className="tnum">
                    {fmt.format(parseISO(d))}
                  </text>
                )}
              </g>
            );
          })}
          {rows.map((r, i) => {
            const y = top + i * rowH;
            const x0 = x(r.start);
            const w = Math.max(6, x(r.end) - x0 + plotW / days);
            const fill = r.state === 'done' ? 1 : r.state === 'active' ? r.progress : 0;
            const on = hover === i;
            return (
              <g key={r.key} onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)} onClick={() => onSelect?.(r.key)} style={{ cursor: onSelect ? 'pointer' : 'default' }}>
                <rect x={0} y={y} width={width} height={rowH} fill={on ? 'var(--surface-2)' : 'transparent'} />
                <text x={0} y={y + rowH / 2} dy="0.34em" fontSize={narrow ? 11.5 : 12.5} fill="var(--ink)" fontWeight={on ? 600 : 400}>
                  {r.label.length > (narrow ? 8 : 16) ? r.label.slice(0, narrow ? 7 : 15) + '…' : r.label}
                </text>
                {r.state === 'planned' ? (
                  <rect x={x0 + 0.5} y={y + (rowH - barH) / 2 + 0.5} width={w - 1} height={barH - 1} rx={3} fill="none" stroke={COLOR} strokeWidth={1.2} strokeDasharray="3 2.5" />
                ) : (
                  <>
                    <rect x={x0} y={y + (rowH - barH) / 2} width={w} height={barH} rx={3} fill={COLOR} opacity={0.22} />
                    {fill > 0 && <rect className="grow-x" x={x0} y={y + (rowH - barH) / 2} width={Math.max(4, w * fill)} height={barH} rx={3} fill={COLOR} style={{ animationDelay: `${i * 60}ms` }} />}
                  </>
                )}
                {r.state === 'active' && !narrow && (
                  <text x={x0 + w + 6} y={y + rowH / 2} dy="0.34em" fontSize={11} fill={r.overdue ? 'var(--bad)' : 'var(--muted)'} className="tnum">
                    {Math.round(r.progress * 100)}%{r.overdue ? ` · ${tx('逾期', 'late')}` : ''}
                  </text>
                )}
              </g>
            );
          })}
          {/* today and the final deadline */}
          <line x1={x(today)} x2={x(today)} y1={top - 6} y2={height - 4} stroke="var(--gold)" strokeWidth={1.5} />
          <text x={x(today)} y={11} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="var(--ink)">
            {tx('今天', 'Today')}
          </text>
          {deadline && (
            <g>
              <line x1={x(deadline)} x2={x(deadline)} y1={top - 6} y2={height - 4} stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="4 3" />
              <text x={x(deadline) - 4} y={11} textAnchor="end" fontSize={10.5} fontWeight={600} fill="var(--ink)">
                {tx('最終截稿', 'Final deadline')}
              </text>
            </g>
          )}
        </svg>
      )}
      {h && hover != null && (
        <Tip
          x={Math.min(x(h.end), Math.max(x(h.start), labelW + 90))}
          y={top + hover * rowH + 4}
          width={width}
          title={h.label}
          rows={[
            { label: tx('狀態', 'status'), value: h.status },
            { label: tx('期間', 'dates'), value: `${fmt.format(parseISO(h.start))} – ${fmt.format(parseISO(h.end))}` },
            ...(h.state === 'active' ? [{ label: tx('完成', 'done'), value: `${Math.round(h.progress * 100)}%` }] : []),
          ]}
        />
      )}
    </div>
  );
}
