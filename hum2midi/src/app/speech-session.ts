// 說話變唱歌：從一句話建立 take、分析、組出伴奏與多軌 MIDI。

import { analysisClient } from '../analysis/client';
import { frameRms, noiseFloor } from '../analysis/pitch-track';
import { BEATS_PER_BAR, GM_DRUMS, chordNotes, drumPattern, type DrumEvent } from '../analysis/harmonize';
import type { PlaySource } from '../audio/player';
import { trimSilence } from '../audio/trim';
import { encodeWav } from '../audio/wav';
import { DRUM_CHANNEL, buildMidi, exportFileName, type MidiNote } from '../midi/export';
import { DEFAULT_SETTINGS, DEFAULT_SPEECH, type Note, type Take } from '../types';
import { download } from '../ui/dom';
import { saveNewSession } from './library';
import { defaultTakeName, newId } from './session';
import type { SpeechSession } from './state';

export async function analyzeSpeechSession(take: Take, samples: Float32Array): Promise<SpeechSession> {
  const sp = take.speech ?? DEFAULT_SPEECH;
  const analysis = await analysisClient().analyzeSpeech(take.id, take.settings, samples, take.sampleRate, {
    exaggeration: sp.exaggeration,
    key: take.key ?? null,
    noiseFloor: sp.noiseFloor,
  });
  const notes: Note[] = analysis.notes.map(({ id, midi, start, dur, velocity }) => ({ id, midi, start, dur, velocity }));
  const chords = analysis.chords.map(({ root, quality, start, dur }) => ({ root, quality, start, dur }));
  return { take: { ...take, notes, chords, bpm: analysis.bpm, gridOffset: analysis.gridOffset }, samples, analysis };
}

/**
 * 一句話（錄的或從庫裡框選的）→ 修剪頭尾靜音 → 新的說話變唱歌 take（自動存進庫）。
 * floorSource：用來量底噪的音訊（框選時是整段來源錄音）；預設是修剪前的這一句。
 */
export async function speechSessionFromSamples(raw: Float32Array, sampleRate: number, floorSource: Float32Array = raw): Promise<SpeechSession> {
  const floor = noiseFloor(frameRms(floorSource, sampleRate));
  const { samples } = trimSilence(raw, sampleRate);
  const now = new Date();
  const take: Take = {
    id: newId(),
    name: `說話 ${defaultTakeName(now)}`,
    createdAt: now.getTime(),
    mode: 'speech-song',
    sampleRate,
    audio: new Blob([encodeWav(samples, sampleRate)], { type: 'audio/wav' }),
    notes: [],
    bpm: null,
    gridOffset: 0,
    settings: structuredClone(DEFAULT_SETTINGS),
    speech: { ...structuredClone(DEFAULT_SPEECH), noiseFloor: floor > 0 ? floor : undefined },
  };
  const session = await analyzeSpeechSession(take, samples);
  await saveNewSession(session);
  return session;
}

/** 伴奏涵蓋的小節數（至少 1）。 */
export function barCount(s: SpeechSession): number {
  const bpm = s.take.bpm ?? 100;
  const bar = (60 / bpm) * BEATS_PER_BAR;
  const end = Math.max(s.take.gridOffset ?? 0, ...(s.take.chords ?? []).map((c) => c.start + c.dur), ...s.take.notes.map((n) => n.start + n.dur));
  return Math.max(1, Math.ceil((end - (s.take.gridOffset ?? 0)) / bar - 1e-6));
}

export function accompaniment(s: SpeechSession): MidiNote[] {
  const sp = s.take.speech ?? DEFAULT_SPEECH;
  return chordNotes(s.take.chords ?? [], s.take.bpm ?? 100, sp.pattern);
}

export function drums(s: SpeechSession): DrumEvent[] {
  const bpm = s.take.bpm ?? 100;
  const start = s.take.gridOffset ?? 0;
  return drumPattern(bpm, start, start + barCount(s) * (60 / bpm) * BEATS_PER_BAR);
}

/**
 * 播放用的來源。循環一輪的長度剛好是整數個小節（從 0 秒開始、長度 = 小節數 × 一小節），
 * 循環時速度不會跳；第一拍前面那一小段（子音、緩衝）每一輪都在同樣的位置。
 */
export function playSource(s: SpeechSession, what: 'voice' | 'melody', withDrums: boolean): PlaySource {
  const bpm = s.take.bpm ?? 100;
  const bar = (60 / bpm) * BEATS_PER_BAR;
  return {
    samples: what === 'voice' ? s.samples : undefined,
    sampleRate: s.take.sampleRate,
    notes: what === 'melody' ? s.take.notes : [],
    chords: accompaniment(s),
    drums: withDrums ? drums(s) : undefined,
    duration: barCount(s) * bar,
  };
}

/** 多軌 MIDI：Melody、Chords、可選 Drums（channel 10）；第 1 小節第 1 拍移到 0 秒。 */
export function speechMidi(s: SpeechSession): Uint8Array<ArrayBuffer> {
  const shift = s.take.gridOffset ?? 0;
  const move = (ns: MidiNote[]) => ns.map((n) => ({ ...n, start: Math.max(0, n.start - shift) }));
  const sp = s.take.speech ?? DEFAULT_SPEECH;
  const tracks = [
    { name: 'Melody', notes: move(s.take.notes) },
    { name: 'Chords', notes: move(accompaniment(s)), channel: 1 },
  ];
  if (sp.drums) {
    tracks.push({
      name: 'Drums',
      notes: move(drums(s).map((d) => ({ midi: GM_DRUMS[d.hit], start: d.time, dur: 0.1, velocity: d.velocity }))),
      channel: DRUM_CHANNEL,
    });
  }
  return buildMidi({ bpm: s.take.bpm, tracks, title: s.take.name });
}

export function exportSpeechMidi(s: SpeechSession) {
  download(speechMidi(s), exportFileName(new Date(), 'mid'), 'audio/midi');
}
