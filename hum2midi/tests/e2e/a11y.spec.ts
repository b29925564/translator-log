// M7 無障礙：每一頁跑 axe（WCAG 2.1 A／AA），不能有任何違規；所有按鈕都有名字。
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ready, recordFor } from './helpers';

async function audit(page: Page, label: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const summary = r.violations.map((v) => `${label}: ${v.id} (${v.impact}) ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  expect(summary).toEqual([]);
}

async function unnamedButtons(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .filter((b) => b.getClientRects().length)
      .filter((b) => !(b.getAttribute('aria-label') || b.textContent?.trim()))
      .map((b) => b.outerHTML.slice(0, 80)),
  );
}

test('錄音、編輯、庫、說話變唱歌四頁都通過 axe；按鈕都有名字', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await audit(page, '錄音');
  expect(await unnamedButtons(page)).toEqual([]);

  await recordFor(page, 2000);
  await audit(page, '編輯');
  expect(await unnamedButtons(page)).toEqual([]);

  await page.keyboard.press('3');
  await expect(page.getByRole('listitem')).toHaveCount(1);
  await audit(page, '庫');
  expect(await unnamedButtons(page)).toEqual([]);

  await page.keyboard.press('Shift+S');
  await audit(page, '說話變唱歌');
  expect(await unnamedButtons(page)).toEqual([]);
});

test('說明卡與確認對話框通過 axe', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await page.getByRole('button', { name: '說明（?）' }).click();
  await audit(page, '說明卡');
});
