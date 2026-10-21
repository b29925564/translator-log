import { describe, expect, it } from 'vitest';
import { exportNotes } from '../../src/app/export';
import type { Note } from '../../src/types';

const n = (start: number, dur: number): Note => ({ id: `n${start}`, midi: 60, start, dur, velocity: 90 });

describe('匯出用的音符時間', () => {
  it('沒有 BPM：時間保持原樣（就算有 gridOffset）', () => {
    const notes = [n(0.3, 0.5), n(1, 0.5)];
    expect(exportNotes({ notes, bpm: null, gridOffset: 0.3 })).toBe(notes);
  });

  it('有 BPM：第 1 小節第 1 拍移到 0 秒；在它之前的音截掉或丟掉', () => {
    const out = exportNotes({ notes: [n(0.1, 0.1), n(0.4, 0.4), n(1, 0.5)], bpm: 100, gridOffset: 0.5 });
    expect(out.map((x) => [+x.start.toFixed(6), +x.dur.toFixed(6)])).toEqual([[0, 0.3], [0.5, 0.5]]);
  });

  it('節拍器錄的（gridOffset 0）不動', () => {
    const notes = [n(0, 0.5)];
    expect(exportNotes({ notes, bpm: 90, gridOffset: 0 })).toBe(notes);
  });
});
