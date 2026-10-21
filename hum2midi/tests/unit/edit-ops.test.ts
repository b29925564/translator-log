import { describe, expect, it } from 'vitest';
import { History, addNote, deleteNotes, moveNotes, neighborId, resizeNote, transpose } from '../../src/app/edit-ops';
import type { Note } from '../../src/types';

const n = (id: string, midi: number, start: number, dur = 0.4): Note => ({ id, midi, start, dur, velocity: 90 });
const base = [n('a', 60, 0), n('b', 62, 0.5), n('c', 64, 1)];

describe('編輯操作', () => {
  it('移動：音高與時間，結果依時間排序；整組不會移到 0 秒之前', () => {
    const out = moveNotes(base, new Set(['c']), -5, -0.8);
    expect(out.map((x) => x.id)).toEqual(['a', 'c', 'b']);
    expect(out[1].midi).toBe(59);
    expect(out[1].start).toBeCloseTo(0.2, 12);
    const clamped = moveNotes(base, new Set(['a', 'b']), 0, -3);
    expect(clamped.find((x) => x.id === 'a')!.start).toBe(0);
    expect(clamped.find((x) => x.id === 'b')!.start).toBe(0.5);
  });

  it('改長度有下限；刪除；新增會夾在合法範圍並排序', () => {
    expect(resizeNote(base, 'b', 0.001)[1].dur).toBe(0.03);
    expect(resizeNote(base, 'b', 1.2)[1].dur).toBe(1.2);
    expect(deleteNotes(base, new Set(['a', 'c'])).map((x) => x.id)).toEqual(['b']);
    const added = addNote(base, n('z', 140, 0.7, 0));
    expect(added.map((x) => x.id)).toEqual(['a', 'b', 'z', 'c']);
    expect(added[2]).toMatchObject({ midi: 127, dur: 0.03 });
  });

  it('↑↓ 半音；← → 切換選取', () => {
    expect(transpose(base, new Set(['b']), 1)[1].midi).toBe(63);
    expect(transpose(base, new Set(['a']), -100)[0].midi).toBe(0);
    expect(neighborId(base, 'b', 1)).toBe('c');
    expect(neighborId(base, 'c', 1)).toBe('c');
    expect(neighborId(base, 'a', -1)).toBe('a');
    expect(neighborId(base, null, 1)).toBe('a');
    expect(neighborId(base, null, -1)).toBe('c');
    expect(neighborId([], null, 1)).toBe(null);
  });

  it('原始陣列不被修改', () => {
    const copy = structuredClone(base);
    moveNotes(base, new Set(['a']), 3, 1);
    resizeNote(base, 'a', 2);
    transpose(base, new Set(['a']), 2);
    expect(base).toEqual(copy);
  });
});

describe('復原／重做', () => {
  it('undo → redo 來回；新的改動清掉 redo', () => {
    const h = new History();
    let notes = base;
    h.record(notes);
    notes = deleteNotes(notes, new Set(['a']));
    h.record(notes);
    notes = transpose(notes, new Set(['b']), 2);

    notes = h.undo(notes)!;
    expect(notes.map((x) => x.midi)).toEqual([62, 64]);
    notes = h.undo(notes)!;
    expect(notes).toBe(base);
    expect(h.undo(notes)).toBe(null);
    expect(h.canRedo).toBe(true);

    notes = h.redo(notes)!;
    expect(notes.map((x) => x.id)).toEqual(['b', 'c']);
    h.record(notes);
    expect(h.canRedo).toBe(false);
    expect(addNote(notes, n('d', 70, 3)).length).toBe(3);
  });
});
