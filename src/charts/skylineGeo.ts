// Geometry for the Career Skyline, shared by the live chart and the static
// SVG in the exported portfolio site.

import type { SkylineMonth } from '../domain/stats';

export const PX = 3.5; // window grid pitch
export const PY = 5;
export const WX = 1.05; // window offset inside a grid cell
export const WY = 1.5;

/** Small deterministic PRNG so the same month always lights the same windows. */
export const rng = (seed: string) => {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
};

const crown = (x: number, top: number, w: number, g: number) => {
  const h = g - top;
  const s = Math.min(w * 0.17, 5, h / 6);
  if (w < 6 || h < 24) return { d: `M${x},${g}V${top}H${x + w}V${g}Z`, s: 0 };
  return {
    d: `M${x},${g}V${top + 2 * s}H${x + s}V${top + s}H${x + 2 * s}V${top}H${x + w - 2 * s}V${top + s}H${x + w - s}V${top + 2 * s}H${x + w}V${g}Z`,
    s,
  };
};

export interface Tower {
  i: number;
  x: number;
  w: number;
  top: number;
  scaffoldTop?: number;
  d: string;
  bodyTop: number;
  lit: { x: number; y: number; twinkle: boolean; delay: number }[];
  delay: number;
}

export interface SkylineLayout {
  towers: Tower[];
  record: number;
  groundY: number;
  slot: number;
  offsetX: number;
  gap: number;
  yearMarks: { month: string; x: number }[];
}

export const layoutSkyline = (data: SkylineMonth[], width: number, height: number, opts: { reserveTop?: number; minSlots?: number } = {}): SkylineLayout => {
  const n = data.length;
  const groundY = height - 22;
  const topY = height * (opts.reserveTop ?? 0.36);
  const slots = Math.max(n, opts.minSlots ?? 12);
  const slot = width > 0 ? width / slots : 0;
  const offsetX = n < slots ? (width - slot * n) / 2 : 0;
  const gap = Math.max(1, slot * 0.2);
  const tw = Math.max(2, slot - gap);
  const maxW = Math.max(1, ...data.map((d) => d.words + d.pending));
  const hOf = (w: number) => (w <= 0 ? 0 : Math.max(3, (w / maxW) * (groundY - topY)));
  const record = data.reduce((best, d, i) => (d.words > (data[best]?.words ?? -1) ? i : best), -1);
  const stepDelay = Math.min(28, 900 / Math.max(1, n));

  const towers: Tower[] = !slot
    ? []
    : data.map((d, i) => {
        const x = offsetX + i * slot + gap / 2;
        const h = hOf(d.words);
        const top = groundY - h;
        const { d: path, s } = crown(x, top, tw, groundY);
        const bodyTop = top + 2 * s + 2;
        const delay = i * stepDelay;
        const rand = rng(d.month);
        // candidate windows on the global grid, fully inside the body
        const cells: { x: number; y: number }[] = [];
        if (tw >= 5 && h > 10) {
          const k0 = Math.ceil((x + 1 - WX) / PX);
          const k1 = Math.floor((x + tw - 1 - WX - 1.4) / PX);
          const rows = Math.floor((groundY - 3 - bodyTop) / PY);
          for (let r = 1; r <= rows; r++) for (let k = k0; k <= k1; k++) cells.push({ x: k * PX + WX, y: groundY - r * PY + WY });
        }
        for (let a = cells.length - 1; a > 0; a--) {
          const b = Math.floor(rand() * (a + 1));
          [cells[a], cells[b]] = [cells[b], cells[a]];
        }
        const lit = cells.slice(0, Math.min(cells.length, d.jobs)).map((c) => ({ ...c, twinkle: rand() < 0.18, delay: delay + 650 + rand() * 700 }));
        const scaffoldTop = d.pending > 0 ? groundY - hOf(d.words + d.pending) : undefined;
        return { i, x, w: tw, top, scaffoldTop, d: path, bodyTop, lit, delay };
      });

  const every = slot * 12 < 34 ? 2 : 1;
  const yearMarks = data
    .map((d, i) => ({ d, i }))
    .filter(({ d, i }) => (d.month.endsWith('-01') || i === 0) && Number(d.month.slice(0, 4)) % every === 0)
    .map(({ d, i }) => ({ month: d.month, x: offsetX + i * slot + gap / 2 }));

  return { towers, record, groundY, slot, offsetX, gap, yearMarks };
};
