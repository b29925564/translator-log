// 13.3：開頁 → Space 錄音 → 等 5 秒 → Space 停止 → 檢查音符 → 匯出 → 檔案存在且可被解析。
// 假麥克風循環播放 scale_c_major_48k.wav（C4 D4 E4 F4 G4 A4 B4 C5，每 0.5 秒一個）。
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { decodeWav } from '../../src/audio/wav';
import { Midi, expectScaleRun, recordFor, snap } from './helpers';

test('錄 5 秒假麥克風 → 音符正確 → 匯出 MIDI 與 WAV 可以解析', async ({ page }) => {
  await page.goto('/');
  await recordFor(page, 5000);

  const { notes, sampleRate } = await snap(page);
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
  expect(decoded.sampleRate).toBe(sampleRate);
  expect(decoded.samples.length / sampleRate).toBeGreaterThan(4.5);
  expect(decoded.samples.length / sampleRate).toBeLessThan(6.5);
});

test('節拍器：預備拍 → 錄音 → take 帶 BPM，MIDI tempo 一致', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('節拍器', { exact: true }).check();
  await page.getByLabel('節拍器速度（BPM）').fill('180');
  await page.getByLabel('節拍器速度（BPM）').press('Tab');
  await page.keyboard.press('Space');
  await expect.poll(async () => (await snap(page)).status).toBe('countin');
  await expect.poll(async () => (await snap(page)).status, { timeout: 5000 }).toBe('recording');
  await page.waitForTimeout(4000);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await snap(page)).page, { timeout: 15_000 }).toBe('edit');
  const s = await snap(page);
  expect(s.bpm).toBe(180);
  expectScaleRun(s.notes.map((n) => n.midi));
  const [mid] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
  // MIDI 用每拍微秒數（整數）存 tempo：60e6 / 180 = 333333.3 → 333333，讀回來是 180.0002
  expect(new Midi(readFileSync((await mid.path())!)).header.tempos[0].bpm).toBeCloseTo(180, 2);
});

test('預備拍時再按一次空白鍵 → 取消，回到待命、不產生 take', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('節拍器', { exact: true }).check();
  await page.getByLabel('節拍器速度（BPM）').fill('60');
  await page.getByLabel('節拍器速度（BPM）').press('Tab');
  await page.keyboard.press('Space');
  await expect.poll(async () => (await snap(page)).status).toBe('countin');
  await page.keyboard.press('Space');
  await expect.poll(async () => (await snap(page)).status).toBe('idle');
  await page.waitForTimeout(4500);
  const s = await snap(page);
  expect({ status: s.status, hasSession: s.hasSession }).toEqual({ status: 'idle', hasSession: false });
});
