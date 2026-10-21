import { describe, expect, it } from 'vitest';
import { VOICING_HIGH, VOICING_LOW, chordNotes, chordPitchClasses, chordSegments, chordSymbol, drumPattern, harmonize, voiceChords } from '../../src/analysis/harmonize';
import type { Note } from '../../src/types';

/** 每小節 4 拍；beats：每個音的拍數 */
function melody(bars: number[][], bpm: number, beatsEach?: number[][]): Note[] {
  const beat = 60 / bpm;
  const out: Note[] = [];
  bars.forEach((bar, b) => {
    let t = b * 4;
    bar.forEach((m, i) => {
      const len = beatsEach?.[b][i] ?? 4 / bar.length;
      out.push({ id: `${b}.${i}`, midi: m, start: t * beat, dur: len * beat, velocity: 90 });
      t += len;
    });
  });
  return out;
}

const C = { tonic: 0, mode: 'major' as const };

describe('配和弦', () => {
  it('C-E-G | F-A-C | G-B-D | C → I IV V I', () => {
    const notes = melody([[60, 64, 67], [65, 69, 72], [67, 71, 74], [72]], 100);
    const chords = harmonize(notes, { bpm: 100, origin: 0, key: C });
    expect(chords.map((c) => c.name)).toEqual(['I', 'IV', 'V', 'I']);
    expect(chords.map(chordSymbol)).toEqual(['C', 'F', 'G', 'C']);
    [0, 2.4, 4.8, 7.2].forEach((t, i) => expect(chords[i].start).toBeCloseTo(t, 9));
  });

  it('小調：A-C-E | D-F-A | E-G♯-B | A → i iv V i', () => {
    const notes = melody([[69, 72, 76], [74, 77, 81], [76, 80, 83], [81]], 100);
    const chords = harmonize(notes, { bpm: 100, origin: 0, key: { tonic: 9, mode: 'minor' } });
    expect(chords.map((c) => c.name)).toEqual(['i', 'iv', 'V', 'i']);
  });

  it('段落：每小節一個；BPM < 90 或一小節 ≥ 6 個音 → 半小節', () => {
    const slow = melody([[60, 64, 67], [65]], 80);
    expect(chordSegments(slow, { bpm: 80, origin: 0, key: C }).length).toBe(4);
    const busy = melody([[60, 62, 64, 65, 67, 69], [72]], 120);
    expect(chordSegments(busy, { bpm: 120, origin: 0, key: C }).length).toBe(3);
    const plain = melody([[60, 64, 67], [65]], 120);
    expect(chordSegments(plain, { bpm: 120, origin: 0, key: C }).length).toBe(2);
  });

  it('半小節選到同一個和弦會合併成一個', () => {
    const notes = melody([[60, 64, 67, 72], [67, 71, 74, 79], [72]], 80);
    const chords = harmonize(notes, { bpm: 80, origin: 0, key: C });
    expect(chords.map((c) => c.name)).toEqual(['I', 'V', 'I']);
    expect(chords[0].dur).toBeCloseTo(3, 9); // 一整個小節（80 BPM：一小節 3 秒）
  });

  it('格線原點不在 0 秒時，段落從原點起算', () => {
    const notes = melody([[60, 64, 67], [65, 69, 72]], 120).map((n) => ({ ...n, start: n.start + 0.37 }));
    const chords = harmonize(notes, { bpm: 120, origin: 0.37, key: C });
    expect(chords[0].start).toBeCloseTo(0.37, 9);
    expect(chords.map((c) => c.name)).toEqual(['I', 'IV']);
  });

  it('沒有音符 → 沒有和弦', () => {
    expect(harmonize([], { bpm: 120, origin: 0, key: C })).toEqual([]);
  });
});

describe('配置與伴奏', () => {
  const chords = [
    { root: 0, quality: 'maj' as const, start: 0, dur: 2 },
    { root: 5, quality: 'maj' as const, start: 2, dur: 2 },
    { root: 7, quality: 'maj' as const, start: 4, dur: 2 },
    { root: 9, quality: 'min' as const, start: 6, dur: 2 },
  ];

  it('每個和弦 4 個音、落在 C3–C5、根音在最低、都是和弦音', () => {
    const v = voiceChords(chords);
    v.forEach((notes, i) => {
      expect(notes.length).toBe(4);
      for (const m of notes) {
        expect(m).toBeGreaterThanOrEqual(VOICING_LOW);
        expect(m).toBeLessThanOrEqual(VOICING_HIGH);
        expect(chordPitchClasses(chords[i].root, chords[i].quality)).toContain(m % 12);
      }
      expect(notes[0] % 12).toBe(chords[i].root);
      expect(Math.min(...notes)).toBe(notes[0]);
    });
  });

  it('voice leading：上方三音的移動比「全部用原位」少', () => {
    const v = voiceChords(chords);
    const moves = (vs: number[][]) => vs.slice(1).reduce((s, cur, i) => s + cur.slice(1).reduce((a, m, k) => a + Math.abs(m - vs[i][k + 1]), 0), 0);
    const rootPos = chords.map((c) => {
      const b = 48 + c.root;
      const [r, third, fifth] = chordPitchClasses(c.root, c.quality);
      const up = (pc: number, above: number) => {
        let m = above + 1;
        while (m % 12 !== pc) m++;
        return m;
      };
      const u1 = up(r, b);
      const u2 = up(third, u1);
      return [b, u1, u2, up(fifth, u2)];
    });
    expect(moves(v)).toBeLessThan(moves(rootPos));
    // C → F：上方三音每個聲部最多移動 2 個半音
    v[1].slice(1).forEach((m, k) => expect(Math.abs(m - v[0][k + 1])).toBeLessThanOrEqual(2));
  });

  it('長音（pad）：每個和弦的音同時開始、長度等於和弦；分解和弦：八分音符上行', () => {
    const pad = chordNotes(chords.slice(0, 1), 120, 'pad');
    expect(pad.length).toBe(4);
    expect(new Set(pad.map((n) => n.start))).toEqual(new Set([0]));
    expect(pad.every((n) => n.dur === 2)).toBe(true);
    const arp = chordNotes(chords.slice(0, 1), 120, 'arpeggio');
    expect(arp.length).toBe(8); // 2 秒 @120 = 8 個八分音符
    expect(arp.map((n) => n.start)).toEqual([0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75]);
    expect(arp.slice(0, 4).map((n) => n.midi)).toEqual([...arp.slice(0, 4).map((n) => n.midi)].sort((a, b) => a - b));
  });

  it('鼓組：第 1、3 拍 kick、第 2、4 拍 snare、八分音符 hi-hat', () => {
    const d = drumPattern(120, 0, 2); // 一小節
    expect(d.filter((x) => x.hit === 'kick').map((x) => x.time)).toEqual([0, 1]);
    expect(d.filter((x) => x.hit === 'snare').map((x) => x.time)).toEqual([0.5, 1.5]);
    expect(d.filter((x) => x.hit === 'hihat').length).toBe(8);
  });
});
