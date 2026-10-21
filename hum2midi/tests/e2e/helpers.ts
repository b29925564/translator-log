import tonejsMidi from '@tonejs/midi';
import { expect, type Page } from '@playwright/test';
import type { AppState } from '../../src/app/state';
import type { Note } from '../../src/types';

// Playwright 用 Node 原生 ESM 載入測試檔，@tonejs/midi 是 UMD，只能拿 default export
export const { Midi } = tonejsMidi;

export const SCALE = [60, 62, 64, 65, 67, 69, 71, 72];

export type Snapshot = {
  page: string;
  status: string;
  hasSession: boolean;
  edited: boolean;
  bpm: number | null;
  sampleRate: number;
  takeId: string | null;
  takeName: string | null;
  notes: Note[];
};

type Box = { x: number; y: number; w: number; h: number };
type Debug = {
  state: AppState;
  noteBox(id: string): Box | null;
  rollBox(): Box & { rowH: number };
};

/** 從開發模式的 window.__humDebug 讀出目前狀態。 */
export function snap(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const s = (window as unknown as { __humDebug: Debug }).__humDebug.state;
    return {
      page: s.page,
      status: s.rec.status,
      hasSession: !!s.session,
      edited: s.session?.edited ?? false,
      bpm: s.session?.take.bpm ?? null,
      sampleRate: s.session?.take.sampleRate ?? 0,
      takeId: s.session?.take.id ?? null,
      takeName: s.session?.take.name ?? null,
      notes: s.session?.take.notes ?? [],
    };
  });
}

export function noteBox(page: Page, id: string): Promise<Box> {
  return page.evaluate((nid) => (window as unknown as { __humDebug: Debug }).__humDebug.noteBox(nid)!, id);
}

export function rollBox(page: Page) {
  return page.evaluate(() => (window as unknown as { __humDebug: Debug }).__humDebug.rollBox());
}

export async function recordFor(page: Page, ms: number) {
  await page.keyboard.press('Space');
  await expect.poll(async () => (await snap(page)).status).toBe('recording');
  await page.waitForTimeout(ms);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await snap(page)).page, { timeout: 15_000 }).toBe('edit');
}

/** 錄到的音符必須是音階裡的音、而且是循環音階中連續的一段。 */
export function expectScaleRun(midis: number[]) {
  expect(midis.length).toBeGreaterThanOrEqual(6);
  for (const m of midis) expect(SCALE).toContain(m);
  for (let i = 1; i < midis.length; i++) {
    const prev = SCALE.indexOf(midis[i - 1]);
    expect([SCALE[(prev + 1) % SCALE.length], SCALE[0]]).toContain(midis[i]);
  }
}
