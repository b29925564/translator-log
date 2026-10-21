// Takes 庫與編輯中的 session 之間的接線：錄完自動存、編輯自動存、從庫裡開啟。

import { decodeWav } from '../audio/wav';
import { createTake, getTake, updateTake } from '../store/takes';
import { analyzeSession, sameNotes } from './session';
import { store, type Session } from './state';

const DEBOUNCE_MS = 400;

function duration(s: Session) {
  return s.samples.length / s.take.sampleRate;
}

export type SaveError = (message: string) => void;
let reportError: SaveError = (m) => console.error(m);

export function onSaveError(fn: SaveError) {
  reportError = fn;
}

/** 錄音停止、分析完之後呼叫：存成新的 take。 */
export async function saveNewSession(s: Session): Promise<void> {
  try {
    await createTake(s.take, duration(s));
  } catch (err) {
    reportError(`沒辦法存進 Takes 庫：${err instanceof Error ? err.message : String(err)}`);
  }
}

let timer = 0;
let pending: Session | null = null;

async function flush() {
  window.clearTimeout(timer);
  const s = pending;
  pending = null;
  if (!s) return;
  try {
    await updateTake(s.take, duration(s));
  } catch (err) {
    reportError(`自動儲存失敗：${err instanceof Error ? err.message : String(err)}`);
  }
}

/** 同一個 take 的內容（音符、設定、名稱…）變了就延遲一下存起來；換頁或關閉分頁時立刻寫入。 */
export function startAutosave() {
  store.subscribe((s, prev) => {
    const cur = s.session;
    const old = prev.session;
    if (!cur || !old || cur.take.id !== old.take.id || cur.take === old.take) return;
    pending = cur;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void flush(), DEBOUNCE_MS);
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
 * 從庫裡開啟：解碼音訊、重跑分析（音高曲線、調性等不存），但音符用存著的（保留手動編輯）。
 */
export async function openTake(id: string): Promise<Session | null> {
  await flush();
  const take = await getTake(id);
  if (!take) return null;
  const { samples } = decodeWav(await take.audio.arrayBuffer());
  const analyzed = await analyzeSession(take, samples);
  return { ...analyzed, take: { ...analyzed.take, notes: take.notes }, edited: !sameNotes(take.notes, analyzed.take.notes) };
}
