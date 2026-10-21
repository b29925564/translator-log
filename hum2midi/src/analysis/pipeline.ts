// 哼唱模式的離線分析管線：音高追蹤 → 平滑 → 調音偏移校正 → 音符切分 → 調性偵測 →（吸附音階）→（量化）。
// 純函式；同一段錄音、同一組設定 → 永遠同樣結果。Worker 與單元測試都直接呼叫這裡。

import type { AnalysisSettings, Key, PitchFrame } from '../types';
import { rankKeys, snapToKey, type KeyCandidate } from './key';
import { applyVoicing, trackRaw, type RawTrack } from './pitch-track';
import { quantizeNotes } from './quantize';
import { segmentHum, type HumNote } from './segment-hum';
import { smoothPitch } from './smoothing';
import { applyTuning, estimateTuningOffset } from './tuning';

/** 跟這段錄音有關、但不屬於「分析設定」的東西。 */
export type AnalysisContext = {
  /** null = 沒有 BPM：不量化。 */
  bpm: number | null;
  /** 第 1 小節第 1 拍在錄音裡的位置（秒）。 */
  gridOffset: number;
  /** 使用者選的調；null = 用偵測到的第 1 名。 */
  key: Key | null;
};

export const NO_CONTEXT: AnalysisContext = { bpm: null, gridOffset: 0, key: null };

export type HumAnalysis = {
  frames: PitchFrame[];
  /** 平滑＋（開啟時）調音校正後的連續音高，無聲為 NaN。畫在鋼琴捲軸音符後面。 */
  curve: Float64Array;
  /** 偵測到的整體偏移（音分）；不論是否開啟校正都會回報。 */
  tuningCents: number;
  /** 偵測到的前 2 名調性。 */
  keys: KeyCandidate[];
  /** 實際用的調（吸附音階用）。 */
  key: Key | null;
  notes: HumNote[];
};

export function analyzeTrack(raw: RawTrack, settings: AnalysisSettings, ctx: AnalysisContext = NO_CONTEXT): HumAnalysis {
  const frames = applyVoicing(raw, settings.sensitivity);
  const smooth = smoothPitch(frames);
  const offset = estimateTuningOffset(smooth);
  const curve = settings.tuningCorrection ? applyTuning(smooth, offset) : smooth;
  let notes = segmentHum(curve, raw.rms, raw.t, {
    hop: raw.hop / raw.sampleRate,
    splitSensitivity: settings.splitSensitivity,
  });

  const keys = rankKeys(notes).slice(0, 2);
  const key = ctx.key ?? (keys[0] ? { tonic: keys[0].tonic, mode: keys[0].mode } : null);
  if (settings.snapToScale && key) notes = notes.map((n) => ({ ...n, midi: snapToKey(n.midi, key, n.pitch) }));
  if (ctx.bpm && settings.quantize.enabled) {
    notes = quantizeNotes(notes, { bpm: ctx.bpm, grid: settings.quantize.grid, strength: settings.quantize.strength, origin: ctx.gridOffset });
  }
  return { frames, curve, tuningCents: Math.round(offset * 1000) / 10, keys, key, notes };
}

export function analyzeHum(samples: Float32Array, sampleRate: number, settings: AnalysisSettings, ctx: AnalysisContext = NO_CONTEXT): HumAnalysis {
  return analyzeTrack(trackRaw(samples, sampleRate), settings, ctx);
}
