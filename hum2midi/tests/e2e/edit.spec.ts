// M4：鋼琴捲軸編輯（拖曳改音高與位置、拖右緣改長度、Delete、雙擊新增、↑↓、復原／重做）、
// 改設定立即重新分析（覆蓋手動編輯前先確認）、播放。
import { expect, test, type Page } from '@playwright/test';
import { noteBox, recordFor, rollBox, snap } from './helpers';

async function notes(page: Page) {
  return (await snap(page)).notes;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await recordFor(page, 4000);
});

test('選取 → ↑↓ 改半音 → ⌘Z 復原 → ⇧⌘Z 重做', async ({ page }) => {
  const [first] = await notes(page);
  const b = await noteBox(page, first.id);
  await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  expect((await notes(page))[0].midi).toBe(first.midi + 2);
  expect((await snap(page)).edited).toBe(true);
  await page.keyboard.press('ControlOrMeta+z');
  expect((await notes(page))[0].midi).toBe(first.midi + 1);
  await page.keyboard.press('ControlOrMeta+z');
  expect((await notes(page))[0].midi).toBe(first.midi);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  expect((await notes(page))[0].midi).toBe(first.midi + 1);
  await page.getByRole('button', { name: /^復原/ }).click();
  expect((await notes(page))[0].midi).toBe(first.midi);
});

test('拖曳音符改音高（吸附半音）與位置；拖右緣改長度', async ({ page }) => {
  const before = await notes(page);
  const n = before[1];
  const b = await noteBox(page, n.id);
  const { rowH } = await rollBox(page);
  // 往上拖 3 列、往右 40 px
  await page.mouse.move(b.x + Math.min(20, b.w / 3), b.y + b.h / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + Math.min(20, b.w / 3) + 20, b.y + b.h / 2 - rowH * 1.5, { steps: 4 });
  await page.mouse.move(b.x + Math.min(20, b.w / 3) + 40, b.y + b.h / 2 - rowH * 3, { steps: 4 });
  await page.mouse.up();
  const moved = (await notes(page)).find((x) => x.id === n.id)!;
  expect(moved.midi).toBe(n.midi + 3);
  expect(moved.start).toBeGreaterThan(n.start + 0.01);
  expect(Number.isInteger(moved.midi)).toBe(true);

  // 拖右緣：變長
  const b2 = await noteBox(page, n.id);
  await page.mouse.move(b2.x + b2.w - 2, b2.y + b2.h / 2);
  await page.mouse.down();
  await page.mouse.move(b2.x + b2.w + 60, b2.y + b2.h / 2, { steps: 5 });
  await page.mouse.up();
  const resized = (await notes(page)).find((x) => x.id === n.id)!;
  expect(resized.dur).toBeGreaterThan(moved.dur + 0.05);
  expect(resized.start).toBeCloseTo(moved.start, 6);
  expect(resized.midi).toBe(moved.midi);
});

test('Delete 刪除；雙擊空白處新增', async ({ page }) => {
  const before = await notes(page);
  const b = await noteBox(page, before[0].id);
  await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
  await page.keyboard.press('Delete');
  expect((await notes(page)).length).toBe(before.length - 1);

  // 在（剩下的）最低音再低 2 列的空白處雙擊
  const remaining = await notes(page);
  const low = Math.min(...remaining.map((n) => n.midi));
  const lowNote = remaining.find((n) => n.midi === low)!;
  const lb = await noteBox(page, lowNote.id);
  const { rowH } = await rollBox(page);
  await page.mouse.dblclick(lb.x + 5, lb.y + rowH * 2.5);
  const after = await notes(page);
  expect(after.length).toBe(before.length);
  expect(after.some((n) => n.midi === low - 2)).toBe(true);
});

test('改設定 → 有手動編輯時先確認：取消就不動，確定就重新分析', async ({ page }) => {
  const original = await notes(page);
  const b = await noteBox(page, original[0].id);
  await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
  await page.keyboard.press('Delete');
  const edited = await notes(page);

  // 吸附到音階：重新分析後音符不同（被刪掉的音會回來）→ 跳確認
  await page.getByLabel('切分敏感度').fill('0.95');
  await page.getByLabel('切分敏感度').dispatchEvent('change');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '取消' }).click();
  await expect(dialog).toBeHidden();
  expect((await notes(page)).length).toBe(edited.length);

  await page.getByLabel('切分敏感度').fill('0.9');
  await page.getByLabel('切分敏感度').dispatchEvent('change');
  await dialog.getByRole('button', { name: '重新分析' }).click();
  await expect.poll(async () => (await notes(page)).length).toBe(original.length);
  expect((await snap(page)).edited).toBe(false);
});

test('沒有手動編輯時改設定直接重新分析；設 BPM 後量化到格線', async ({ page }) => {
  await page.getByLabel('BPM（留空＝不量化）').fill('120');
  await page.getByLabel('BPM（留空＝不量化）').press('Enter');
  await expect.poll(async () => (await snap(page)).bpm).toBe(120);
  await page.getByLabel('量化強度').fill('1');
  await page.getByLabel('量化強度').dispatchEvent('change');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // 1/16 @ 120 BPM = 0.125 秒一格，格線原點 = 原本第一個音的起點
  await expect
    .poll(async () => {
      const ns = await notes(page);
      const o = ns[0].start;
      return ns.every((n) => Math.abs(((n.start - o) / 0.125) % 1) < 1e-6 || Math.abs(((n.start - o) / 0.125) % 1) > 1 - 1e-6);
    })
    .toBe(true);
});

test('空白鍵播放／停止；點時間尺設定播放起點', async ({ page }) => {
  const play = page.getByRole('button', { name: /^播放/ });
  await expect(play).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: /^停止/ })).toBeVisible();
  await page.waitForTimeout(500);
  await page.keyboard.press('Space');
  await expect(play).toBeVisible();

  const box = await rollBox(page);
  await page.mouse.click(box.x + box.w / 2, box.y + 10);
  await page.getByRole('radio', { name: '合成音' }).click();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: /^停止/ })).toBeVisible();
  await page.keyboard.press('Space');
});
