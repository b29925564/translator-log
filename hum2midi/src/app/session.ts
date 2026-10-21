// 從錄音建立 take、跑分析。

import { analysisClient } from '../analysis/client';
import { encodeWav } from '../audio/wav';
import { DEFAULT_SETTINGS, type Note, type Take } from '../types';
import type { Session } from './state';

export function newId(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** 預設名稱：日期時間，例如「2026-10-21 21:30」 */
export function defaultTakeName(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 用 take 目前的設定、BPM、格線原點、調性跑一次分析，回傳新的 session（音符被分析結果取代）。 */
export async function analyzeSession(take: Take, samples: Float32Array): Promise<Session> {
  const context = { bpm: take.bpm, gridOffset: take.gridOffset ?? 0, key: take.key ?? null };
  const analysis = await analysisClient().analyze(take.id, take.settings, samples, take.sampleRate, context);
  const notes: Note[] = analysis.notes.map(({ id, midi, start, dur, velocity }) => ({ id, midi, start, dur, velocity }));
  return { take: { ...take, notes }, samples, analysis, edited: false };
}

/** 兩組音符是否相同（比較音高、起點、長度、力度）。 */
export function sameNotes(a: Note[], b: Note[]): boolean {
  return a.length === b.length && a.every((n, i) => n.midi === b[i].midi && n.start === b[i].start && n.dur === b[i].dur && n.velocity === b[i].velocity);
}

export async function sessionFromRecording(samples: Float32Array, sampleRate: number, bpm: number | null): Promise<Session> {
  const now = new Date();
  const take: Take = {
    id: newId(),
    name: defaultTakeName(now),
    createdAt: now.getTime(),
    mode: 'hum',
    sampleRate,
    audio: new Blob([encodeWav(samples, sampleRate)], { type: 'audio/wav' }),
    notes: [],
    bpm,
    gridOffset: 0,
    settings: structuredClone(DEFAULT_SETTINGS),
  };
  return analyzeSession(take, samples);
}
