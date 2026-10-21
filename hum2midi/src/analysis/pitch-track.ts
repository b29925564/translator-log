// 7.1 離線逐幀音高追蹤。
// 兩階段：trackRaw 只跟音訊有關（慢，結果可快取）；applyVoicing 套用「靈敏度」決定哪些幀可信（快）。
// 這樣調整設定後重新分析時不必重跑 pitchy。

import { PitchDetector } from 'pitchy';
import type { PitchFrame } from '../types';

export const WINDOW = 2048;
export const HOP_SECONDS = 0.01;
export const MIN_HZ = 70;
export const MAX_HZ = 1100;
/** 底噪下限 −90 dBFS：數位全靜音時 noiseFloor 會是 0，不能讓任何微小聲音都過門檻。 */
const MIN_FLOOR = 3e-5;

/** 原始逐幀結果：hz 是 pitchy 的原始輸出（0 表示找不到），還沒有經過有聲判定。 */
export type RawTrack = {
  sampleRate: number;
  hop: number; // samples
  t: Float64Array; // 秒（分析窗中心）
  hz: Float64Array;
  clarity: Float64Array;
  rms: Float64Array;
};

export function hopSize(sampleRate: number): number {
  return Math.round(sampleRate * HOP_SECONDS);
}

export function trackRaw(samples: Float32Array, sampleRate: number): RawTrack {
  const hop = hopSize(sampleRate);
  const count = samples.length >= WINDOW ? Math.floor((samples.length - WINDOW) / hop) + 1 : 0;
  const t = new Float64Array(count);
  const hz = new Float64Array(count);
  const clarity = new Float64Array(count);
  const rms = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const start = i * hop;
    let sq = 0;
    for (let j = start; j < start + WINDOW; j++) sq += samples[j] * samples[j];
    rms[i] = Math.sqrt(sq / WINDOW);
    t[i] = (start + WINDOW / 2) / sampleRate;
  }
  // 再安靜的幀在最高靈敏度下也不可能被判成有聲，就不必跑 pitchy（hz、clarity 留 0）。
  // 錄音裡通常有一半以上是停頓，這能省下大部分時間。
  const quiet = Math.max(noiseFloor(rms), MIN_FLOOR) * voicingParams(1).k;
  const detector = PitchDetector.forFloat32Array(WINDOW);
  for (let i = 0; i < count; i++) {
    if (rms[i] < quiet) continue;
    const start = i * hop;
    // subarray 不複製資料；長度剛好等於建構 PitchDetector 時的 inputLength
    const [f, c] = detector.findPitch(samples.subarray(start, start + WINDOW), sampleRate);
    hz[i] = f;
    clarity[i] = c;
  }
  return { sampleRate, hop, t, hz, clarity, rms };
}

/** 整段最安靜 10% 幀的 RMS 中位數。 */
export function noiseFloor(rms: ArrayLike<number>): number {
  if (rms.length === 0) return 0;
  const sorted = Float64Array.from(rms).sort();
  const n = Math.max(1, Math.round(sorted.length * 0.1));
  return sorted[Math.floor((n - 1) / 2)];
}

export type VoicingParams = { clarityMin: number; k: number };

/**
 * 靈敏度 0–1 → 有聲判定門檻。
 * k（RMS 要高出底噪幾倍）從 5 線性降到 2；clarity 門檻在 0.5 以下維持規格的 0.88，
 * 再往上靈敏才逐步放寬到 0.80（規劃書第 15 節：氣音多時把 clarity 門檻降到 0.8）。
 */
export function voicingParams(sensitivity: number): VoicingParams {
  const s = Math.max(0, Math.min(1, sensitivity));
  return {
    k: 5 - 3 * s,
    clarityMin: s <= 0.5 ? 0.88 : 0.88 - 0.16 * (s - 0.5),
  };
}

/** 套用有聲判定：clarity ≥ 門檻、rms ≥ noiseFloor × k、70 Hz ≤ hz ≤ 1100 Hz。 */
export function applyVoicing(raw: RawTrack, sensitivity: number): PitchFrame[] {
  const { k, clarityMin } = voicingParams(sensitivity);
  const minRms = Math.max(noiseFloor(raw.rms), MIN_FLOOR) * k;
  const frames: PitchFrame[] = new Array(raw.t.length);
  for (let i = 0; i < raw.t.length; i++) {
    const f = raw.hz[i];
    const voiced = raw.clarity[i] >= clarityMin && raw.rms[i] >= minRms && f >= MIN_HZ && f <= MAX_HZ;
    frames[i] = { t: raw.t[i], hz: voiced ? f : null, clarity: raw.clarity[i], rms: raw.rms[i] };
  }
  return frames;
}

export function trackPitch(samples: Float32Array, sampleRate: number, sensitivity: number): PitchFrame[] {
  return applyVoicing(trackRaw(samples, sampleRate), sensitivity);
}
