// Hand-built SVG charts following the house data-viz rules: thin marks,
// 4px rounded data ends, hairline grid, tooltips that never gate values
// (every chart has a table twin), text in ink tokens, never series colours.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { addDays, parseISO } from '../domain/dates';
import { pickAxisLabels } from './axis';
import { getLang, tx } from '../i18n';
import { cx } from '../ui/kit';

export const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)', 'var(--series-6)', 'var(--series-7)', 'var(--series-8)'];

export const useWidth = <T extends HTMLElement>() => {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
};

export const niceTicks = (max: number, count = 4): number[] => {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
};

const tickLabel = (v: number) =>
  new Intl.NumberFormat(getLang() === 'en' ? 'en-US' : 'zh-TW', { notation: v >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(v);

/** Rounded-top bar path: 4px radius at the data end, square at the baseline. */
const barPath = (x: number, y: number, w: number, h: number, r = 4) => {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
};

const hbarPath = (x: number, y: number, w: number, h: number, r = 4) => {
  if (w <= 0) return '';
  const rr = Math.min(r, h / 2, w);
  return `M${x},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h - rr}Q${x + w},${y + h} ${x + w - rr},${y + h}H${x}Z`;
};

// ---------- tooltip ----------

export interface TipRow {
  color?: string;
  label: string;
  value: string;
}

export function Tip({ x, y, title, rows, width }: { x: number; y: number; title: string; rows: TipRow[]; width: number }) {
  const left = Math.min(Math.max(8, x - 90), Math.max(8, width - 188));
  return (
    <div
      className="pointer-events-none absolute z-10 w-[180px] rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px]"
      style={{ left, top: Math.max(0, y - 8), transform: 'translateY(-100%)', boxShadow: 'var(--shadow)' }}
    >
      <div className="mb-1 text-muted">{title}</div>
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          {r.color && <span className="h-0.5 w-3 shrink-0 rounded" style={{ background: r.color }} />}
          <span className="font-semibold text-ink tnum">{r.value}</span>
          <span className="truncate text-muted">{r.label}</span>
        </div>
      ))}
    </div>
  );
}

// ---------- chart card with legend + table twin ----------

