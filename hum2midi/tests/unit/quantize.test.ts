import { describe, expect, it } from 'vitest';
import { gridSeconds, quantizeNotes } from '../../src/analysis/quantize';
import type { Note } from '../../src/types';

const note = (start: number, dur: number, midi = 60, id = `n${start}`): Note => ({ id, midi, start, dur, velocity: 90 });
const round = (ns: Note[]) => ns.map((n) => [+n.start.toFixed(6), +n.dur.toFixed(6)]);

describe('量化', () => {
  it('一格的長度：120 BPM 時 1/4 = 0.5、1/8 = 0.25、1/16 = 0.125、1/8 三連音 = 1/6 秒', () => {
    expect(gridSeconds(120, '1/4')).toBe(0.5);
    expect(gridSeconds(120, '1/8')).toBe(0.25);
    expect(gridSeconds(120, '1/16')).toBe(0.125);
    expect(gridSeconds(120, '1/8T')).toBeCloseTo(1 / 6, 12);
  });

  it('強度 100%：起點與終點都吸到最近的格線', () => {
    const out = quantizeNotes([note(0.03, 0.47), note(0.52, 0.2), note(1.1, 0.33)], { bpm: 120, grid: '1/8', strength: 1 });
    expect(round(out)).toEqual([[0, 0.5], [0.5, 0.25], [1, 0.5]]);
  });

  it('強度 75%（預設）：往格線移 75%', () => {
    // 起點 0.1 → 最近格線 0（1/16 @120 = 0.125；0.1 比較靠近 0.125）
    const [n] = quantizeNotes([note(0.1, 0.4)], { bpm: 120, grid: '1/16', strength: 0.75 });
    expect(n.start).toBeCloseTo(0.1 + 0.75 * (0.125 - 0.1), 12);
    expect(n.start + n.dur).toBeCloseTo(0.5, 12);
  });

  it('強度 0：不動（但仍保證最少一格、不重疊）', () => {
    expect(round(quantizeNotes([note(0.11, 0.3)], { bpm: 120, grid: '1/16', strength: 0 }))).toEqual([[0.11, 0.3]]);
  });

  it('量化後最少一格長', () => {
    const [n] = quantizeNotes([note(0.49, 0.02)], { bpm: 120, grid: '1/8', strength: 1 });
    expect(n.start).toBe(0.5);
    expect(n.dur).toBe(0.25);
  });

  it('不可重疊：重疊時截短前一個', () => {
    const out = quantizeNotes([note(0, 0.8), note(0.5, 0.5, 62)], { bpm: 120, grid: '1/8', strength: 1 });
    expect(round(out)).toEqual([[0, 0.5], [0.5, 0.5]]);
  });

  it('比格線還密的兩個音吸到同一格：後一個往後推一格，兩個都保持至少一格、不重疊', () => {
    const out = quantizeNotes([note(0.0, 0.1, 60), note(0.06, 0.1, 62), note(0.4, 0.2, 64)], { bpm: 120, grid: '1/8', strength: 1 });
    expect(out.map((n) => n.midi)).toEqual([60, 62, 64]);
    expect(round(out)).toEqual([[0, 0.25], [0.25, 0.25], [0.5, 0.25]]);
  });

  it('格線原點（第 1 小節第 1 拍不在錄音開頭時）', () => {
    const [n] = quantizeNotes([note(0.32, 0.45)], { bpm: 120, grid: '1/8', strength: 1, origin: 0.07 });
    expect(n.start).toBeCloseTo(0.32, 12);
    expect(n.start + n.dur).toBeCloseTo(0.82, 12);
  });

  it('隨機輸入的性質：輸出不重疊、每個 ≥ 一格、id 與音高保留', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let trial = 0; trial < 50; trial++) {
      const notes = Array.from({ length: 30 }, (_, i) => note(rand() * 10, 0.02 + rand() * 0.6, 50 + Math.floor(rand() * 20), `x${i}`));
      const grid = (['1/4', '1/8', '1/16', '1/8T'] as const)[trial % 4];
      const g = gridSeconds(97, grid);
      const out = quantizeNotes(notes, { bpm: 97, grid, strength: rand() });
      expect(out.length).toBe(notes.length);
      expect(new Set(out.map((n) => n.id))).toEqual(new Set(notes.map((n) => n.id)));
      out.forEach((n, i) => {
        expect(n.dur).toBeGreaterThanOrEqual(g - 1e-9);
        if (i > 0) expect(out[i - 1].start + out[i - 1].dur).toBeLessThanOrEqual(n.start + 1e-9);
        expect(n.midi).toBe(notes.find((m) => m.id === n.id)!.midi);
      });
    }
  });
});
