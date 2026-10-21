// MIDI 來回測試：匯出 → 用 @tonejs/midi 解析 → 音符、tempo、拍號、track 名稱一致。
import { Midi } from '@tonejs/midi';
import { parseMidi } from 'midi-file';
import { describe, expect, it } from 'vitest';
import { DRUM_CHANNEL, buildMidi, exportFileName, type MidiNote } from '../../src/midi/export';

const hum: MidiNote[] = [
  { midi: 60, start: 0.0, dur: 0.5, velocity: 96 },
  { midi: 62, start: 0.5, dur: 0.25, velocity: 64 },
  { midi: 64, start: 0.75, dur: 0.25, velocity: 1 },
  { midi: 67, start: 1.0, dur: 1.0, velocity: 127 },
];

describe('MIDI 匯出', () => {
  it('來回：音符（音高、起點、長度、力度）、tempo、4/4、track 名稱都一致', () => {
    const bytes = buildMidi({ bpm: 90, tracks: [{ name: 'Hum', notes: hum }] });
    const midi = new Midi(bytes);
    expect(midi.header.tempos.map((t) => Math.round(t.bpm * 1000) / 1000)).toEqual([90]);
    expect(midi.header.timeSignatures.map((t) => t.timeSignature)).toEqual([[4, 4]]);
    const named = midi.tracks.filter((t) => t.notes.length);
    expect(named.map((t) => t.name)).toEqual(['Hum']);
    const notes = named[0].notes;
    expect(notes.map((n) => n.midi)).toEqual(hum.map((n) => n.midi));
    expect(notes.map((n) => Math.round(n.velocity * 127))).toEqual(hum.map((n) => n.velocity));
    notes.forEach((n, i) => {
      // PPQ 480 @ 90 BPM：1 tick ≈ 1.4 ms
      expect(n.time).toBeCloseTo(hum[i].start, 2);
      expect(n.duration).toBeCloseTo(hum[i].dur, 2);
    });
  });

  it('沒有 BPM → tempo 120，時間保持原樣（秒數不變、不量化）', () => {
    const odd: MidiNote[] = [{ midi: 57, start: 0.3137, dur: 0.4211, velocity: 80 }];
    const midi = new Midi(buildMidi({ bpm: null, tracks: [{ name: 'Hum', notes: odd }] }));
    expect(midi.header.tempos[0].bpm).toBe(120);
    const n = midi.tracks.find((t) => t.notes.length)!.notes[0];
    expect(Math.abs(n.time - 0.3137)).toBeLessThan(0.0011); // 120 BPM、PPQ 480：1 tick ≈ 1.04 ms
    expect(Math.abs(n.duration - 0.4211)).toBeLessThan(0.0021);
  });

  it('實測：tempo 與拍號真的寫成 MIDI meta event（FF 51、FF 58），在第 0 軌', () => {
    const parsed = parseMidi(buildMidi({ bpm: 75, tracks: [{ name: 'Hum', notes: hum }] }));
    expect(parsed.header.format).toBe(1);
    expect(parsed.header.ticksPerBeat).toBe(480);
    const conductor = parsed.tracks[0];
    const tempo = conductor.find((e) => e.type === 'setTempo');
    const ts = conductor.find((e) => e.type === 'timeSignature');
    expect(tempo && 'microsecondsPerBeat' in tempo && tempo.microsecondsPerBeat).toBe(800000); // 60e6 / 75
    expect(ts && 'numerator' in ts && [ts.numerator, ts.denominator]).toEqual([4, 4]);
  });

  it('多軌（說話變唱歌）：Melody、Chords、Drums（channel 10）', () => {
    const chords: MidiNote[] = [
      { midi: 48, start: 0, dur: 2, velocity: 70 },
      { midi: 52, start: 0, dur: 2, velocity: 70 },
      { midi: 55, start: 0, dur: 2, velocity: 70 },
    ];
    const drums: MidiNote[] = [
      { midi: 36, start: 0, dur: 0.1, velocity: 100 },
      { midi: 38, start: 0.5, dur: 0.1, velocity: 100 },
    ];
    const midi = new Midi(
      buildMidi({
        bpm: 100,
        tracks: [
          { name: 'Melody', notes: hum },
          { name: 'Chords', notes: chords, channel: 1 },
          { name: 'Drums', notes: drums, channel: DRUM_CHANNEL },
        ],
      }),
    );
    const tracks = midi.tracks.filter((t) => t.notes.length);
    expect(tracks.map((t) => t.name)).toEqual(['Melody', 'Chords', 'Drums']);
    expect(tracks.map((t) => t.channel)).toEqual([0, 1, 9]);
    expect(tracks[2].instrument.percussion).toBe(true);
    expect(tracks[1].notes.length).toBe(3);
  });

  it('同音高重疊的音符會截短前一個；長度 0 的音符略過', () => {
    const midi = new Midi(
      buildMidi({
        bpm: 120,
        tracks: [
          {
            name: 'Hum',
            notes: [
              { midi: 60, start: 0, dur: 1, velocity: 90 },
              { midi: 60, start: 0.5, dur: 1, velocity: 90 },
              { midi: 62, start: 3, dur: 0, velocity: 90 },
            ],
          },
        ],
      }),
    );
    const notes = midi.tracks.find((t) => t.notes.length)!.notes;
    expect(notes.length).toBe(2);
    expect(notes[0].duration).toBeCloseTo(0.5, 3);
  });

  it('檔名 hum-YYYYMMDD-HHmm.mid', () => {
    expect(exportFileName(new Date(2026, 0, 5, 9, 7), 'mid')).toBe('hum-20260105-0907.mid');
    expect(exportFileName(new Date(2026, 11, 31, 23, 59), 'wav')).toBe('hum-20261231-2359.wav');
  });
});
