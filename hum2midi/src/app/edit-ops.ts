// 鋼琴捲軸的編輯操作（純函式，回傳新陣列）與復原／重做歷史。

import type { Note } from '../types';

export const MIN_DUR = 0.03;

export function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => a.start - b.start || a.midi - b.midi);
}

const clampMidi = (m: number) => Math.max(0, Math.min(127, Math.round(m)));

/** 移動選取的音符：音高 ± 半音、時間 ± 秒（不會移到 0 秒之前，整組一起停）。 */
export function moveNotes(notes: Note[], ids: Set<string>, dMidi: number, dTime: number): Note[] {
  const earliest = Math.min(...notes.filter((n) => ids.has(n.id)).map((n) => n.start));
  const dt = Number.isFinite(earliest) ? Math.max(dTime, -earliest) : dTime;
  return sortNotes(notes.map((n) => (ids.has(n.id) ? { ...n, midi: clampMidi(n.midi + dMidi), start: n.start + dt } : n)));
}

export function resizeNote(notes: Note[], id: string, dur: number, minDur = MIN_DUR): Note[] {
  return notes.map((n) => (n.id === id ? { ...n, dur: Math.max(minDur, dur) } : n));
}

export function deleteNotes(notes: Note[], ids: Set<string>): Note[] {
  return notes.filter((n) => !ids.has(n.id));
}

export function addNote(notes: Note[], note: Note): Note[] {
  return sortNotes([...notes, { ...note, midi: clampMidi(note.midi), start: Math.max(0, note.start), dur: Math.max(MIN_DUR, note.dur) }]);
}

export function transpose(notes: Note[], ids: Set<string>, d: number): Note[] {
  return notes.map((n) => (ids.has(n.id) ? { ...n, midi: clampMidi(n.midi + d) } : n));
}

/** ← → 切換選取：依時間順序的前一個／下一個音符。沒有選取時選第一個（或最後一個）。 */
export function neighborId(notes: Note[], current: string | null, dir: 1 | -1): string | null {
  const sorted = sortNotes(notes);
  if (!sorted.length) return null;
  const i = current ? sorted.findIndex((n) => n.id === current) : -1;
  if (i < 0) return (dir > 0 ? sorted[0] : sorted[sorted.length - 1]).id;
  return sorted[Math.max(0, Math.min(sorted.length - 1, i + dir))].id;
}

const LIMIT = 200;

/** 存整份音符陣列的快照（音符很少，簡單可靠）。 */
export class History {
  private past: Note[][] = [];
  private future: Note[][] = [];

  /** 改動「之前」呼叫，存下改動前的狀態。 */
  record(before: Note[]) {
    this.past.push(before);
    if (this.past.length > LIMIT) this.past.shift();
    this.future = [];
  }

  undo(current: Note[]): Note[] | null {
    const prev = this.past.pop();
    if (!prev) return null;
    this.future.push(current);
    return prev;
  }

  redo(current: Note[]): Note[] | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(current);
    return next;
  }

  clear() {
    this.past = [];
    this.future = [];
  }

  get canUndo() {
    return this.past.length > 0;
  }

  get canRedo() {
    return this.future.length > 0;
  }
}
