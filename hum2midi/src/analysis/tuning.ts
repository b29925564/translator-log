// 7.3 整體調音偏移：所有有聲幀相對最近半音的偏差，用圓形平均（−50～+50 音分當成角度）。

import { voicedRuns } from './smoothing';

/** 合成向量長度低於這個值代表偏差幾乎均勻分布（例如整段都在滑音），平均角度沒有意義，不校正。 */
const MIN_RESULTANT = 0.1;
/** 先在每段有聲區間內做約 190 ms 的移動平均，把顫音（約 5–7 Hz）抹平再算偏差。 */
const VIBRATO_FRAMES = 19;

/**
 * 回傳整體偏移（半音，−0.5～+0.5）；沒有有聲幀或偏差太分散時回傳 0。
 * 直接拿逐幀音高算會被顫音帶偏：±50 音分的顫音偏差會繞過 ±π，圓形平均反而指向 ±50 音分。
 */
export function estimateTuningOffset(midi: ArrayLike<number>): number {
  const centered = movingAverageRuns(midi, VIBRATO_FRAMES);
  let c = 0;
  let s = 0;
  let n = 0;
  for (let i = 0; i < centered.length; i++) {
    const m = centered[i];
    if (Number.isNaN(m)) continue;
    const a = 2 * Math.PI * (m - Math.round(m));
    c += Math.cos(a);
    s += Math.sin(a);
    n++;
  }
  if (n === 0 || Math.hypot(c, s) / n < MIN_RESULTANT) return 0;
  return Math.atan2(s, c) / (2 * Math.PI);
}

function movingAverageRuns(x: ArrayLike<number>, width: number): Float64Array {
  const out = new Float64Array(x.length).fill(NaN);
  const half = width >> 1;
  for (const [s, e] of voicedRuns(x)) {
    for (let i = s; i < e; i++) {
      const a = Math.max(s, i - half);
      const b = Math.min(e - 1, i + half);
      let sum = 0;
      for (let j = a; j <= b; j++) sum += x[j];
      out[i] = sum / (b - a + 1);
    }
  }
  return out;
}

export function applyTuning(midi: Float64Array, offset: number): Float64Array {
  if (offset === 0) return Float64Array.from(midi);
  return midi.map((m) => m - offset);
}
