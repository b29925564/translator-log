// 9. 自動配和弦（Viterbi）、配置（voicing）、伴奏型、鼓組。

import type { Chord, ChordQuality, Key, Note } from '../types';
import { inKey } from './key';

export const BEATS_PER_BAR = 4;

type Degree = { name: string; degree: number; quality: ChordQuality };

/** 候選和弦（從主音起算的半音數＋性質）。小調的 v 可以換成 V，兩個都列為候選。 */
export const CANDIDATES: Record<Key['mode'], Degree[]> = {
  major: [
    { name: 'I', degree: 0, quality: 'maj' },
    { name: 'ii', degree: 2, quality: 'min' },
    { name: 'iii', degree: 4, quality: 'min' },
    { name: 'IV', degree: 5, quality: 'maj' },
    { name: 'V', degree: 7, quality: 'maj' },
    { name: 'vi', degree: 9, quality: 'min' },
  ],
  minor: [
    { name: 'i', degree: 0, quality: 'min' },
    { name: 'III', degree: 3, quality: 'maj' },
    { name: 'iv', degree: 5, quality: 'min' },
    { name: 'v', degree: 7, quality: 'min' },
    { name: 'V', degree: 7, quality: 'maj' },
    { name: 'VI', degree: 8, quality: 'maj' },
    { name: 'VII', degree: 10, quality: 'maj' },
  ],
};

/** 常見進行 +1。小調用對應的級數（I→i、IV→iv、V→V／v、vi→VI；ii 在小調候選裡沒有）。 */
const COMMON: Record<Key['mode'], string[]> = {
  major: ['I>IV', 'I>V', 'I>vi', 'IV>V', 'IV>I', 'V>I', 'V>vi', 'vi>IV', 'ii>V'],
  minor: ['i>iv', 'i>V', 'i>v', 'i>VI', 'iv>V', 'iv>v', 'iv>i', 'V>i', 'v>i', 'V>VI', 'v>VI', 'VI>iv'],
};

const INTERVALS: Record<ChordQuality, number[]> = { maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6] };

export function chordPitchClasses(root: number, quality: ChordQuality): number[] {
  return INTERVALS[quality].map((i) => (root + i) % 12);
}

export type HarmonizeOptions = {
  bpm: number;
  /** 第 1 小節第 1 拍（秒）。 */
  origin: number;
  key: Key;
};

type Segment = { start: number; end: number; bar: number };

export type HarmonizedChord = Chord & { name: string };

/** 段落：每小節一個；BPM < 90 或該小節音符 ≥ 6 個時，切成兩個半小節。 */
export function chordSegments(notes: Note[], opts: HarmonizeOptions): Segment[] {
  if (!notes.length) return [];
  const bar = (60 / opts.bpm) * BEATS_PER_BAR;
  const end = Math.max(...notes.map((n) => n.start + n.dur));
  const firstBar = Math.floor((Math.min(...notes.map((n) => n.start)) - opts.origin) / bar + 1e-9);
  const lastBar = Math.ceil((end - opts.origin) / bar - 1e-9) - 1;
  const segs: Segment[] = [];
  for (let b = firstBar; b <= Math.max(firstBar, lastBar); b++) {
    const s = opts.origin + b * bar;
    const inBar = notes.filter((n) => n.start >= s - 1e-9 && n.start < s + bar - 1e-9).length;
    if (opts.bpm < 90 || inBar >= 6) {
      segs.push({ start: s, end: s + bar / 2, bar: b }, { start: s + bar / 2, end: s + bar, bar: b });
    } else segs.push({ start: s, end: s + bar, bar: b });
  }
  return segs;
}

