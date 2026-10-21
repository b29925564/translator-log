// 說話變唱歌的分析管線：音高追蹤 → 平滑 → 調音偏移 → 音節切分 → 誇張化 → 吸附調內音 → 推算 BPM、量化 → 配和弦。

import type { AnalysisSettings, Key, PitchFrame } from '../types';
import { harmonize, type HarmonizedChord } from './harmonize';
import { rankKeys, snapToKey, type KeyCandidate } from './key';
import { applyVoicing, noiseFloor, type RawTrack } from './pitch-track';
import { quantizeNotes } from './quantize';
import type { HumNote } from './segment-hum';
import { segmentSpeech, type Syllable } from './segment-speech';
import { median, smoothPitch } from './smoothing';
import { applyTuning, circularOffset } from './tuning';

export type SpeechOptions = {
  /** 誇張化：以整句音高中位數為中心把音程放大（1.0–2.0）。 */
  exaggeration: number;
  /** 使用者選的調；null = 偵測到的第 1 名。 */
  key: Key | null;
};

export const DEFAULT_EXAGGERATION = 1.4;

export type SpeechAnalysis = {
  frames: PitchFrame[];
  curve: Float64Array;
  tuningCents: number;
  syllables: Syllable[];
  bpm: number;
  /** 第 1 小節第 1 拍（秒）= 第一個音節的起點。 */
  gridOffset: number;
  keys: KeyCandidate[];
  key: Key | null;
  notes: HumNote[];
  chords: HarmonizedChord[];
};

/** 音節起點間隔（IOI）的中位數視為八分音符：BPM = 30 / IOI，不在 70–140 之間就 ×2 或 ÷2 拉回來。 */
export function bpmFromOnsets(starts: number[]): number {
  const iois: number[] = [];
  for (let i = 1; i < starts.length; i++) if (starts[i] > starts[i - 1]) iois.push(starts[i] - starts[i - 1]);
  if (!iois.length) return 100;
  let bpm = 30 / median(iois);
  while (bpm < 70) bpm *= 2;
  while (bpm > 140) bpm /= 2;
  return Math.round(bpm);
}

/** 以中位數為中心放大音程。 */
export function exaggerate(pitches: number[], factor: number): number[] {
  if (!pitches.length) return [];
  const c = median(pitches);
  return pitches.map((p) => c + factor * (p - c));
}

export function analyzeSpeechTrack(raw: RawTrack, settings: AnalysisSettings, opts: SpeechOptions): SpeechAnalysis {
  const hop = raw.hop / raw.sampleRate;
  const frames = applyVoicing(raw, settings.sensitivity);
  const smooth = smoothPitch(frames);
  const found = segmentSpeech(smooth, raw.rms, raw.t, { hop, noiseFloor: Math.max(noiseFloor(raw.rms), 3e-5) });
  // 說話的音高一直在滑，逐幀算的偏移沒有意義；改用各音節的中心音高（以有聲長度加權）算整體偏移
  const offset = circularOffset(
    found.map((s) => s.pitch),
    found.map((s) => s.end - s.start),
  );
  const correct = settings.tuningCorrection ? offset : 0;
  const curve = applyTuning(smooth, correct);
  const syllables = found.map((s) => ({ ...s, pitch: s.pitch - correct }));

  const factor = Math.max(1, Math.min(2, opts.exaggeration));
  const pitches = exaggerate(syllables.map((s) => s.pitch), factor);
  let notes: HumNote[] = syllables.map((s, i) => {
    const next = syllables[i + 1];
    const end = next ? Math.min(s.end, next.start) : s.end;
    return { id: `s${i}`, midi: Math.round(pitches[i]), pitch: pitches[i], start: s.start, dur: Math.max(hop, end - s.start), velocity: 90 };
  });

  // 放大後再吸附到調內音
  const keys = rankKeys(notes).slice(0, 2);
  const key = opts.key ?? (keys[0] ? { tonic: keys[0].tonic, mode: keys[0].mode } : null);
  if (key) notes = notes.map((n) => ({ ...n, midi: snapToKey(n.midi, key, n.pitch) }));

  const bpm = bpmFromOnsets(syllables.map((s) => s.start));
  const gridOffset = syllables[0]?.start ?? 0;
  notes = quantizeNotes(notes, { bpm, grid: '1/16', strength: 1, origin: gridOffset });
  const chords = key ? harmonize(notes, { bpm, origin: gridOffset, key }) : [];
  return { frames, curve, tuningCents: Math.round(offset * 1000) / 10, syllables, bpm, gridOffset, keys, key, notes, chords };
}
