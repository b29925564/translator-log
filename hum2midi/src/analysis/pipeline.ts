// 哼唱模式的離線分析管線：音高追蹤 → 平滑 → 調音偏移校正 → 音符切分。
// 純函式；同一段錄音、同一組設定 → 永遠同樣結果。Worker 與單元測試都直接呼叫這裡。

import type { AnalysisSettings, PitchFrame } from '../types';
import { applyVoicing, trackRaw, type RawTrack } from './pitch-track';
import { segmentHum, type HumNote } from './segment-hum';
import { smoothPitch } from './smoothing';
import { applyTuning, estimateTuningOffset } from './tuning';

export type HumAnalysis = {
  frames: PitchFrame[];
  /** 平滑＋（開啟時）調音校正後的連續音高，無聲為 NaN。畫在鋼琴捲軸音符後面。 */
  curve: Float64Array;
  /** 偵測到的整體偏移（音分）；不論是否開啟校正都會回報。 */
  tuningCents: number;
  notes: HumNote[];
};

export function analyzeTrack(raw: RawTrack, settings: AnalysisSettings): HumAnalysis {
  const frames = applyVoicing(raw, settings.sensitivity);
  const smooth = smoothPitch(frames);
  const offset = estimateTuningOffset(smooth);
  const curve = settings.tuningCorrection ? applyTuning(smooth, offset) : smooth;
  const notes = segmentHum(curve, raw.rms, raw.t, {
    hop: raw.hop / raw.sampleRate,
    splitSensitivity: settings.splitSensitivity,
  });
  return { frames, curve, tuningCents: Math.round(offset * 1000) / 10, notes };
}

export function analyzeHum(samples: Float32Array, sampleRate: number, settings: AnalysisSettings): HumAnalysis {
  return analyzeTrack(trackRaw(samples, sampleRate), settings);
}
