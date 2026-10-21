// 規劃書 13.1 表中的哼唱案例，跑完整離線管線（讀 WAV → 音高追蹤 → 平滑 → 調音校正 → 切分）。
import { describe, expect, it } from 'vitest';
import { SAMPLE_RATES, renderFixture, type FixtureCase } from '../../scripts/gen-test-audio';
import { analyzeHum } from '../../src/analysis/pipeline';
import { DEFAULT_SETTINGS } from '../../src/types';
import { fixture, loadFixture } from './helpers';

const ONSET_TOL = 0.03;

function run(name: string, sr: number, settings = DEFAULT_SETTINGS) {
  const { samples, sampleRate } = loadFixture(name, sr);
  return analyzeHum(samples, sampleRate, settings);
}

describe.each(SAMPLE_RATES)('哼唱管線 @ %i Hz', (sr) => {
  it('scale_c_major → 8 個音符 60 62 64 65 67 69 71 72，起點誤差 ±30 ms', () => {
    const { notes } = run('scale_c_major', sr);
    expect(notes.map((n) => n.midi)).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
    fixture('scale_c_major').truth.forEach((t, i) => expect(Math.abs(notes[i].start - t.start)).toBeLessThanOrEqual(ONSET_TOL));
  });

  it('repeated_notes → 4 個音符，皆為 64', () => {
    const { notes } = run('repeated_notes', sr);
    expect(notes.map((n) => n.midi)).toEqual([64, 64, 64, 64]);
    fixture('repeated_notes').truth.forEach((t, i) => expect(Math.abs(notes[i].start - t.start)).toBeLessThanOrEqual(ONSET_TOL));
  });

  it('vibrato → 1 個音符：69（調音偏移不被顫音帶偏）', () => {
    const r = run('vibrato', sr);
    expect(r.notes.map((n) => n.midi)).toEqual([69]);
    expect(Math.abs(r.tuningCents)).toBeLessThan(5);
  });

  it('glide → 最後一個音符是 67，總音符數 ≤ 2', () => {
    const { notes } = run('glide', sr);
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.length).toBeLessThanOrEqual(2);
    expect(notes[notes.length - 1].midi).toBe(67);
  });

  it('detuned_scale（+30 cents）→ 開啟調音校正後與 scale_c_major 相同', () => {
    const ref = run('scale_c_major', sr).notes;
    const r = run('detuned_scale', sr);
    expect(r.tuningCents).toBeGreaterThan(25);
    expect(r.tuningCents).toBeLessThan(35);
    expect(r.notes.map((n) => n.midi)).toEqual(ref.map((n) => n.midi));
    r.notes.forEach((n, i) => {
      expect(Math.abs(n.start - ref[i].start)).toBeLessThanOrEqual(ONSET_TOL);
      expect(Math.abs(n.dur - ref[i].dur)).toBeLessThanOrEqual(ONSET_TOL);
    });
  });

  it('octave_glitch → 1 個音符：57', () => {
    expect(run('octave_glitch', sr).notes.map((n) => n.midi)).toEqual([57]);
  });

  it('noise_only → 0 個音符', () => {
    expect(run('noise_only', sr).notes).toEqual([]);
  });

  it('同一段錄音、同一組設定 → 永遠同樣結果', () => {
    expect(run('scale_c_major', sr).notes).toEqual(run('scale_c_major', sr).notes);
  });
});

