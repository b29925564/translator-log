// 7.4 哼唱音符切分。輸入是平滑、校正過的 midiFloat（無聲為 NaN）與每幀 RMS。

import type { Note } from '../types';
import { median, voicedRuns } from './smoothing';

export type SegmentParams = {
  hop: number; // 秒
  splitSensitivity: number; // 0–1
};

/** 切分敏感度 0–1 → θ（半音）：1.0 → 0.5（容易切），0 → 1.0（不容易切）；預設 0.6 → 0.7。 */
export function splitThreshold(splitSensitivity: number): number {
  const s = Math.max(0, Math.min(1, splitSensitivity));
  return 1.0 - 0.5 * s;
}

export const HOLD_FRAMES = 6; // 連續偏離幾幀才切（60 ms）
export const MIN_NOTE_SEC = 0.08;
export const MAX_GAP_SEC = 0.04;
const MEDIAN_SPAN = 100; // running median 最多看最近 100 幀（1 秒），長音也不會越算越慢
const DIP_RATIO = 0.55;
const RISE_RATIO = 0.8;

/** 切分中的音符：幀索引範圍 [start, end)。 */
type Span = { start: number; end: number };

/**
 * 把短暫無聲（< 40 ms）補起來：例如偵測器在長音中間掉了一兩幀。
 * 補上的幀用線性內插，只用來判斷切分，不會被拿去算音高。
 */
function bridgeGaps(x: Float64Array, maxGapFrames: number): Float64Array {
  const out = Float64Array.from(x);
  const runs = voicedRuns(x);
  for (let r = 1; r < runs.length; r++) {
    const a = runs[r - 1][1] - 1;
    const b = runs[r][0];
    if (b - a - 1 <= maxGapFrames) {
      for (let i = a + 1; i < b; i++) out[i] = x[a] + ((x[b] - x[a]) * (i - a)) / (b - a);
    }
  }
  return out;
}

/** 一段連續有聲區間內的切分：音高 hysteresis＋同音重複起音。 */
function splitRun(x: Float64Array, rms: ArrayLike<number>, s: number, e: number, theta: number): Span[] {
  const spans: Span[] = [];
  let cur: Span = { start: s, end: s };
  let sorted: number[] = []; // 目前音符最近 MEDIAN_SPAN 幀的音高（排序好）
  let window: number[] = []; // 同上，依時間順序，用來移除最舊的值
  let cand: number[] = []; // 連續偏離 running median 的候選幀

  const push = (i: number) => {
    const v = x[i];
    window.push(v);
    sorted.splice(lowerBound(sorted, v), 0, v);
    if (window.length > MEDIAN_SPAN) {
      const old = window.shift()!;
      sorted.splice(lowerBound(sorted, old), 1);
    }
  };
  const runningMedian = () => {
    const n = sorted.length;
    return n % 2 ? sorted[n >> 1] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  };
  const startNote = (i: number) => {
    cur = { start: i, end: i };
    sorted = [];
    window = [];
    cand = [];
  };

  let peak = rms[s];
  let dipStart = -1; // RMS 掉到峰值 55% 以下的第一幀
  let dipMin = -1;

  for (let i = s; i < e; i++) {
    // --- 同音重複起音：RMS 先降到局部峰值的 55% 以下，再回升到 80% 以上 ---
    if (dipStart < 0) {
      if (rms[i] > peak) peak = rms[i];
      if (rms[i] < DIP_RATIO * peak) {
        dipStart = i;
        dipMin = i;
      }
    } else {
      if (rms[i] < rms[dipMin]) dipMin = i;
      if (rms[i] > RISE_RATIO * peak) {
        // 前一個音結束在開始掉下去的地方；新的音從谷底之後、能量開始回升的那一幀開始
        let onset = i;
        while (onset > dipMin + 1 && rms[onset - 1] > 1.25 * rms[dipMin]) onset--;
        cur.end = dipStart;
        if (cur.end > cur.start) spans.push(cur);
        startNote(onset);
        for (let j = onset; j <= i; j++) push(j);
        cur.end = i + 1;
        peak = rms[i];
        dipStart = -1;
        continue;
      }
      if (rms[i] > peak) peak = rms[i];
    }

    // --- 音高 hysteresis ---
    if (sorted.length === 0) {
      push(i);
      cur.end = i + 1;
      continue;
    }
    const m = runningMedian();
    if (Math.abs(x[i] - m) > theta) {
      cand.push(i);
      if (cand.length >= HOLD_FRAMES) {
        // 最近 6 幀自己要夠穩定（範圍 ≤ θ）才切；滑音途中不切，等落到新音高再一次切開
        const last = cand.slice(-HOLD_FRAMES).map((j) => x[j]);
        if (Math.max(...last) - Math.min(...last) <= theta) {
          if (cur.end > cur.start) spans.push(cur);
          // 新音符從第一個偏離的幀開始（包含滑進來的部分），但 running median 只用穩定下來的這 6 幀，
          // 否則滑音途中的音高會把中位數拉低，馬上又被切一次
          const first = cand[0];
          startNote(first);
          for (let j = i - HOLD_FRAMES + 1; j <= i; j++) push(j);
          cur.end = i + 1;
          // 新音符的音量峰值從這裡重新算
          peak = rms[i];
          dipStart = -1;
        }
      }
    } else {
      // 偏離沒有持續夠久（顫音、抖動），把候選幀收回目前音符
      for (const c of cand) push(c);
      cand = [];
      push(i);
      cur.end = i + 1;
    }
  }
  // 區間結束時還沒定案的候選幀（通常是音尾下滑）歸給目前音符
  if (cand.length) cur.end = Math.max(cur.end, cand[cand.length - 1] + 1);
  if (cur.end > cur.start) spans.push(cur);
  return spans;
}

