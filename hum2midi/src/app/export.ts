// 匯出：MIDI（Hum 一軌）與原始錄音 WAV。

import { encodeWav } from '../audio/wav';
import { buildMidi, exportFileName } from '../midi/export';
import type { Note, Take } from '../types';
import { download } from '../ui/dom';
import type { Session } from './state';

/** 匯出用的音符：有 BPM 時把第 1 小節第 1 拍移到 0 秒；沒有 BPM 時時間保持原樣。 */
export function exportNotes(take: Pick<Take, 'notes' | 'bpm' | 'gridOffset'>): Note[] {
  const shift = take.bpm ? (take.gridOffset ?? 0) : 0;
  if (!shift) return take.notes;
  return take.notes
    .map((n) => ({ ...n, start: n.start - shift }))
    .filter((n) => n.start + n.dur > 0)
    .map((n) => (n.start < 0 ? { ...n, dur: n.dur + n.start, start: 0 } : n));
}

export function exportMidi(session: Session) {
  const bytes = buildMidi({ bpm: session.take.bpm, tracks: [{ name: 'Hum', notes: exportNotes(session.take) }], title: session.take.name });
  download(bytes, exportFileName(new Date(), 'mid'), 'audio/midi');
}

export function exportWav(session: Session) {
  download(encodeWav(session.samples, session.take.sampleRate), exportFileName(new Date(), 'wav'), 'audio/wav');
}