describe('耐受度（不在規劃書表中，防止參數調得太剛好）', () => {
  function withExtras(base: FixtureCase, patch: Partial<FixtureCase>): FixtureCase {
    return { ...base, ...patch, name: `${base.name}_variant` };
  }

  it('音階加上 −40 dBFS 白雜訊（訊噪比約 20 dB）仍然全對', () => {
    const fx = withExtras(fixture('scale_c_major'), { noise: [{ kind: 'white', rmsDb: -40 }] });
    const { notes } = analyzeHum(renderFixture(fx, 48000), 48000, DEFAULT_SETTINGS);
    expect(notes.map((n) => n.midi)).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
  });

  it('小聲哼（峰值約 −30 dBFS）仍然抓得到', () => {
    const base = fixture('scale_c_major');
    const fx = withExtras(base, { voices: base.voices.map((v) => ({ ...v, level: 0.03 })), noise: [{ kind: 'white', rmsDb: -70 }] });
    const { notes } = analyzeHum(renderFixture(fx, 44100), 44100, DEFAULT_SETTINGS);
    expect(notes.map((n) => n.midi)).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
  });

  it('低音（男聲 A2–E3）與高音（女聲 A4–E5）都正確', () => {
    for (const midis of [[45, 47, 48, 50, 52], [69, 71, 72, 74, 76]]) {
      const base = fixture('scale_c_major');
      const fx = withExtras(base, {
        voices: midis.map((m, i) => ({ start: 0.3 + i * 0.5, dur: 0.4, pitch: () => m })),
        duration: 0.3 + midis.length * 0.5 + 0.3,
      });
      const { notes } = analyzeHum(renderFixture(fx, 48000), 48000, DEFAULT_SETTINGS);
      expect(notes.map((n) => n.midi)).toEqual(midis);
    }
  });

  it('連音（音與音之間沒有停頓，直接換音高）也能切開', () => {
    const midis = [60, 64, 62, 67];
    const base = fixture('scale_c_major');
    const fx = withExtras(base, {
      voices: [{ start: 0.3, dur: 1.6, pitch: (t: number) => midis[Math.min(3, Math.floor(t / 0.4))] }],
      duration: 2.2,
    });
    const { notes } = analyzeHum(renderFixture(fx, 48000), 48000, DEFAULT_SETTINGS);
    expect(notes.map((n) => n.midi)).toEqual(midis);
    midis.forEach((_, i) => expect(Math.abs(notes[i].start - (0.3 + i * 0.4))).toBeLessThanOrEqual(ONSET_TOL));
  });
});

describe('管線後段：調性、吸附音階、量化', () => {
  it('scale_c_major 偵測為 C 大調（前 2 名）', () => {
    const r = run('scale_c_major', 48000);
    expect(r.keys.length).toBe(2);
    expect(r.keys[0]).toMatchObject({ tonic: 0, mode: 'major' });
    expect(r.key).toEqual({ tonic: 0, mode: 'major' });
  });

  it('有 BPM 時量化（強度 100%、1/8 @ 120 BPM、原點 0.3 秒）：起點全部落在格線上', () => {
    const { samples, sampleRate } = loadFixture('scale_c_major', 48000);
    const settings = { ...DEFAULT_SETTINGS, quantize: { enabled: true, grid: '1/8' as const, strength: 1 } };
    const { notes } = analyzeHum(samples, sampleRate, settings, { bpm: 120, gridOffset: 0.3, key: null });
    expect(notes.map((n) => n.midi)).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
    notes.forEach((n, i) => {
      expect(n.start).toBeCloseTo(0.3 + i * 0.5, 9);
      expect(n.dur).toBeCloseTo(0.5, 9);
    });
  });

  it('沒有 BPM、或關閉量化 → 不量化', () => {
    const { samples, sampleRate } = loadFixture('scale_c_major', 48000);
    const off = analyzeHum(samples, sampleRate, { ...DEFAULT_SETTINGS, quantize: { ...DEFAULT_SETTINGS.quantize, enabled: false } }, { bpm: 120, gridOffset: 0, key: null });
    const none = analyzeHum(samples, sampleRate, DEFAULT_SETTINGS);
    expect(off.notes.map((n) => n.start)).toEqual(none.notes.map((n) => n.start));
  });

  it('吸附音階：用使用者選的調，把調外音移進來', () => {
    // C 大調音階裡把 F 唱成 F♯（偏高一點）
    const base = fixture('scale_c_major');
    const fx = { ...base, name: 'sharp4', voices: base.voices.map((v, i) => (i === 3 ? { ...v, pitch: () => 66.2 } : v)) };
    const samples = renderFixture(fx, 48000);
    const plain = analyzeHum(samples, 48000, DEFAULT_SETTINGS);
    expect(plain.notes[3].midi).toBe(66);
    const snapped = analyzeHum(samples, 48000, { ...DEFAULT_SETTINGS, snapToScale: true }, { bpm: null, gridOffset: 0, key: { tonic: 0, mode: 'major' } });
    expect(snapped.notes.map((n) => n.midi)).toEqual([60, 62, 64, 67, 67, 69, 71, 72]);
  });
});
