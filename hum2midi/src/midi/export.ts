// 10. MIDI 匯出（@tonejs/midi）。
// 已實測（tests/unit/midi.test.ts）：@tonejs/midi 2.0.28 用 header.setTempo(bpm) 設速度、
// 往 header.timeSignatures push { ticks, timeSignature: [4, 4] } 再呼叫 header.update() 設拍號；
// 兩者都寫在第 0 軌（conductor track），檔案格式為 Type 1，PPQ 480。
// 不寫調號：@tonejs/midi 2.0.28 寫調號時把升降記號數算成「索引 + 7」（例如 C 大調寫成 14），檔案會壞。

import { Midi } from '@tonejs/midi';

export type MidiNote = { midi: number; start: number; dur: number; velocity: number };

export type MidiTrackSpec = {
  name: string;
  notes: MidiNote[];
  /** 0–15；鼓組用 9（也就是 General MIDI 的 channel 10）。 */
  channel?: number;
  /** General MIDI 音色編號 0–127。 */
  program?: number;
};

export type MidiExportOptions = {
  /** null = 沒開節拍器也沒手動設定 BPM：tempo 寫 120，時間保持原樣（秒數不變）。 */
  bpm: number | null;
  tracks: MidiTrackSpec[];
  title?: string;
};

export const DEFAULT_BPM = 120;
export const DRUM_CHANNEL = 9;

export function buildMidi(opts: MidiExportOptions): Uint8Array {
  const midi = new Midi();
  midi.header.name = opts.title ?? 'hum2midi';
  // 先設 tempo 再加音符：音符的秒數是依 header 的 tempo 換算成 ticks
  midi.header.setTempo(opts.bpm ?? DEFAULT_BPM);
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] });
  midi.header.update();

  for (const spec of opts.tracks) {
    const track = midi.addTrack();
    track.name = spec.name;
    track.channel = spec.channel ?? 0;
    if (spec.program !== undefined) track.instrument.number = spec.program;
    for (const n of withoutOverlaps(spec.notes)) {
      const ticks = midi.header.secondsToTicks(n.start);
      const endTicks = Math.max(ticks + 1, midi.header.secondsToTicks(n.start + n.dur));
      track.addNote({
        midi: Math.max(0, Math.min(127, Math.round(n.midi))),
        ticks,
        durationTicks: endTicks - ticks,
        // @tonejs/midi 寫檔時用 floor(velocity × 127)，加半格避免浮點誤差少 1
        velocity: Math.min(1, (Math.max(1, Math.min(127, Math.round(n.velocity))) + 0.5) / 127),
      });
    }
  }
  return midi.toArray();
}

/** 同一個音高的音符如果重疊，截短前一個 — 否則下一個 note-on 之後的 note-off 會把它提早關掉。 */
function withoutOverlaps(notes: MidiNote[]): MidiNote[] {
  const sorted = [...notes].filter((n) => n.dur > 0).sort((a, b) => a.start - b.start);
  const last = new Map<number, MidiNote>();
  const out: MidiNote[] = [];
  for (const n of sorted) {
    const copy = { ...n };
    const prev = last.get(Math.round(n.midi));
    if (prev && prev.start + prev.dur > copy.start) prev.dur = Math.max(0, copy.start - prev.start);
    last.set(Math.round(n.midi), copy);
    out.push(copy);
  }
  return out.filter((n) => n.dur > 0);
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** hum-YYYYMMDD-HHmm.<ext>（本地時間） */
export function exportFileName(date: Date, ext: 'mid' | 'wav'): string {
  const d = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  return `hum-${d}-${pad(date.getHours())}${pad(date.getMinutes())}.${ext}`;
}
