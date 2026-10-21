// 從錄音建立 take、跑分析。

import { AnalysisClient } from '../analysis/client';
import { encodeWav } from '../audio/wav';
import { DEFAULT_SETTINGS, type AnalysisSettings, type Note, type Take } from '../types';
import type { Session } from './state';

let client: AnalysisClient | null = null;
function analysisClient() {
  return (client ??= new AnalysisClient());
}

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

export async function analyzeSession(take: Take, samples: Float32Array, settings: AnalysisSettings = take.settings): Promise<Session> {
  const analysis = await analysisClient().analyze(take.id, settings, samples, take.sampleRate);
  const notes: Note[] = analysis.notes.map(({ id, midi, start, dur, velocity }) => ({ id, midi, start, dur, velocity }));
  return { take: { ...take, settings, notes }, samples, analysis };
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
    settings: structuredClone(DEFAULT_SETTINGS),
  };
  return analyzeSession(take, samples);
}
