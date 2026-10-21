// 7.6 調性偵測（Krumhansl–Kessler）與吸附到音階。

import type { Key, Note } from '../types';

export const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
export const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

/** 自然大調、自然小調的音階（從主音起算的半音數）。 */
export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
} as const;

export type KeyCandidate = Key & { score: number };

/** 時值加權的音高類別直方圖（12 維）。 */
export function pitchClassHistogram(notes: Pick<Note, 'midi' | 'dur'>[]): number[] {
  const h = new Array<number>(12).fill(0);
  for (const n of notes) h[((Math.round(n.midi) % 12) + 12) % 12] += Math.max(0, n.dur);
  return h;
}

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}

/** 24 個調依相關係數由高到低排序；沒有音符時回傳空陣列。 */
export function rankKeys(notes: Pick<Note, 'midi' | 'dur'>[]): KeyCandidate[] {
  const hist = pitchClassHistogram(notes);
  if (hist.every((x) => x === 0)) return [];
  const out: KeyCandidate[] = [];
  for (let tonic = 0; tonic < 12; tonic++) {
    // 輪廓是從主音起算：把直方圖轉到「以這個主音為第 0 格」再比
    const rotated = hist.map((_, i) => hist[(i + tonic) % 12]);
    out.push({ tonic, mode: 'major', score: pearson(rotated, MAJOR_PROFILE) });
    out.push({ tonic, mode: 'minor', score: pearson(rotated, MINOR_PROFILE) });
  }
  // 分數相同時固定順序（主音小的、大調在前），結果可重現
  return out.sort((a, b) => b.score - a.score || a.tonic - b.tonic || (a.mode === 'major' ? -1 : 1));
}

export function inKey(midi: number, key: Key): boolean {
  const pc = (((Math.round(midi) - key.tonic) % 12) + 12) % 12;
  return (SCALES[key.mode] as readonly number[]).includes(pc);
}

/**
 * 調外音移到最近的調內音；距離相同時，往原始 midiFloat（pitch）偏移的方向移。
 * 沒有原始音高（手動新增的音符）時，距離相同就往下。
 */
export function snapToKey(midi: number, key: Key, pitch?: number): number {
  if (inKey(midi, key)) return midi;
  for (let d = 1; d <= 6; d++) {
    const up = inKey(midi + d, key);
    const down = inKey(midi - d, key);
    if (up && down) return pitch !== undefined && pitch > midi ? midi + d : midi - d;
    if (up) return midi + d;
    if (down) return midi - d;
  }
  return midi;
}

const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

/** "C 大調"、"A 小調" */
export function keyName(key: Key): string {
  return `${NAMES[key.tonic]} ${key.mode === 'major' ? '大調' : '小調'}`;
}