export function ChartCard({
  title,
  subtitle,
  legend,
  table,
  children,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  legend?: { label: string; color: string; shape?: 'bar' | 'line' }[];
  table?: { head: string[]; rows: (string | number)[][] };
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className={cx('card p-4 sm:p-5', className)}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
          {subtitle && <div className="mt-0.5 text-[12.5px] text-muted">{subtitle}</div>}
        </div>
        <div className="flex items-center gap-1">
          {action}
          {table && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowTable((s) => !s)} aria-pressed={showTable}>
              {showTable ? tx('圖表', 'Chart') : tx('表格', 'Table')}
            </button>
          )}
        </div>
      </div>
      {legend && legend.length > 1 && !showTable && (
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2">
          {legend.map((l) => (
            <span key={l.label} className="inline-flex items-center gap-1.5">
              {l.shape === 'line' ? (
                <span className="h-0.5 w-3.5 rounded" style={{ background: l.color }} />
              ) : (
                <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: l.color }} />
              )}
              {l.label}
            </span>
          ))}
        </div>
      )}
      {showTable && table ? (
        <div className="max-h-[320px] overflow-auto">
          <table className="w-full text-[13px] tnum">
            <thead>
              <tr className="text-left text-muted">
                {table.head.map((h, i) => (
                  <th key={i} className={cx('pb-2 font-medium', i > 0 && 'text-right')}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i} className="border-t border-line">
                  {r.map((c, j) => (
                    <td key={j} className={cx('py-1.5', j > 0 ? 'text-right text-ink' : 'text-ink-2')}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

// ---------- column chart (months) ----------

export interface ColumnDatum {
  key: string;
  label: string;
  value: number;
  extra?: number; // projected, stacked above
  highlight?: boolean;
}

export function ColumnChart({
  data,
  height = 200,
  format,
  valueLabel,
  extraLabel,
  color = 'var(--series-1)',
  onSelect,
}: {
  data: ColumnDatum[];
  height?: number;
  format: (v: number) => string;
  valueLabel: string;
  extraLabel?: string;
  color?: string;
  onSelect?: (key: string) => void;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padL = 44;
  const padB = 24;
  const padT = 8;
  const plotH = height - padB - padT;
  const max = Math.max(1, ...data.map((d) => d.value + (d.extra || 0)));
  const ticks = niceTicks(max, 4);
  const top = ticks[ticks.length - 1];
  const plotW = Math.max(0, width - padL - 4);
  const slot = data.length ? plotW / data.length : 0;
  const bw = Math.min(24, Math.max(4, slot * 0.62));
  const y = (v: number) => padT + plotH - (v / top) * plotH;
  const labelEvery = slot < 26 ? Math.ceil(26 / slot) : 1;

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={valueLabel}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={width} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--axis)' : 'var(--grid)'} strokeWidth={1} />
              <text x={padL - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--muted)" className="tnum">
                {tickLabel(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx0 = padL + slot * i + (slot - bw) / 2;
            const hv = (d.value / top) * plotH;
            const he = ((d.extra || 0) / top) * plotH;
            const gap = d.value > 0 && d.extra ? 2 : 0;
            return (
              <g
                key={d.key}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover((h) => (h === i ? null : h))}
                onClick={() => onSelect?.(d.key)}
                style={{ cursor: onSelect ? 'pointer' : 'default' }}
              >
                <rect x={padL + slot * i} y={padT} width={slot} height={plotH} fill="transparent" />
                {he > 0 && <path className="grow-bar" d={barPath(cx0, y(d.value + (d.extra || 0)), bw, Math.max(0, he - gap))} fill={color} style={{ opacity: 'var(--extra-alpha, 0.3)', animationDelay: `${i * 40 + 250}ms` }} />}
                {hv > 0 && <path className="grow-bar" style={{ animationDelay: `${i * 40}ms` }} d={he > 0 ? `M${cx0},${y(0)}V${y(d.value)}H${cx0 + bw}V${y(0)}Z` : barPath(cx0, y(d.value), bw, hv)} fill={color} opacity={hover == null || hover === i ? 1 : 0.55} />}
                {(i % labelEvery === 0 || d.highlight) && (
                  <text x={padL + slot * i + slot / 2} y={height - 6} textAnchor="middle" fontSize={11} fill={d.highlight ? 'var(--ink)' : 'var(--muted)'} fontWeight={d.highlight ? 600 : 400}>
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {hover != null && data[hover] && (
        <Tip
          x={padL + slot * hover + slot / 2}
          y={y(data[hover].value + (data[hover].extra || 0))}
          width={width}
          title={data[hover].label}
          rows={[
            { color, label: valueLabel, value: format(data[hover].value) },
            ...(extraLabel && data[hover].extra ? [{ color, label: extraLabel, value: format(data[hover].extra!) }] : []),
          ]}
        />
      )}
    </div>
  );
}

// ---------- horizontal bar list ----------

export interface BarDatum {
  key: string;
  label: ReactNode;
  value: number;
  display: string;
  sub?: ReactNode;
  color?: string;
}

export function BarList({ data, onSelect, color = 'var(--series-1)' }: { data: BarDatum[]; onSelect?: (key: string) => void; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="flex flex-col gap-2.5">
      {data.map((d) => (
        <li key={d.key}>
          <button
            type="button"
            disabled={!onSelect}
            onClick={() => onSelect?.(d.key)}
            className={cx('group block w-full text-left', onSelect && 'cursor-pointer')}
          >
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
              <span className="flex min-w-0 items-center gap-2 truncate text-ink">
                {d.color && <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: d.color }} />}
                <span className="truncate group-hover:underline">{d.label}</span>
              </span>
              <span className="shrink-0 font-medium text-ink tnum">{d.display}</span>
            </div>
            <svg width="100%" height="8" className="block" preserveAspectRatio="none" viewBox="0 0 100 8" aria-hidden>
              <rect x="0" y="0" width="100" height="8" rx="4" fill="var(--surface-3)" />
              <path d={hbarPath(0, 0, Math.max(1.5, (d.value / max) * 100), 8, 3)} fill={d.color ?? color} />
            </svg>
            {d.sub && <div className="mt-1 text-[11.5px] text-muted">{d.sub}</div>}
          </button>
        </li>
      ))}
    </ul>
  );
}

// ---------- line chart ----------

export interface LinePoint {
  key: string;
  label: string;
  value?: number;
}

export function LineChart({ points, height = 180, format, color = 'var(--series-1)', valueLabel }: { points: LinePoint[]; height?: number; format: (v: number) => string; color?: string; valueLabel: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padB = 24;
  const padT = 10;
  const padR = 12;
  const plotH = height - padB - padT;
  const vals = points.map((p) => p.value).filter((v): v is number => v != null);
  const vmax = Math.max(...vals, 0);
  const vmin = Math.min(...vals, vmax);
  const rawSpan = vmax - vmin || Math.abs(vmax) || 1;
  const step = niceTicks(rawSpan, 3)[1] || 1;
  const lo = Math.max(0, Math.floor((vmin - rawSpan * 0.15) / step) * step);
  const hi = Math.ceil((vmax + rawSpan * 0.05) / step) * step || step;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step * 1e-6; t += step) ticks.push(Math.round(t * 1e9) / 1e9);
  const padL = Math.max(36, Math.max(...ticks.map((t) => format(t).length)) * 6.6 + 12);
  const plotW = Math.max(0, width - padL - padR);
  const x = (i: number) => padL + (points.length <= 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => padT + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
  let d = '';
  let started = false;
  points.forEach((p, i) => {
    if (p.value == null) {
      started = false;
      return;
    }
    d += `${started ? 'L' : 'M'}${x(i)},${y(p.value)}`;
    started = true;
  });
  const lastIdx = points.map((p) => p.value != null).lastIndexOf(true);
  const shownLabels = pickAxisLabels(
    points.map((p) => p.label),
    points.map((_, i) => x(i)),
  );
  return (
    <div
      ref={ref}
      className="relative w-full select-none"
      style={{ height }}
      onPointerMove={(e) => {
        const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        const px = e.clientX - r.left;
        let best = 0;
        let bd = Infinity;
        points.forEach((p, i) => {
          if (p.value == null) return;
          const dd = Math.abs(x(i) - px);
          if (dd < bd) {
            bd = dd;
            best = i;
          }
        });
        setHover(best);
      }}
      onPointerLeave={() => setHover(null)}
    >
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={valueLabel}>
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke={i === 0 ? 'var(--axis)' : 'var(--grid)'} />
              <text x={padL - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--muted)" className="tnum">
                {format(t)}
              </text>
            </g>
          ))}
          {vals.length > 0 && <path d={`${d}`} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          {hover != null && points[hover]?.value != null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + plotH} stroke="var(--line-strong)" />}
          {points.map((p, i) =>
            p.value != null && (i === lastIdx || i === hover) ? <circle key={i} cx={x(i)} cy={y(p.value)} r={4.5} fill={color} stroke="var(--surface)" strokeWidth={2} /> : null,
          )}
          {points.map((p, i) =>
            shownLabels.has(i) ? (
              <text key={p.key} x={x(i)} y={height - 6} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} fontSize={11} fill="var(--muted)">
                {p.label}
              </text>
            ) : null,
          )}
          {lastIdx >= 0 && hover == null && (
            <text x={x(lastIdx) - 8} y={y(points[lastIdx].value!) - 10} textAnchor="end" fontSize={12} fontWeight={600} fill="var(--ink)" className="tnum">
              {format(points[lastIdx].value!)}
            </text>
          )}
        </svg>
      )}
      {hover != null && points[hover]?.value != null && (
        <Tip x={x(hover)} y={y(points[hover].value!)} width={width} title={points[hover].label} rows={[{ color, label: valueLabel, value: format(points[hover].value!) }]} />
      )}
    </div>
  );
}

// ---------- calendar heatmap ----------

export function Heatmap({
  daily,
  from,
  to,
  format,
  cell = 15,
}: {
  daily: Map<string, number>;
  from: string;
  to: string;
  format: (v: number, date: string) => string;
  cell?: number;
}) {
  const [hover, setHover] = useState<{ x: number; y: number; d: string; v: number } | null>(null);
  const [ref, width] = useWidth<HTMLDivElement>();
  const scroller = useRef<HTMLDivElement>(null);
  const start = (() => {
    const d = parseISO(from);
    const shift = (d.getDay() + 6) % 7; // weeks start Monday
    return addDays(from, -shift);
  })();
  const weeks: string[][] = [];
  let cur = start;
  while (cur <= to) {
    const w: string[] = [];
    for (let i = 0; i < 7; i++) {
      w.push(cur);
      cur = addDays(cur, 1);
    }
    weeks.push(w);
  }
  const vals = [...daily.entries()].filter(([d, v]) => d >= from && d <= to && v > 0).map(([, v]) => v).sort((a, b) => a - b);
  const q = (p: number) => (vals.length ? vals[Math.min(vals.length - 1, Math.floor(p * (vals.length - 1)))] : 0);
  const cuts = [q(0.2), q(0.4), q(0.6), q(0.8), q(0.95)];
  const level = (v: number) => (v <= 0 ? 0 : v <= cuts[0] ? 1 : v <= cuts[1] ? 2 : v <= cuts[2] ? 3 : v <= cuts[3] ? 4 : v <= cuts[4] ? 5 : 6);
  const gap = 3;
  const labelW = 22;
  const size = width > 0 ? Math.max(10, Math.min(cell, Math.floor((width - labelW) / weeks.length) - gap)) : cell;
  const svgW = labelW + weeks.length * (size + gap);
  const svgH = 16 + 7 * (size + gap);
  const monthFmt = new Intl.DateTimeFormat(getLang() === 'en' ? 'en-US' : 'zh-TW', { month: 'short' });
  const dayLabels = getLang() === 'en' ? ['Mon', '', 'Wed', '', 'Fri', '', ''] : ['一', '', '三', '', '五', '', ''];
  const firstMonthWeek = weeks.findIndex((w) => w.some((d) => d.endsWith('-01')));
  const monthLabels = weeks
    .map((w, wi) => {
      const first = w.find((d) => d.endsWith('-01'));
      if (first) return { wi, d: first };
      if (wi === 0 && (firstMonthWeek < 0 || firstMonthWeek >= 3)) return { wi, d: w[w.length - 1] };
      return null;
    })
    .filter(Boolean) as { wi: number; d: string }[];
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [width, from, to]);
  return (
    <div ref={ref} className="relative w-full">
      <div ref={scroller} className="overflow-x-auto">
        <svg width={svgW} height={svgH} role="img" aria-label={tx('每日翻譯字數', 'Daily words translated')}>
          {monthLabels.map(({ wi, d }) => (
            <text key={'m' + wi} x={labelW + wi * (size + gap)} y={10} fontSize={10.5} fill="var(--muted)">
              {monthFmt.format(parseISO(d))}
            </text>
          ))}
          {dayLabels.map((l, i) =>
            l ? (
              <text key={i} x={0} y={16 + i * (size + gap) + size - 2} fontSize={10} fill="var(--muted)">
                {l}
              </text>
            ) : null,
          )}
          {weeks.map((w, wi) =>
            w.map((d, di) => {
              if (d < from || d > to) return null;
              const v = daily.get(d) || 0;
              const x = labelW + wi * (size + gap);
              const y = 16 + di * (size + gap);
              return (
                <rect
                  key={d}
                  x={x}
                  y={y}
                  width={size}
                  height={size}
                  rx={2.5}
                  fill={`var(--heat-${level(v)})`}
                  stroke={hover?.d === d ? 'var(--ink)' : 'none'}
                  strokeWidth={1.5}
                  onPointerEnter={() => setHover({ x: x + size / 2 - (scroller.current?.scrollLeft ?? 0), y, d, v })}
                  onPointerLeave={() => setHover(null)}
                />
              );
            }),
          )}
        </svg>
      </div>
      <div className="mt-2 flex items-center justify-end gap-1.5 text-[11px] text-muted">
        {tx('少', 'Less')}
        {[0, 1, 2, 3, 4, 5, 6].map((l) => (
          <span key={l} className="h-2.5 w-2.5 rounded-[2px]" style={{ background: `var(--heat-${l})` }} />
        ))}
        {tx('多', 'More')}
      </div>
      {hover && <Tip x={hover.x} y={hover.y} width={Math.max(width, 200)} title={hover.d} rows={[{ label: '', value: format(hover.v, hover.d) }]} />}
    </div>
  );
}

// ---------- workload (capacity) ----------

export interface LoadDatum {
  date: string;
  hours: number;
  capacity: number;
  extra?: number;
}

export function LoadChart({ data, height = 150, onHover }: { data: LoadDatum[]; height?: number; onHover?: (d: LoadDatum | null) => void }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padL = 30;
  const padB = 30;
  const padT = 8;
  const plotH = height - padB - padT;
  const max = Math.max(8, ...data.map((d) => Math.max(d.capacity, d.hours + (d.extra || 0))));
  const top = niceTicks(max, 2).pop()!;
  const plotW = Math.max(0, width - padL);
  const slot = data.length ? plotW / data.length : 0;
  const bw = Math.min(22, slot * 0.64);
  const y = (v: number) => padT + plotH - (v / top) * plotH;
  const wd = new Intl.DateTimeFormat(getLang() === 'en' ? 'en-US' : 'zh-TW', { weekday: 'narrow' });
  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={tx('未來兩週工作負荷', 'Workload for the next two weeks')}>
          {[0, top / 2, top].map((t) => (
            <g key={t}>
              <line x1={padL} x2={width} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--axis)' : 'var(--grid)'} />
              <text x={padL - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10.5} fill="var(--muted)" className="tnum">
                {t}h
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x0 = padL + slot * i + (slot - bw) / 2;
            const base = Math.min(d.hours, d.capacity || d.hours);
            const over = Math.max(0, d.hours - d.capacity);
            const extra = d.extra || 0;
            const weekend = d.capacity === 0;
            const hb = (base / top) * plotH;
            const ho = (over / top) * plotH;
            const he = (extra / top) * plotH;
            return (
              <g
                key={d.date}
                onPointerEnter={() => {
                  setHover(i);
                  onHover?.(d);
                }}
                onPointerLeave={() => {
                  setHover(null);
                  onHover?.(null);
                }}
              >
                <rect x={padL + slot * i} y={padT} width={slot} height={plotH} fill={weekend ? 'var(--surface-2)' : 'transparent'} />
                {d.capacity > 0 && <line x1={x0 - 3} x2={x0 + bw + 3} y1={y(d.capacity)} y2={y(d.capacity)} stroke="var(--ink-2)" strokeWidth={1.5} />}
                {hb > 0 && <path d={over || extra ? `M${x0},${y(0)}V${y(base)}H${x0 + bw}V${y(0)}Z` : barPath(x0, y(base), bw, hb)} fill="var(--series-1)" />}
                {ho > 0 && <path d={extra ? `M${x0},${y(base) - 2}V${y(base + over)}H${x0 + bw}V${y(base) - 2}Z` : barPath(x0, y(base + over), bw, Math.max(0, ho - 2))} fill="var(--bad)" />}
                {he > 0 && <path d={barPath(x0, y(d.hours + extra), bw, Math.max(0, he - 2))} fill="var(--series-1)" opacity={0.35} />}
                <text x={x0 + bw / 2} y={height - 16} textAnchor="middle" fontSize={10.5} fill={i === 0 ? 'var(--ink)' : 'var(--muted)'} fontWeight={i === 0 ? 600 : 400}>
                  {wd.format(parseISO(d.date))}
                </text>
                <text x={x0 + bw / 2} y={height - 3} textAnchor="middle" fontSize={10} fill="var(--muted)" className="tnum">
                  {d.date.slice(8)}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      {hover != null && data[hover] && (
        <Tip
          x={padL + slot * hover + slot / 2}
          y={y(Math.max(data[hover].hours + (data[hover].extra || 0), data[hover].capacity))}
          width={width}
          title={data[hover].date}
          rows={[
            { color: 'var(--series-1)', label: tx('已排工時', 'Booked'), value: `${Math.round(data[hover].hours * 10) / 10}h` },
            ...(data[hover].extra ? [{ color: 'var(--series-1)', label: tx('新案件', 'New job'), value: `${Math.round(data[hover].extra! * 10) / 10}h` }] : []),
            { label: tx('可用工時', 'Capacity'), value: `${data[hover].capacity}h` },
          ]}
        />
      )}
    </div>
  );
}

// ---------- sparkline ----------

export function Sparkline({ values, width = 96, height = 28, color = 'var(--series-1)' }: { values: number[]; width?: number; height?: number; color?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const x = (i: number) => 2 + (i / (values.length - 1)) * (width - 4);
  const y = (v: number) => 2 + (height - 4) - ((v - min) / (max - min || 1)) * (height - 4);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join('');
  const area = `${d}L${x(values.length - 1)},${height}L${x(0)},${height}Z`;
  return (
    <svg width={width} height={height} aria-hidden className="overflow-visible">
      <path d={area} fill={color} opacity={0.1} />
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={3.5} fill={color} stroke="var(--surface)" strokeWidth={2} />
    </svg>
  );
}

// ---------- aging bar (status-coloured segments) ----------

export function SegmentBar({ parts }: { parts: { key: string; value: number; color: string; label: string; display: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (!total) return <div className="h-2.5 rounded-[2px] bg-surface-3" />;
  let acc = 0;
  return (
    <div>
      <svg width="100%" height="12" viewBox="0 0 100 12" preserveAspectRatio="none" className="block" aria-hidden>
        {parts.map((p, i) => {
          const w = (p.value / total) * 100;
          const x = acc;
          acc += w;
          if (w <= 0) return null;
          const gap = i < parts.length - 1 && acc < 99.99 ? 0.6 : 0;
          return <rect key={p.key} x={x} y={0} width={Math.max(0.4, w - gap)} height={12} fill={p.color} rx={0} />;
        })}
      </svg>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px] sm:grid-cols-4">
        {parts.map((p) => (
          <div key={p.key} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: p.color }} />
            <span className="truncate text-muted">{p.label}</span>
            <span className="ml-auto font-medium text-ink tnum">{p.display}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const monthLabel = (key: string, style: 'short' | 'narrow' = 'short') =>
  new Intl.DateTimeFormat(getLang() === 'en' ? 'en-US' : 'zh-TW', { month: style }).format(parseISO(key + '-01'));

