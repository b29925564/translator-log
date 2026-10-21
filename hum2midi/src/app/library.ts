// Takes 庫與編輯中的 session 之間的接線：錄完自動存、編輯自動存、從庫裡開啟。

import { decodeWav } from '../audio/wav';
import { createTake, getTake, updateTake } from '../store/takes';
import type { Take } from '../types';
import { analyzeSession, sameNotes } from './session';
import { analyzeSpeechSession } from './speech-session';
import { store, type Session, type SpeechSession } from './state';

const DEBOUNCE_MS = 400;

/** 編輯頁的 session 與說話變唱歌的 session 都長這樣（take ＋ 原始樣本）。 */
type Saved = { take: Take; samples: Float32Array };

function duration(s: Saved) {
  return s.samples.length / s.take.sampleRate;
}

export type SaveError = (message: string) => void;
let reportError: SaveError = (m) => console.error(m);

export function onSaveError(fn: SaveError) {
  reportError = fn;
}

/** 錄音停止、分析完之後呼叫：存成新的 take。 */
export async function saveNewSession(s: Saved): Promise<void> {
  try {
    await createTake(s.take, duration(s));
  } catch (err) {
    reportError(`沒辦法存進 Takes 庫：${err instanceof Error ? err.message : String(err)}`);
  }
}

let timer = 0;
const pending = new Map<string, Saved>();

async function flush() {
  window.clearTimeout(timer);
  const items = [...pending.values()];
  pending.clear();
  for (const s of items) {
    try {
      await updateTake(s.take, duration(s));
    } catch (err) {
      reportError(`自動儲存失敗：${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

function queue(cur: Saved | null, old: Saved | null) {
  if (!cur || !old || cur.take.id !== old.take.id || cur.take === old.take) return;
  pending.set(cur.take.id, cur);
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void flush(), DEBOUNCE_MS);
}

/** 同一個 take 的內容（音符、設定、名稱…）變了就延遲一下存起來；換頁或關閉分頁時立刻寫入。 */
export function startAutosave() {
  store.subscribe((s, prev) => {
    queue(s.session, prev.session);
    queue(s.speech, prev.speech);
  });
  window.addEventListener('pagehide', () => void flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush();
  });
}

/** 寫入還沒存的修改（例如要從庫裡刪除或改名之前）。 */
export function flushAutosave(): Promise<void> {
  return flush();
}

/**
 * 從庫裡開啟：解碼音訊、重跑分析（音高曲線、調性等不存）。
 * 哼唱 take 的音符用存著的（保留手動編輯）；說話變唱歌的 take 由設定完全決定，直接用分析結果。
 */
export async function openTake(id: string): Promise<{ kind: 'hum'; session: Session } | { kind: 'speech'; session: SpeechSession } | null> {
  await flush();
  const take = await getTake(id);
  if (!take) return null;
  const { samples } = decodeWav(await take.audio.arrayBuffer());
  if (take.mode === 'speech-song') return { kind: 'speech', session: await analyzeSpeechSession(take, samples) };
  const analyzed = await analyzeSession(take, samples);
  return { kind: 'hum', session: { ...analyzed, take: { ...analyzed.take, notes: take.notes }, edited: !sameNotes(take.notes, analyzed.take.notes) } };
}