function lowerBound(a: number[], v: number): number {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** 音符的連續音高：中間 60% 幀的 midiFloat 中位數（避開滑音的頭尾）；只用真正有聲的幀。 */
export function spanPitch(x: Float64Array, span: Span, middle = 0.6): number {
  const len = span.end - span.start;
  const skip = Math.floor((len * (1 - middle)) / 2);
  const vals: number[] = [];
  for (let i = span.start + skip; i < span.end - skip; i++) if (!Number.isNaN(x[i])) vals.push(x[i]);
  if (vals.length === 0) for (let i = span.start; i < span.end; i++) if (!Number.isNaN(x[i])) vals.push(x[i]);
  return median(vals);
}

/** 平均 RMS → dBFS，線性對應 −50…−10 dB → 40…110，夾在 1–127。 */
export function velocityFromRms(meanRms: number): number {
  const db = 20 * Math.log10(Math.max(meanRms, 1e-9));
  const v = 40 + ((db + 50) / 40) * 70;
  return Math.max(1, Math.min(127, Math.round(v)));
}

export type HumNote = Note & { pitch: number }; // pitch：四捨五入前的 midiFloat

export function segmentHum(x: Float64Array, rms: ArrayLike<number>, times: ArrayLike<number>, p: SegmentParams): HumNote[] {
  const theta = splitThreshold(p.splitSensitivity);
  const maxGapFrames = Math.max(0, Math.ceil(MAX_GAP_SEC / p.hop) - 1); // < 40 ms
  const bridged = bridgeGaps(x, maxGapFrames);

  // 1–3. 依連續有聲區間切段，段內再依音高與重複起音切開
  let spans: Span[] = [];
  for (const [s, e] of voicedRuns(bridged)) spans.push(...splitRun(bridged, rms, s, e, theta));

  // 5. 太短的音符（< 80 ms）併入相鄰、音高較接近的那個；沒有相鄰的就刪除
  const minFrames = Math.round(MIN_NOTE_SEC / p.hop);
  const adjacent = (a: Span, b: Span) => b.start - a.end <= maxGapFrames;
  for (;;) {
    let shortest = -1;
    for (let i = 0; i < spans.length; i++) {
      const len = spans[i].end - spans[i].start;
      if (len < minFrames && (shortest < 0 || len < spans[shortest].end - spans[shortest].start)) shortest = i;
    }
    if (shortest < 0) break;
    const sp = spans[shortest];
    const here = spanPitch(x, sp);
    const prev = shortest > 0 && adjacent(spans[shortest - 1], sp) ? shortest - 1 : -1;
    const next = shortest < spans.length - 1 && adjacent(sp, spans[shortest + 1]) ? shortest + 1 : -1;
    const dist = (j: number) => (j < 0 ? Infinity : Math.abs(spanPitch(x, spans[j]) - here));
    const into = dist(prev) <= dist(next) ? prev : next;
    if (into >= 0) {
      const target = spans[into];
      spans[into] = { start: Math.min(target.start, sp.start), end: Math.max(target.end, sp.end) };
    }
    spans = spans.filter((_, i) => i !== shortest);
  }

  // 4, 6. 音高與力度
  const notes: HumNote[] = spans.map((sp, i) => {
    let sum = 0;
    for (let j = sp.start; j < sp.end; j++) sum += rms[j];
    const pitch = spanPitch(x, sp);
    const start = times[sp.start];
    return {
      id: `n${i}`,
      midi: Math.round(pitch),
      pitch,
      start,
      dur: times[sp.end - 1] + p.hop - start,
      velocity: velocityFromRms(sum / (sp.end - sp.start)),
    };
  });

  // 5. 音符間隙 < 40 ms 就補連（前一個音延長到下一個音的起點）
  for (let i = 0; i + 1 < notes.length; i++) {
    const gap = notes[i + 1].start - (notes[i].start + notes[i].dur);
    if (gap > 0 && gap < MAX_GAP_SEC) notes[i].dur = notes[i + 1].start - notes[i].start;
  }
  return notes;
}
