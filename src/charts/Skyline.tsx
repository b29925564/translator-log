// The Career Skyline: every month of work becomes an Art Deco tower.
// Height is the words delivered that month, each lit window is one job,
// the record month wears a spire, and the current month is still under
// construction when jobs are in progress. Searchlights sweep the sky.

import { useMemo, useState } from 'react';
import { BRAND_GOLD } from '../app/Logo';
import { addMonths, fmtMonth } from '../domain/dates';
import type { SkylineMonth } from '../domain/stats';
import { getLang, tx } from '../i18n';
import { money, num } from '../ui/format';
import { Tip, useWidth } from './charts';
import { layoutSkyline, PX, PY, WX, WY } from './skylineGeo';

const GOLD = BRAND_GOLD;

export function Skyline({
  data,
  height = 260,
  base,
  reserveTop = 0.36,
  minSlots = 12,
}: {
  data: SkylineMonth[];
  height?: number;
  base: string;
  /** Fraction of the height kept clear above the tallest tower (for overlaid text). */
  reserveTop?: number;
  minSlots?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = data.length;
  const lang = getLang();
  const { towers, record, groundY, slot, offsetX, yearMarks } = useMemo(() => layoutSkyline(data, width, height, { reserveTop, minSlots }), [data, width, height, reserveTop, minSlots]);

  const t = hover != null ? towers[hover] : undefined;
  const hd = hover != null ? data[hover] : undefined;
  const beams = [
    { x: width * 0.14, dur: 11, delay: -3, from: '-34deg', to: '18deg' },
    { x: width * 0.8, dur: 13, delay: -8, from: '24deg', to: '-26deg' },
  ];
  const recordMonth = record >= 0 ? data[record] : undefined;
  const summary = recordMonth
    ? tx(
        `職涯天際線：${n} 個月，紀錄月份 ${fmtMonth(recordMonth.month, lang, 'long')}，${num(recordMonth.words)} 字`,
        `Career skyline: ${n} months; record month ${fmtMonth(recordMonth.month, lang, 'long')} with ${num(recordMonth.words)} words`,
      )
    : tx('職涯天際線', 'Career skyline');

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }} onPointerLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={summary} className="hold-motion block overflow-visible">
          <defs>
            <linearGradient id="sk-beam" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor={GOLD} stopOpacity={0.26} />
              <stop offset="1" stopColor={GOLD} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="sk-tower" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#232327" />
              <stop offset="1" stopColor="#121214" />
            </linearGradient>
            <linearGradient id="sk-tower-hi" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#34343a" />
              <stop offset="1" stopColor="#1a1a1d" />
            </linearGradient>
            <pattern id="sk-win" x={0} y={groundY} width={PX} height={PY} patternUnits="userSpaceOnUse">
              <rect x={WX} y={WY} width={1.4} height={2} fill="rgb(255 255 255 / 0.075)" />
            </pattern>
            <clipPath id="sk-ground">
              <rect x={-10} y={-200} width={width + 20} height={groundY + 200} />
            </clipPath>
          </defs>

          {/* searchlights */}
          {beams.map((b, k) => (
            <g
              key={k}
              style={{
                transformOrigin: `${b.x}px ${groundY}px`,
                transformBox: 'view-box',
                animation: `sweep ${b.dur}s ease-in-out ${b.delay}s infinite alternate`,
                ['--from' as string]: b.from,
                ['--to' as string]: b.to,
              }}
            >
              <polygon points={`${b.x - 1.5},${groundY} ${b.x + 1.5},${groundY} ${b.x + 46},${-height * 0.4} ${b.x - 46},${-height * 0.4}`} fill="url(#sk-beam)" />
            </g>
          ))}

          <g clipPath="url(#sk-ground)">
            {towers.map((tw_) => {
              const d = data[tw_.i];
              const isRec = tw_.i === record;
              const on = hover === tw_.i;
              const h = groundY - tw_.top;
              return (
                <g key={d.month} className="sk-rise" style={{ ['--rise' as string]: `${h + 4}px`, animationDelay: `${tw_.delay}ms` }}>
                  {h > 0 && (
                    <>
                      <path d={tw_.d} fill={on ? 'url(#sk-tower-hi)' : 'url(#sk-tower)'} />
                      {tw_.bodyTop < groundY - 3 && tw_.w >= 5 && <rect x={tw_.x + 1} y={tw_.bodyTop} width={tw_.w - 2} height={groundY - 3 - tw_.bodyTop} fill="url(#sk-win)" />}
                      <line x1={tw_.x + 0.5} x2={tw_.x + 0.5} y1={tw_.top + (tw_.w >= 6 ? 4 : 0)} y2={groundY} stroke={GOLD} strokeOpacity={isRec ? 0.7 : on ? 0.6 : 0.22} strokeWidth={1} />
                      {tw_.lit.map((l, k) => (
                        <rect
                          key={k}
                          x={l.x}
                          y={l.y}
                          width={1.4}
                          height={2}
                          fill={GOLD}
                          style={{ animation: `fadeIn .5s ease ${l.delay}ms both${l.twinkle ? `, twinkle ${3 + (k % 4)}s ease-in-out ${(l.delay / 1000 + k * 0.7) % 5}s infinite` : ''}` }}
                        />
                      ))}
                    </>
                  )}
                </g>
              );
            })}
          </g>

          {/* the record month's spire and beacon */}
          {record >= 0 && towers[record] && groundY - towers[record].top > 0 && towers[record].scaffoldTop == null && (
            <g style={{ animation: `fadeIn .6s ease ${towers[record].delay + 900}ms both` }}>
              <line x1={towers[record].x + towers[record].w / 2} x2={towers[record].x + towers[record].w / 2} y1={towers[record].top} y2={towers[record].top - 20} stroke={GOLD} strokeWidth={1.2} />
              <circle cx={towers[record].x + towers[record].w / 2} cy={towers[record].top - 22} r={2.4} fill={GOLD} style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: 'beacon 2.4s ease-in-out infinite' }} />
            </g>
          )}

          {/* this month, still under construction */}
          {towers.map((tw_) => {
            if (tw_.scaffoldTop == null) return null;
            const built = tw_.top;
            const st = tw_.scaffoldTop;
            const mast = tw_.x + tw_.w * 0.7;
            return (
              <g key={'sc' + tw_.i} stroke={GOLD} fill="none" style={{ animation: `fadeIn .8s ease ${tw_.delay + 800}ms both` }}>
                <rect x={tw_.x + 0.5} y={st} width={tw_.w - 1} height={Math.max(0, built - st)} strokeOpacity={0.55} strokeDasharray="2 2" strokeWidth={1} />
                <line x1={mast} x2={mast} y1={st} y2={st - 16} strokeWidth={1} strokeOpacity={0.8} />
                <line x1={mast - 15} x2={mast + 5} y1={st - 16} y2={st - 16} strokeWidth={1} strokeOpacity={0.8} />
                <line x1={mast - 13} x2={mast - 13} y1={st - 16} y2={st - 9} strokeWidth={0.8} strokeOpacity={0.8} />
              </g>
            );
          })}

          {/* ground: a thick-thin Deco rule */}
          <line x1={0} x2={width} y1={groundY + 0.5} y2={groundY + 0.5} stroke={GOLD} strokeOpacity={0.55} strokeWidth={1.2} />
          <line x1={0} x2={width} y1={groundY + 3.5} y2={groundY + 3.5} stroke={GOLD} strokeOpacity={0.2} strokeWidth={1} />
          {yearMarks.map(({ month: ym, x }) => {
            return (
              <g key={ym}>
                <line x1={x} x2={x} y1={groundY + 4} y2={groundY + 9} stroke={GOLD} strokeOpacity={0.4} />
                <text x={x + 3} y={height - 5} fontSize={10} fill="#8a8a90" style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", letterSpacing: '0.08em' }}>
                  {ym.slice(0, 4)}
                </text>
              </g>
            );
          })}

          {/* hit areas */}
          {towers.map((tw_) => (
            <rect
              key={'hit' + tw_.i}
              x={offsetX + tw_.i * slot}
              y={0}
              width={slot}
              height={groundY}
              fill="transparent"
              onPointerEnter={() => setHover(tw_.i)}
              onPointerDown={() => setHover(tw_.i)}
            />
          ))}
        </svg>
      )}
      {t && hd && (
        <Tip
          x={t.x + t.w / 2}
          y={Math.min(t.scaffoldTop ?? t.top, t.top) - (hover === record ? 26 : 4)}
          width={width}
          title={(hd.span && hd.span > 1 ? `${fmtMonth(hd.month, lang, 'long')} – ${fmtMonth(addMonths(hd.month + '-01', hd.span - 1).slice(0, 7), lang, 'short')}` : fmtMonth(hd.month, lang, 'long')) + (hover === record ? tx(' · 紀錄', ' · record') : '')}
          rows={[
            { label: tx('字', 'words'), value: num(hd.words) },
            { label: tx('個案件', 'jobs'), value: num(hd.jobs) },
            { label: tx('收入', 'earned'), value: money(hd.income, base, { compact: true }) },
            ...(hd.pending > 0 ? [{ label: tx('字進行中', 'words in progress'), value: num(Math.round(hd.pending)) }] : []),
          ]}
        />
      )}
    </div>
  );
}
