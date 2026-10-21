// M5：每次錄音自動存成新 take；重新整理後資料（含手動編輯）仍在；重新命名、複製、刪除、分頁。
import { expect, test } from '@playwright/test';
import { noteBox, recordFor, snap } from './helpers';

test('錄音自動存 → 手動編輯自動存 → 重新整理後從庫裡開啟，一切都在', async ({ page }) => {
  await page.goto('/');
  await recordFor(page, 3000);
  const recorded = await snap(page);

  // 手動編輯：第一個音升半音
  const b = await noteBox(page, recorded.notes[0].id);
  await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
  await page.keyboard.press('ArrowUp');
  const edited = (await snap(page)).notes;
  await page.waitForTimeout(800); // 自動存（延遲 400 ms）

  await page.reload();
  await page.getByRole('tab', { name: /^庫/ }).click();
  const cards = page.getByRole('listitem');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText(recorded.takeName!);
  await expect(cards.first()).toContainText(`${edited.length} 音符`);

  await page.getByRole('button', { name: `開啟「${recorded.takeName}」` }).click();
  await expect.poll(async () => (await snap(page)).page).toBe('edit');
  const opened = await snap(page);
  expect(opened.takeId).toBe(recorded.takeId);
  expect(opened.notes).toEqual(edited);
  expect(opened.edited).toBe(true);
});

test('重新命名、複製、刪除（要確認）', async ({ page }) => {
  await page.goto('/');
  await recordFor(page, 2000);
  const { takeName } = await snap(page);
  await page.keyboard.press('3');
  await expect(page.getByRole('listitem')).toHaveCount(1);

  await page.getByRole('button', { name: `重新命名「${takeName}」` }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox').fill('小星星');
  await dialog.getByRole('button', { name: '儲存' }).click();
  await expect(page.getByRole('listitem').first()).toContainText('小星星');
  expect((await snap(page)).takeName).toBe('小星星'); // 正在編輯的 session 也跟著改名

  await page.getByRole('button', { name: '複製「小星星」' }).click();
  await expect(page.getByRole('listitem')).toHaveCount(2);
  await expect(page.getByRole('listitem').first()).toContainText('小星星（副本）');

  await page.reload();
  await page.keyboard.press('3');
  await expect(page.getByRole('listitem')).toHaveCount(2);

  await page.getByRole('button', { name: '刪除「小星星（副本）」' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '取消' }).click();
  await expect(page.getByRole('listitem')).toHaveCount(2);
  await page.getByRole('button', { name: '刪除「小星星（副本）」' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '刪除' }).click();
  await expect(page.getByRole('listitem')).toHaveCount(1);
  await expect(page.getByRole('listitem').first()).toContainText('小星星');
});

test('分頁：take 多的時候不捲動，用上一頁／下一頁', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { createTake } = (await import('/src/store/takes.ts' as string)) as typeof import('../../src/store/takes');
    const { DEFAULT_SETTINGS } = (await import('/src/types.ts' as string)) as typeof import('../../src/types');
    for (let i = 0; i < 25; i++) {
      await createTake(
        {
          id: `t${i}`,
          name: `第 ${i + 1} 段`,
          createdAt: 1_700_000_000_000 + i * 60_000,
          mode: 'hum',
          sampleRate: 48000,
          audio: new Blob([new Uint8Array(44)]),
          notes: [{ id: 'n0', midi: 60 + (i % 12), start: 0, dur: 0.5, velocity: 90 }],
          bpm: null,
          settings: DEFAULT_SETTINGS,
        },
        1,
      );
    }
  });
  await page.keyboard.press('3');
  const cards = page.getByRole('listitem');
  await expect(cards.first()).toContainText('第 25 段'); // 最新在前
  const perPage = await cards.count();
  expect(perPage).toBeGreaterThan(1);
  expect(perPage).toBeLessThan(25);
  // 整頁不捲動
  expect(await page.evaluate(() => document.scrollingElement!.scrollHeight <= window.innerHeight)).toBe(true);
  await page.getByRole('button', { name: '下一頁' }).click();
  await expect(cards.first()).toContainText(`第 ${25 - perPage} 段`);
  await page.keyboard.press('ArrowLeft');
  await expect(cards.first()).toContainText('第 25 段');
});
