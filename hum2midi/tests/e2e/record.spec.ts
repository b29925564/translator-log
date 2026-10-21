// 13.3：開頁 → Space 錄音 → 等 5 秒 → Space 停止 → 檢查音符 → 匯出 → 檔案存在且可被解析。
// 假麥克風循環播放 scale_c_major_48k.wav（C4 D4 E4 F4 G4 A4 B4 C5，每 0.5 秒一個）。
import tonejsMidi from '@tonejs/midi';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { decodeWav } from '../../src/audio/wav';

// Playwright 用 Node 原生 ESM 載入測試檔，@tonejs/midi 是 UMD，只能拿 default export
const { Midi } = tonejsMidi;

type Snapshot = {
  page: string;
  status: string;
  hasSession: boolean;
  bpm: number | null;
  sampleRate: number;
  notes: { midi: number; start: number; dur: number; velocity: number }[];
};

const SCALE = [60, 62, 64, 65, 67, 69, 71, 72];

/** 從開發模式的 window.__humDebug 讀出目前狀態。 */
function snap(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const d = (window as unknown as { __humDebug: { state: import('../../src/app/state').AppState } }).__humDebug;
    const s = d.state;
    return {
      page: s.page,
      status: s.rec.status,
      hasSession: !!s.session,
      bpm: s.session?.take.bpm ?? null,
      sampleRate: s.session?.take.sampleRate ?? 0,
      notes: s.session?.take.notes ?? [],
    };
  });
}

async function debug<T>(page: Page, pick: (s: Snapshot) => T): Promise<T> {
  return pick(await snap(page));
}

async function recordFor(page: Page, ms: number) {
  await page.keyboard.press('Space');
  await expect.poll(() => debug(page, (s) => s.status)).toBe('recording');
  await page.waitForTimeout(ms);
  await page.keyboard.press('Space');
  await expect.poll(() => debug(page, (s) => s.page), { timeout: 15_000 }).toBe('edit');
}

/** 錄到的音符必須是音階裡的音、而且是循環音階中連續的一段。 */
function expectScaleRun(midis: number[]) {
  expect(midis.length).toBeGreaterThanOrEqual(6);
  for (const m of midis) expect(SCALE).toContain(m);
  for (let i = 1; i < midis.length; i++) {
    const prev = SCALE.indexOf(midis[i - 1]);
    expect([SCALE[(prev + 1) % SCALE.length], SCALE[0]]).toContain(midis[i]);
  }
}

test('錄 5 秒假麥克風 → 音符正確 → 匯出 MIDI 與 WAV 可以解析', async ({ page }) => {
  await page.goto('/');
  await recordFor(page, 5000);

  const notes = await debug(page, (s) => s.notes);
  expectScaleRun(notes.map((n) => n.midi));
  await expect(page.getByRole('img', { name: /鋼琴捲軸/ })).toBeVisible();

  // Enter 匯出 MIDI
  const [mid] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
  expect(mid.suggestedFilename()).toMatch(/^hum-\d{8}-\d{4}\.mid$/);
  const midi = new Midi(readFileSync((await mid.path())!));
  expect(midi.header.tempos[0].bpm).toBe(120);
  const track = midi.tracks.find((t) => t.notes.length)!;
  expect(track.name).toBe('Hum');
  expect(track.notes.map((n) => n.midi)).toEqual(notes.map((n) => n.midi));
  track.notes.forEach((n, i) => expect(Math.abs(n.time - notes[i].start)).toBeLessThan(0.002));

  // WAV
  const [wav] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '匯出 WAV' }).click()]);
  expect(wav.suggestedFilename()).toMatch(/^hum-\d{8}-\d{4}\.wav$/);
  const decoded = decodeWav(readFileSync((await wav.path())!));
  const sr = await debug(page, (s) => s.sampleRate);
  expect(decoded.sampleRate).toBe(sr);
  expect(decoded.samples.length / sr).toBeGreaterThan(4.5);
  expect(decoded.samples.length / sr).toBeLessThan(6.5);
});

test('節拍器：預備拍 → 錄音 → take 帶 BPM，MIDI tempo 一致', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('節拍器').check();
  await page.getByLabel('BPM').fill('180');
  await page.getByLabel('BPM').press('Tab');
  await page.keyboard.press('Space');
  await expect.poll(() => debug(page, (s) => s.status)).toBe('countin');
  await expect.poll(() => debug(page, (s) => s.status), { timeout: 5000 }).toBe('recording');
  await page.waitForTimeout(4000);
  await page.keyboard.press('Space');
  await expect.poll(() => debug(page, (s) => s.page), { timeout: 15_000 }).toBe('edit');
  expect(await debug(page, (s) => s.bpm)).toBe(180);
  expectScaleRun((await debug(page, (s) => s.notes)).map((n) => n.midi));
  const [mid] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
  // MIDI 用每拍微秒數（整數）存 tempo：60e6 / 180 = 333333.3 → 333333，讀回來是 180.0002
  expect(new Midi(readFileSync((await mid.path())!)).header.tempos[0].bpm).toBeCloseTo(180, 2);
});

test('預備拍時再按一次空白鍵 → 取消，回到待命、不產生 take', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('節拍器').check();
  await page.getByLabel('BPM').fill('60');
  await page.getByLabel('BPM').press('Tab');
  await page.keyboard.press('Space');
  await expect.poll(() => debug(page, (s) => s.status)).toBe('countin');
  await page.keyboard.press('Space');
  await expect.poll(() => debug(page, (s) => s.status)).toBe('idle');
  await page.waitForTimeout(4500);
  expect(await debug(page, (s) => ({ status: s.status, hasSession: s.hasSession }))).toEqual({ status: 'idle', hasSession: false });
});
