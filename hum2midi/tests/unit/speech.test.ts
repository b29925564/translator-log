import { describe, expect, it } from 'vitest';
import { SAMPLE_RATES, renderFixture } from '../../scripts/gen-test-audio';
import { frameRms, noiseFloor, trackRaw } from '../../src/analysis/pitch-track';
import { analyzeSpeechTrack, bpmFromOnsets, exaggerate } from '../../src/analysis/speech';
import { pickPeaks, smoothEnvelope } from '../../src/analysis/segment-speech';
import { trimSilence } from '../../src/audio/trim';
import { DEFAULT_SETTINGS } from '../../src/types';
import { fixture, loadFixture } from './helpers';

const opts = { exaggeration: 1.4, key: null };

describe.each(SAMPLE_RATES)('說話切分 @ %i Hz', (sr) => {
  it('speech_like → 5 個音節 → 5 個音符', () => {
    const { samples, sampleRate } = loadFixture('speech_like', sr);
    const r = analyzeSpeechTrack(trackRaw(samples, sampleRate), DEFAULT_SETTINGS, opts);
    expect(r.syllables.length).toBe(5);
    expect(r.notes.length).toBe(5);
    // 音節起點 ≈ 合成時的起點（音節前的氣音不算）
    fixture('speech_like').truth.forEach((t, i) => expect(Math.abs(r.syllables[i].start - t.start)).toBeLessThan(0.04));
    // 音高 = 峰值附近的中位數 ≈ 音節中心音高（合成時每個音節以中心為準下滑 3 半音）
    fixture('speech_like').truth.forEach((t, i) => expect(Math.abs(r.syllables[i].pitch - t.midi)).toBeLessThan(0.6));
  });
});

describe('說話變唱歌的旋律', () => {
  const { samples, sampleRate } = loadFixture('speech_like', 48000);
  const raw = trackRaw(samples, sampleRate);

  it('節奏：IOI 中位數 0.26 秒 = 八分音符 → BPM 115；起點量化到 1/16、第一個音在第 1 拍', () => {
    const r = analyzeSpeechTrack(raw, DEFAULT_SETTINGS, opts);
    expect(r.bpm).toBe(115);
    const sixteenth = 15 / r.bpm;
    expect(r.notes[0].start).toBeCloseTo(r.gridOffset, 9);
    for (const n of r.notes) {
      const k = (n.start - r.gridOffset) / sixteenth;
      expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-6);
    }
  });

  it('BPM 不在 70–140 之間就 ×2 或 ÷2', () => {
    expect(bpmFromOnsets([0, 0.25, 0.5, 0.75])).toBe(120);
    expect(bpmFromOnsets([0, 0.1, 0.2, 0.3])).toBe(75); // 300 → 150 → 75
    expect(bpmFromOnsets([0, 0.6, 1.2])).toBe(100); // 50 → 100
    expect(bpmFromOnsets([0])).toBe(100);
  });

  it('誇張化：以中位數為中心放大音程', () => {
    expect(exaggerate([60, 62, 57], 1)).toEqual([60, 62, 57]);
    expect(exaggerate([60, 62, 57], 2)).toEqual([60, 64, 54]);
    expect(exaggerate([], 1.4)).toEqual([]);
  });

  it('誇張化越大，旋律音域越寬；全部都是調內音', () => {
    const plain = analyzeSpeechTrack(raw, DEFAULT_SETTINGS, { exaggeration: 1, key: null });
    const wide = analyzeSpeechTrack(raw, DEFAULT_SETTINGS, { exaggeration: 2, key: null });
    const range = (ns: { midi: number }[]) => Math.max(...ns.map((n) => n.midi)) - Math.min(...ns.map((n) => n.midi));
    expect(range(wide.notes)).toBeGreaterThan(range(plain.notes));
    expect(wide.key).not.toBe(null);
  });

  it('配了和弦：每個和弦落在小節／半小節上，總長蓋過旋律', () => {
    const r = analyzeSpeechTrack(raw, DEFAULT_SETTINGS, opts);
    expect(r.chords.length).toBeGreaterThan(0);
    expect(r.chords[0].start).toBeLessThanOrEqual(r.notes[0].start + 1e-9);
    const last = r.chords[r.chords.length - 1];
    const melodyEnd = Math.max(...r.notes.map((n) => n.start + n.dur));
    expect(last.start + last.dur).toBeGreaterThanOrEqual(melodyEnd - 1e-9);
  });

  it('同一句話、同一組設定 → 結果完全相同', () => {
    expect(analyzeSpeechTrack(raw, DEFAULT_SETTINGS, opts)).toEqual(analyzeSpeechTrack(raw, DEFAULT_SETTINGS, opts));
  });
});

describe('修剪後的短句沿用修剪前的底噪', () => {
  it('小聲的音節（−17 dB）在修剪後不會因為底噪被高估而消失', () => {
    const base = fixture('speech_like');
    const fx = {
      ...base,
      name: 'soft_syllable',
      voices: base.voices.map((v, i) => (i === 3 ? { ...v, level: 0.04 } : v)),
      noise: [...base.noise, { kind: 'white' as const, rmsDb: -50, start: 0.3, dur: 1.25 }],
    };
    const sr = 48000;
    const full = renderFixture(fx, sr);
    const trimmed = trimSilence(full, sr).samples;
    const floor = noiseFloor(frameRms(full, sr));
    expect(noiseFloor(frameRms(trimmed, sr))).toBeGreaterThan(floor * 4); // 修剪後自己估的底噪高很多
    const fromFull = analyzeSpeechTrack(trackRaw(full, sr), DEFAULT_SETTINGS, opts);
    const withFloor = analyzeSpeechTrack(trackRaw(trimmed, sr, floor), DEFAULT_SETTINGS, { ...opts, noiseFloor: floor });
    expect(fromFull.syllables.length).toBe(5);
    expect(withFloor.syllables.length).toBe(5);
  });
});

describe('音節切分的小零件', () => {
  it('20 ms 平滑：置中的移動平均', () => {
    expect(Array.from(smoothEnvelope([0, 3, 0, 0], 3))).toEqual([1.5, 1, 1, 0]);
  });

  it('峰值：高於門檻、間距不夠時留高的', () => {
    const env = [0, 5, 0, 4, 0, 0, 0, 0, 3, 0, 0.5, 0];
    expect(pickPeaks(env, 1, 3)).toEqual([1, 8]);
    expect(pickPeaks(env, 1, 2)).toEqual([1, 3, 8]);
  });
});

describe('修剪頭尾靜音', () => {
  it('保留 30 ms 緩衝', () => {
    const base = fixture('speech_like');
    const sr = 48000;
    const samples = renderFixture({ ...base, duration: base.duration + 1 }, sr); // 尾巴多 1 秒安靜
    const r = trimSilence(samples, sr);
    const firstSound = (base.truth[0].start - 0.035) * sr; // 第一個氣音
    const lastSound = (base.truth[4].start + base.truth[4].dur) * sr;
    expect(r.start).toBeLessThanOrEqual(firstSound - 0.03 * sr + 0.012 * sr);
    expect(r.start).toBeGreaterThan(firstSound - 0.08 * sr);
    expect(r.end).toBeGreaterThanOrEqual(lastSound);
    expect(r.end).toBeLessThan(lastSound + 0.1 * sr);
    expect(r.samples.length).toBe(r.end - r.start);
  });

  it('全是安靜 → 不修剪', () => {
    const r = trimSilence(new Float32Array(48000), 48000);
    expect(r.samples.length).toBe(48000);
  });
});
