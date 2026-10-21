// 7.5 量化：只有在有 BPM 時才量化。
// start' = start + strength × (nearestGrid(start) − start)，結束點同理；量化後最少一格長，不可重疊。

import type { Note, QuantizeGrid } from '../types';

export type QuantizeOptions = {
  bpm: number;
  grid: QuantizeGrid;
  strength: number; // 0–1
  /** 第 1 小節第 1 拍在錄音裡的位置（秒）。 */
  origin?: number;
};

/** 一格是幾秒。 */
export function gridSeconds(bpm: number, grid: QuantizeGrid): number {
  const beat = 60 / bpm;
  switch (grid) {
    case '1/4':
      return beat;
    case '1/8':
      return beat / 2;
    case '1/16':
      return beat / 4;
    case '1/8T':
      return beat / 3;
  }
}

export function quantizeNotes<T extends Note>(notes: T[], opts: QuantizeOptions): T[] {
  const g = gridSeconds(opts.bpm, opts.grid);
  const s = Math.max(0, Math.min(1, opts.strength));
  const origin = opts.origin ?? 0;
  const snap = (t: number) => {
    const nearest = origin + Math.round((t - origin) / g) * g;
    return t + s * (nearest - t);
  };

  const out = notes
    .map((n) => {
      const start = Math.max(0, snap(n.start));
      const end = Math.max(snap(n.start + n.dur), start + g); // 最少一格
      return { ...n, start, dur: end - start };
    })
    .sort((a, b) => a.start - b.start);

  // 不可重疊：重疊時截短前一個。兩個音的起點距離不到一格時（比格線還密），
  // 截短會讓前一個短於一格，這時把後一個往後推到「前一個起點 ＋ 一格」。
  for (let i = 1; i < out.length; i++) {
    const prev = out[i - 1];
    const cur = out[i];
    if (cur.start < prev.start + g - 1e-9) {
      const end = cur.start + cur.dur;
      cur.start = prev.start + g;
      cur.dur = Math.max(end - cur.start, g);
    }
    if (prev.start + prev.dur > cur.start) prev.dur = cur.start - prev.start;
  }
  return out;
}
