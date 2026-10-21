// 9. 說話音節切分：說話的音高會一直滑，不能用哼唱的切法；改用能量包絡找音節核心。
//   1. RMS 包絡用 20 ms 窗平滑。
//   2. 找峰值：峰間距 ≥ 120 ms、峰值 > noiseFloor × 4。每個峰值 ≈ 一個音節。
//   3. 音節邊界 = 相鄰峰之間 RMS 最低點。
//   4. 每個音節的音高 = 峰值周圍有聲幀中間 50% 的 midiFloat 中位數（呼叫端先套調音偏移）。

import { median } from './smoothing';

export type Syllable = {
  peak: number; // 幀索引
  from: number; // 音節範圍 [from, to)（幀）
  to: number;
  start: number; // 秒：音節裡第一個有聲幀
  end: number; // 秒：最後一個有聲幀的結尾
  pitch: number; // midiFloat
};

export type SpeechSegmentParams = { hop: number; noiseFloor: number };

const SMOOTH_SEC = 0.02;
const MIN_PEAK_GAP_SEC = 0.12;
const PEAK_FLOOR_RATIO = 4;

/** 置中的移動平均（窗長 width 幀）。 */
export function smoothEnvelope(rms: ArrayLike<number>, width: number): Float64Array {
  const out = new Float64Array(rms.length);
  const half = Math.floor(width / 2);
  for (let i = 0; i < rms.length; i++) {
    let s = 0;
    let n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(rms.length - 1, i + half); j++) {
      s += rms[j];
      n++;
    }
    out[i] = s / n;
  }
  return out;
}

/** 峰值：局部最大、高於門檻；由高到低挑，和已選的峰距離 < minGap 的丟掉。回傳依時間排序的幀索引。 */
export function pickPeaks(env: ArrayLike<number>, threshold: number, minGap: number): number[] {
  const cands: number[] = [];
  for (let i = 0; i < env.length; i++) {
    const l = i > 0 ? env[i - 1] : -Infinity;
    const r = i < env.length - 1 ? env[i + 1] : -Infinity;
    if (env[i] > threshold && env[i] >= l && env[i] > r) cands.push(i);
  }
  cands.sort((a, b) => env[b] - env[a] || a - b);
  const chosen: number[] = [];
  for (const c of cands) if (chosen.every((p) => Math.abs(p - c) >= minGap)) chosen.push(c);
  return chosen.sort((a, b) => a - b);
}

export function segmentSpeech(midi: Float64Array, rms: ArrayLike<number>, times: ArrayLike<number>, p: SpeechSegmentParams): Syllable[] {
  const width = Math.max(1, Math.round(SMOOTH_SEC / p.hop) + 1);
  const env = smoothEnvelope(rms, width);
  const threshold = p.noiseFloor * PEAK_FLOOR_RATIO;
  const peaks = pickPeaks(env, threshold, Math.round(MIN_PEAK_GAP_SEC / p.hop));
  if (!peaks.length) return [];

  // 邊界：相鄰峰之間 RMS 最低點；頭尾延伸到包絡掉回門檻以下
  const bounds: number[] = [];
  let first = peaks[0];
  while (first > 0 && env[first - 1] > threshold) first--;
  bounds.push(first);
  for (let k = 1; k < peaks.length; k++) {
    let lo = peaks[k - 1];
    for (let i = peaks[k - 1]; i <= peaks[k]; i++) if (env[i] < env[lo]) lo = i;
    bounds.push(lo);
  }
  let last = peaks[peaks.length - 1];
  while (last < env.length - 1 && env[last + 1] > threshold) last++;
  bounds.push(last + 1);

  const out: Syllable[] = [];
  for (let k = 0; k < peaks.length; k++) {
    const from = bounds[k];
    const to = bounds[k + 1];
    const voiced: number[] = [];
    for (let i = from; i < to; i++) if (!Number.isNaN(midi[i])) voiced.push(i);
    if (voiced.length < 3) continue; // 沒有母音（例如只有氣音）的音節不算
    // 峰值周圍有聲幀的中間 50%：以峰值為中心，取有聲幀的一半
    const center = voiced.reduce((best, i) => (Math.abs(i - peaks[k]) < Math.abs(best - peaks[k]) ? i : best), voiced[0]);
    const ci = voiced.indexOf(center);
    const half = Math.max(1, Math.round(voiced.length / 4));
    const lo = Math.max(0, Math.min(ci - half, voiced.length - 2 * half));
    const mid = voiced.slice(lo, lo + 2 * half).map((i) => midi[i]);
    out.push({
      peak: peaks[k],
      from,
      to,
      start: times[voiced[0]],
      end: times[voiced[voiced.length - 1]] + p.hop,
      pitch: median(mid),
    });
  }
  return out;
}
