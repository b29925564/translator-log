// 11. Takes 庫（IndexedDB）。
// 音訊 Blob 和其他資料分兩個 object store：編輯音符時只重寫幾 KB 的資料，不必每次重寫幾 MB 的錄音。

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Take } from '../types';

/** 存在 takes store 裡的資料：Take 去掉音訊，加上列表要用的長度與更新時間。 */
export type TakeMeta = Omit<Take, 'audio'> & { duration: number; updatedAt: number };

interface HumDB extends DBSchema {
  takes: { key: string; value: TakeMeta; indexes: { createdAt: number } };
  audio: { key: string; value: { id: string; blob: Blob } };
}

const DB_NAME = 'hum2midi';
const VERSION = 1;

let dbPromise: Promise<IDBPDatabase<HumDB>> | null = null;

function db(): Promise<IDBPDatabase<HumDB>> {
  dbPromise ??= openDB<HumDB>(DB_NAME, VERSION, {
    upgrade(d) {
      const takes = d.createObjectStore('takes', { keyPath: 'id' });
      takes.createIndex('createdAt', 'createdAt');
      d.createObjectStore('audio', { keyPath: 'id' });
    },
  });
  return dbPromise;
}

function meta(take: Take, duration: number): TakeMeta {
  // 拆掉 audio，其餘照存（structuredClone 會在寫入時做）
  const { audio: _audio, ...rest } = take;
  return { ...rest, duration, updatedAt: Date.now() };
}

/** 新的 take：音訊和資料一起寫入（同一個交易）。 */
export async function createTake(take: Take, duration: number): Promise<void> {
  const d = await db();
  const tx = d.transaction(['takes', 'audio'], 'readwrite');
  await Promise.all([tx.objectStore('audio').put({ id: take.id, blob: take.audio }), tx.objectStore('takes').put(meta(take, duration)), tx.done]);
}

/** 更新既有 take 的資料（音符、設定、名稱…），不動音訊。 */
export async function updateTake(take: Take, duration: number): Promise<void> {
  const d = await db();
  await d.put('takes', meta(take, duration));
}

/** 全部 take，最新的在前（不含音訊）。 */
export async function listTakes(): Promise<TakeMeta[]> {
  const d = await db();
  const all = await d.getAllFromIndex('takes', 'createdAt');
  return all.reverse();
}

export async function getTake(id: string): Promise<Take | null> {
  const d = await db();
  const [m, a] = await Promise.all([d.get('takes', id), d.get('audio', id)]);
  if (!m || !a) return null;
  const { duration: _d, updatedAt: _u, ...take } = m;
  return { ...take, audio: a.blob };
}

export async function renameTake(id: string, name: string): Promise<void> {
  const d = await db();
  const tx = d.transaction('takes', 'readwrite');
  const m = await tx.store.get(id);
  if (m) await tx.store.put({ ...m, name, updatedAt: Date.now() });
  await tx.done;
}

/** 複製一份（新的 id、名稱加「副本」、建立時間是現在）。回傳新的 id。 */
export async function duplicateTake(id: string, newId: string): Promise<string | null> {
  const d = await db();
  const tx = d.transaction(['takes', 'audio'], 'readwrite');
  const [m, a] = await Promise.all([tx.objectStore('takes').get(id), tx.objectStore('audio').get(id)]);
  if (!m || !a) {
    await tx.done;
    return null;
  }
  const now = Date.now();
  await Promise.all([
    tx.objectStore('takes').put({ ...m, id: newId, name: `${m.name}（副本）`, createdAt: now, updatedAt: now }),
    tx.objectStore('audio').put({ id: newId, blob: a.blob }),
    tx.done,
  ]);
  return newId;
}

export async function deleteTake(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(['takes', 'audio'], 'readwrite');
  await Promise.all([tx.objectStore('takes').delete(id), tx.objectStore('audio').delete(id), tx.done]);
}

/** 測試用：關閉連線，讓下一次呼叫重新開啟。 */
export async function closeDb(): Promise<void> {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
}
