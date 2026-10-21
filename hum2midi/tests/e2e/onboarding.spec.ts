// M7：第一次開啟的 3 張說明卡（可左右翻、可略過、從「?」重開）。
import { expect, test } from '@playwright/test';
import { ready, snap } from './helpers';

test.use({ storageState: { cookies: [], origins: [] } });

test('第一次開啟顯示 3 張說明卡；← → 翻頁；開始使用後不再出現；「?」重開', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  const dlg = page.getByRole('dialog');
  await expect(dlg).toBeVisible();
  await expect(dlg.getByRole('heading')).toHaveText('按空白鍵，哼一段');
  // 說明卡開著時空白鍵不會開始錄音
  await page.keyboard.press('ArrowRight');
  await expect(dlg.getByRole('heading')).toHaveText('自動變音符，順手改一改');
  await page.keyboard.press('ArrowRight');
  await expect(dlg.getByRole('heading')).toHaveText('拖進 GarageBand');
  await expect(dlg).toContainText('Import Tempo Information');
  await page.keyboard.press('ArrowLeft');
  await expect(dlg.getByRole('heading')).toHaveText('自動變音符，順手改一改');
  await dlg.getByRole('button', { name: '下一張（→）' }).click();
  await dlg.getByRole('button', { name: '開始使用' }).click();
  await expect(dlg).toBeHidden();
  expect((await snap(page)).status).toBe('idle');

  await page.reload();
  await ready(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('button', { name: '說明（?）' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '略過' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
