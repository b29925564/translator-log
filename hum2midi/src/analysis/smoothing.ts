// 7.2 平滑：Hz → 連續音高（midiFloat）、有聲區間內 5 幀中位數濾波、八度錯誤修正。
// 無聲幀一律用 NaN 表示。

import type { PitchFrame } from '../types';

export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function toMidiFloat(frames: PitchFrame[]): Float64Array {
  const out = new Float64Array(frames.length);
  for (let i = 0; i < frames.length; i++) {
    const hz = frames[i].hz;
    out[i] = hz === null ? NaN : hzToMidi(hz);
  }
  return out;
}

/** 連續有聲區間 [start, end)（end 不含）。 */
export function voicedRuns(x: ArrayLike<number>): [number, number][] {
  const runs: [number, number][] = [];
  let start = -1;
  for (let i = 0; i <= x.length; i++) {
    const voiced = i < x.length && !Number.isNaN(x[i]);
    if (voiced && start < 0) start = i;
    else if (!voiced && start >= 0) {
      runs.push([start, i]);
      start = -1;
    }
  }
  return runs;
}

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** 每段連續有聲區間內做 width 幀的中位數濾波（區間邊緣用可取得的幀，不跨越無聲幀）。 */
export function medianFilterRuns(x: Float64Array, width = 5): Float64Array {
  const out = Float64Array.from(x);
  const half = width >> 1;
  for (const [s, e] of voicedRuns(x)) {
    for (let i = s; i < e; i++) {
      const win: number[] = [];
      for (let j = Math.max(s, i - half); j <= Math.min(e - 1, i + half); j++) win.push(x[j]);
      out[i] = median(win);
    }
  }
  return out;
}

const OCTAVE_TOL = 0.6;

/**
 * 八度錯誤修正：一小段（≤ maxFrames 幀）與前後兩側都相差約 ±12 半音（|Δ ∓ 12| < 0.6），就平移 12 回來。
 * 前後兩側的比較跨越 ≤ maxGap 幀的短暫無聲（偵測器在八度跳動處常常會掉幾幀）。
 */
export function fixOctaveErrors(x: Float64Array, maxFrames = 6, maxGap = 3): Float64Array {
  const out = Float64Array.from(x);
  const idx: number[] = [];
  for (let i = 0; i < out.length; i++) if (!Number.isNaN(out[i])) idx.push(i);

  let k = 1;
  while (k < idx.length) {
    const prev = idx[k - 1];
    const cur = idx[k];
    const d = out[cur] - out[prev];
    const s = Math.sign(d);
    if (cur - prev - 1 > maxGap || Math.abs(Math.abs(d) - 12) >= OCTAVE_TOL) {
      k++;
      continue;
    }
    // 找出這一小段：從 cur 開始，持續停在「前一側 ±12」附近的幀
    const target = out[prev] + 12 * s;
    let m = k;
    while (m < idx.length && Math.abs(out[idx[m]] - target) < OCTAVE_TOL && (m === k || idx[m] - idx[m - 1] - 1 <= maxGap)) m++;
    const segStart = idx[k];
    const segEnd = idx[m - 1];
    const after = m < idx.length ? idx[m] : -1;
    const span = segEnd - segStart + 1;
    if (span <= maxFrames && after >= 0 && after - segEnd - 1 <= maxGap) {
      const seg = idx.slice(k, m).map((i) => out[i]);
      const segMed = median(seg);
      const bothSides =
        Math.abs(segMed - out[prev] - 12 * s) < OCTAVE_TOL && Math.abs(segMed - out[after] - 12 * s) < OCTAVE_TOL;
      if (bothSides) for (let j = k; j < m; j++) out[idx[j]] -= 12 * s;
    }
    k = m;
  }
  return out;
}

/** 7.2 全部步驟：Hz → midiFloat → 中位數濾波 → 八度修正。 */
export function smoothPitch(frames: PitchFrame[]): Float64Array {
  return fixOctaveErrors(medianFilterRuns(toMidiFloat(frames), 5));
}
