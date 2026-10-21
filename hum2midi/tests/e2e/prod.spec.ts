// 正式 build：錄音 → 分析（Worker）→ 編輯頁 → 匯出 MIDI → 自動存進庫 → 重新整理後還在。
// 正式版沒有 window.__humDebug，全部從畫面操作與讀取。
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { Midi, expectScaleRun } from './helpers';

test('正式 build 的完整流程', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/');
  expect(await page.evaluate(() => 'window' in globalThis && '__humDebug' in window)).toBe(false);
  const rec = page.getByRole('button', { name: /開始錄音/ });
  await expect(rec).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: /停止錄音/ })).toBeVisible();
  await page.waitForTimeout(4000);
  await page.keyboard.press('Space');
  await expect(page.getByRole('tab', { name: '編輯' })).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 });
  await expect(page.getByText(/\d+ 個音符/)).toBeVisible();

  const [dl] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
  const midi = new Midi(readFileSync((await dl.path())!));
  expectScaleRun(midi.tracks.find((t) => t.notes.length)!.notes.map((n) => n.midi));

  await page.reload();
  await page.getByRole('tab', { name: '庫' }).click();
  await expect(page.getByRole('listitem')).toHaveCount(1);
  expect(errors).toEqual([]);
});
