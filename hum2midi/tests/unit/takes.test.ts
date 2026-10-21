import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { closeDb, createTake, deleteTake, duplicateTake, getTake, listTakes, renameTake, updateTake } from '../../src/store/takes';
import { DEFAULT_SETTINGS, type Take } from '../../src/types';

function take(id: string, createdAt: number): Take {
  return {
    id,
    name: `take ${id}`,
    createdAt,
    mode: 'hum',
    sampleRate: 48000,
    audio: new Blob([new Uint8Array([1, 2, 3, id.charCodeAt(0)])], { type: 'audio/wav' }),
    notes: [{ id: 'n0', midi: 60, start: 0.3, dur: 0.4, velocity: 90 }],
    bpm: null,
    gridOffset: 0,
    settings: structuredClone(DEFAULT_SETTINGS),
  };
}

beforeEach(async () => {
  await closeDb();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('hum2midi');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
  });
});

describe('Takes 庫', () => {
  it('存入後讀回：資料與音訊都一樣；列表最新在前、不含音訊', async () => {
    await createTake(take('a', 1000), 2.5);
    await createTake(take('b', 3000), 4);
    await createTake(take('c', 2000), 1);
    const list = await listTakes();
    expect(list.map((t) => t.id)).toEqual(['b', 'c', 'a']);
    expect(list[0]).toMatchObject({ duration: 4, name: 'take b' });
    expect('audio' in list[0]).toBe(false);

    const a = (await getTake('a'))!;
    expect(a.notes).toEqual(take('a', 0).notes);
    expect(new Uint8Array(await a.audio.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 97]));
    expect('duration' in a).toBe(false);
  });

  it('更新音符不動音訊；重新命名；複製；刪除', async () => {
    await createTake(take('a', 1000), 2);
    const edited = { ...(await getTake('a'))!, notes: [] };
    await updateTake(edited, 2);
    expect((await getTake('a'))!.notes).toEqual([]);
    expect((await getTake('a'))!.audio.size).toBe(4);

    await renameTake('a', '小星星');
    expect((await listTakes())[0].name).toBe('小星星');

    const copy = await duplicateTake('a', 'a2');
    expect(copy).toBe('a2');
    const list = await listTakes();
    expect(list.map((t) => [t.id, t.name])).toEqual([
      ['a2', '小星星（副本）'],
      ['a', '小星星'],
    ]);
    expect((await getTake('a2'))!.audio.size).toBe(4);

    await deleteTake('a');
    expect((await listTakes()).map((t) => t.id)).toEqual(['a2']);
    expect(await getTake('a')).toBe(null);
    expect(await duplicateTake('missing', 'x')).toBe(null);
  });
});