/** 一個段落配某個和弦的分數：Σ 音符在段落內的時值 × 權重。 */
export function emission(notes: Note[], seg: Segment, root: number, quality: ChordQuality, opts: HarmonizeOptions): number {
  const tones = chordPitchClasses(root, quality);
  const beat = 60 / opts.bpm;
  let score = 0;
  for (const n of notes) {
    const overlap = Math.min(n.start + n.dur, seg.end) - Math.max(n.start, seg.start);
    if (overlap <= 0) continue;
    const pc = ((n.midi % 12) + 12) % 12;
    let w: number;
    if (tones.includes(pc)) w = 3;
    else if (inKey(n.midi, opts.key)) {
      // 強拍：每小節第 1、3 拍
      const pos = (n.start - opts.origin) / beat;
      const onBeat = Math.abs(pos - Math.round(pos)) < 0.05;
      const strong = onBeat && (((Math.round(pos) % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR) % 2 === 0;
      w = strong ? -0.5 : 0.5;
    } else w = -2;
    score += (overlap / beat) * w;
  }
  return score;
}

/** Viterbi：段落分數＋轉移分數（常見進行 +1、跨小節連續同一和弦 −0.5、頭尾是主和弦各 +1）總和最高的序列。 */
export function harmonize(notes: Note[], opts: HarmonizeOptions): HarmonizedChord[] {
  const segs = chordSegments(notes, opts);
  if (!segs.length) return [];
  const cands = CANDIDATES[opts.key.mode];
  const common = new Set(COMMON[opts.key.mode]);
  const tonicName = cands[0].name;
  const roots = cands.map((c) => (opts.key.tonic + c.degree) % 12);
  const emit = segs.map((seg) => cands.map((c, j) => emission(notes, seg, roots[j], c.quality, opts)));

  const trans = (i: number, j: number, sameBar: boolean) => {
    let s = common.has(`${cands[i].name}>${cands[j].name}`) ? 1 : 0;
    if (i === j && !sameBar) s -= 0.5;
    return s;
  };

  const n = segs.length;
  const score: number[][] = [cands.map((c, j) => emit[0][j] + (c.name === tonicName ? 1 : 0))];
  const back: number[][] = [cands.map(() => -1)];
  for (let t = 1; t < n; t++) {
    const sameBar = segs[t].bar === segs[t - 1].bar;
    score.push([]);
    back.push([]);
    for (let j = 0; j < cands.length; j++) {
      let best = -Infinity;
      let arg = 0;
      for (let i = 0; i < cands.length; i++) {
        const v = score[t - 1][i] + trans(i, j, sameBar);
        if (v > best + 1e-12) {
          best = v;
          arg = i;
        }
      }
      score[t][j] = best + emit[t][j];
      back[t][j] = arg;
    }
  }
  let last = 0;
  let bestEnd = -Infinity;
  for (let j = 0; j < cands.length; j++) {
    const v = score[n - 1][j] + (cands[j].name === tonicName ? 1 : 0);
    if (v > bestEnd + 1e-12) {
      bestEnd = v;
      last = j;
    }
  }
  const path = new Array<number>(n);
  path[n - 1] = last;
  for (let t = n - 1; t > 0; t--) path[t - 1] = back[t][path[t]];

  // 同一小節裡兩個半小節選到同一個和弦就合併
  const out: HarmonizedChord[] = [];
  segs.forEach((seg, t) => {
    const c = cands[path[t]];
    const prev = out[out.length - 1];
    if (prev && t > 0 && segs[t - 1].bar === seg.bar && path[t - 1] === path[t]) prev.dur = seg.end - prev.start;
    else out.push({ name: c.name, root: roots[path[t]], quality: c.quality, start: seg.start, dur: seg.end - seg.start });
  });
  return out;
}

// ---------- 配置（voicing）與伴奏型 ----------

export const VOICING_LOW = 48; // C3
export const VOICING_HIGH = 72; // C5

/**
 * 每個和弦 4 個音、全部落在 C3–C5：低音是根音（C3–B3），上面三個音是密集排列的三和弦，
 * 從所有轉位中挑「跟前一個和弦的上方三音總移動距離最小」的（voice leading）。
 */
export function voiceChords(chords: Chord[]): number[][] {
  const out: number[][] = [];
  let prevUpper: number[] | null = null;
  for (const c of chords) {
    const bass = VOICING_LOW + ((c.root - VOICING_LOW) % 12 + 12) % 12;
    const pcs = chordPitchClasses(c.root, c.quality);
    const options: number[][] = [];
    for (let inv = 0; inv < 3; inv++) {
      const order = [pcs[inv], pcs[(inv + 1) % 3], pcs[(inv + 2) % 3]];
      for (let base = bass + 1; base <= VOICING_HIGH; base++) {
        if (base % 12 !== order[0]) continue;
        const v = [base];
        for (const pc of order.slice(1)) {
          let m = v[v.length - 1] + 1;
          while (m % 12 !== pc) m++;
          v.push(m);
        }
        if (v[2] <= VOICING_HIGH) options.push(v);
      }
    }
    const target: number[] = prevUpper ?? [60, 64, 67];
    const cost = (v: number[]): number => v.reduce((s, m, i) => s + Math.abs(m - target[i]), 0);
    const upper: number[] = options.reduce((best, v) => (cost(v) < cost(best) ? v : best), options[0]);
    prevUpper = upper;
    out.push([bass, ...upper]);
  }
  return out;
}

export type ChordPattern = 'pad' | 'arpeggio';

/** 把和弦展開成音符：長音（pad）或分解和弦（八分音符上行）。 */
export function chordNotes(chords: Chord[], bpm: number, pattern: ChordPattern, velocity = 70): Omit<Note, 'id'>[] {
  const voicings = voiceChords(chords);
  const out: Omit<Note, 'id'>[] = [];
  const eighth = 30 / bpm;
  chords.forEach((c, i) => {
    const v = voicings[i];
    if (pattern === 'pad') {
      for (const m of v) out.push({ midi: m, start: c.start, dur: c.dur, velocity });
      return;
    }
    const steps = Math.max(1, Math.round(c.dur / eighth));
    for (let k = 0; k < steps; k++) {
      const start = c.start + k * eighth;
      out.push({ midi: v[k % v.length], start, dur: Math.min(eighth, c.start + c.dur - start), velocity });
    }
  });
  return out;
}

/** General MIDI 鼓組音高（channel 10）。 */
export const GM_DRUMS = { kick: 36, snare: 38, hihat: 42 } as const;

export type DrumEvent = { hit: keyof typeof GM_DRUMS; time: number; velocity: number };

/** 簡單鼓組：第 1、3 拍 kick，第 2、4 拍 snare，八分音符 hi-hat。從 start 到 end（秒）。 */
export function drumPattern(bpm: number, start: number, end: number): DrumEvent[] {
  const eighth = 30 / bpm;
  const out: DrumEvent[] = [];
  for (let k = 0; start + k * eighth < end - 1e-9; k++) {
    const t = start + k * eighth;
    const beatInBar = (k / 2) % BEATS_PER_BAR;
    if (k % 2 === 0) {
      if (beatInBar === 0 || beatInBar === 2) out.push({ hit: 'kick', time: t, velocity: beatInBar === 0 ? 110 : 95 });
      else out.push({ hit: 'snare', time: t, velocity: 100 });
    }
    out.push({ hit: 'hihat', time: t, velocity: k % 2 === 0 ? 80 : 60 });
  }
  return out;
}

const ROOT_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

/** "C"、"Am"、"Bdim" */
export function chordSymbol(c: Pick<Chord, 'root' | 'quality'>): string {
  return `${ROOT_NAMES[c.root % 12]}${c.quality === 'min' ? 'm' : c.quality === 'dim' ? 'dim' : ''}`;
}
