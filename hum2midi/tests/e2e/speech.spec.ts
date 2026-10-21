// M6：隱藏模式「說話變唱歌」。假麥克風是 speech_like_48k.wav（5 個音節）。
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { AppState } from '../../src/app/state';
import { Midi, ready } from './helpers';

type SpeechSnap = {
  page: string;
  unlocked: boolean;
  hasSpeech: boolean;
  takeId: string | null;
  mode: string | null;
  notes: { midi: number; start: number; dur: number }[];
  chords: { root: number; quality: string; start: number; dur: number }[];
  bpm: number | null;
  ratings: (number | null)[];
  exaggeration: number | null;
};

function speechSnap(page: Page): Promise<SpeechSnap> {
  return page.evaluate(() => {
    const s = (window as unknown as { __humDebug: { state: AppState } }).__humDebug.state;
    const sp = s.speech;
    return {
      page: s.page,
      unlocked: s.prefs.speechUnlocked,
      hasSpeech: !!sp,
      takeId: sp?.take.id ?? null,
      mode: sp?.take.mode ?? null,
      notes: sp?.take.notes ?? [],
      chords: sp?.take.chords ?? [],
      bpm: sp?.take.bpm ?? null,
      ratings: sp?.take.speech?.ratings ?? [],
      exaggeration: sp?.take.speech?.exaggeration ?? null,
    };
  });
}

const speechTab = (page: Page) => page.getByRole('tab', { name: /^說話變唱歌/ });

/** 把 speech_like_48k.wav 放進 Takes 庫，當作一段「長錄音」。 */
async function seedLibrary(page: Page) {
  const wav = readFileSync('tests/fixtures/speech_like_48k.wav').toString('base64');
  await page.evaluate(async (b64) => {
    const { createTake } = (await import('/src/store/takes.ts' as string)) as typeof import('../../src/store/takes');
    const { DEFAULT_SETTINGS } = (await import('/src/types.ts' as string)) as typeof import('../../src/types');
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    await createTake(
      { id: 'long', name: '一段長錄音', createdAt: Date.now(), mode: 'hum', sampleRate: 48000, audio: new Blob([bytes]), notes: [], bpm: null, settings: DEFAULT_SETTINGS },
      bytes.length / 2 / 48000,
    );
  }, wav);
}

test('隱藏模式：錄音頁連點 logo 三下 → 第 4 頁出現；重新整理後仍在', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await expect(speechTab(page)).toBeHidden();
  const logo = page.getByRole('button', { name: 'hum2midi' });
  await logo.click();
  await logo.click();
  await expect(speechTab(page)).toBeHidden(); // 兩下不算
  await page.waitForTimeout(800);
  await logo.click({ clickCount: 3 });
  await expect(speechTab(page)).toBeVisible();
  expect((await speechSnap(page)).page).toBe('speech');
  await page.reload();
  await ready(page);
  await expect(speechTab(page)).toBeVisible();
});

test('隱藏模式：⇧S 也能解鎖', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await page.keyboard.press('Shift+S');
  await expect(speechTab(page)).toBeVisible();
  expect((await speechSnap(page)).unlocked).toBe(true);
});

test('錄一句話（假麥克風）→ 自動修剪、存成說話變唱歌的 take', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await page.keyboard.press('Shift+S');
  await page.keyboard.press('Space');
  await page.waitForTimeout(2500);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await speechSnap(page)).hasSpeech, { timeout: 15_000 }).toBe(true);
  const s = await speechSnap(page);
  expect(s.mode).toBe('speech-song');
  expect(s.notes.length).toBeGreaterThanOrEqual(2);
  expect(s.page).toBe('speech');
});

test('完整 4 步：框選 → 循環＋自評 → 揭曉 → 配和弦、匯出 3 軌 MIDI', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await ready(page);
  await seedLibrary(page);
  await page.keyboard.press('Shift+S');

  // 1. 從庫裡框選片段
  await page.getByLabel('從 Takes 庫選一段錄音').selectOption('long');
  await page.getByLabel('片段開始（秒）').fill('0');
  await page.getByLabel('片段結束（秒）').fill('1.9');
  await page.getByLabel('片段結束（秒）').press('Tab');
  await page.getByRole('button', { name: /^用這一段/ }).click();
  await expect.poll(async () => (await speechSnap(page)).hasSpeech, { timeout: 15_000 }).toBe(true);
  const first = await speechSnap(page);
  expect(first.notes.length).toBe(5);
  expect(first.bpm).toBeGreaterThanOrEqual(70);
  expect(first.bpm).toBeLessThanOrEqual(140);

  // 2. 循環 5 次、停頓 0.3 秒，邊聽邊評分
  await page.keyboard.press('ArrowRight');
  await page.getByLabel('循環次數（5–20）').fill('5');
  await page.getByLabel('循環次數（5–20）').press('Tab');
  await page.getByLabel('每次之間停頓（秒）').fill('0.3');
  await page.getByLabel('每次之間停頓（秒）').press('Tab');
  await page.getByRole('button', { name: /開始循環/ }).click();
  await expect(page.getByText('1 / 5')).toBeVisible();
  await page.keyboard.press('1');
  await expect(page.getByText('3 / 5')).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press('3');
  await expect(page.getByText('5 / 5')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /完全像唱歌/ }).click();
  await expect(page.getByRole('button', { name: /再聽一輪/ })).toBeVisible({ timeout: 10_000 });
  const rated = await speechSnap(page);
  expect(rated.ratings).toEqual([1, null, 3, null, 5]);

  // 3. 揭曉：誇張化越大，音域越寬
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('img', { name: /從這句話抽出的旋律/ })).toBeVisible();
  const range = (ns: { midi: number }[]) => Math.max(...ns.map((n) => n.midi)) - Math.min(...ns.map((n) => n.midi));
  const before = range((await speechSnap(page)).notes);
  await page.getByLabel('誇張化').fill('2');
  await page.getByLabel('誇張化').dispatchEvent('change');
  await expect.poll(async () => (await speechSnap(page)).exaggeration).toBe(2);
  expect(range((await speechSnap(page)).notes)).toBeGreaterThan(before);

  // 4. 配和弦：有和弦、可播放、匯出 Melody／Chords／Drums
  // （焦點還在誇張化滑桿上，← → 會調滑桿，所以用按鈕翻頁）
  await page.getByRole('button', { name: /下一步/ }).click();
  await expect(page.getByRole('tab', { name: /配和弦/ })).toHaveAttribute('aria-selected', 'true');
  const s4 = await speechSnap(page);
  expect(s4.chords.length).toBeGreaterThan(0);
  await expect(page.getByLabel('和弦進行')).not.toBeEmpty();
  await page.getByLabel('鼓組').check();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: /原聲＋和弦/ })).toHaveText(/■/);
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: /原聲＋和弦/ })).toHaveText(/▶/);

  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '匯出多軌 MIDI' }).click()]);
  const midi = new Midi(readFileSync((await dl.path())!));
  const tracks = midi.tracks.filter((t) => t.notes.length);
  expect(tracks.map((t) => t.name)).toEqual(['Melody', 'Chords', 'Drums']);
  expect(tracks[2].channel).toBe(9);
  expect(tracks[0].notes.length).toBe(5);
  expect(tracks[0].notes[0].time).toBeCloseTo(0, 3); // 第一個音在第 1 小節第 1 拍
  expect(midi.header.tempos[0].bpm).toBeCloseTo(s4.bpm!, 1);

  // 庫裡有這一句，標成「說話變唱歌」；開啟後回到這一頁的「揭曉」
  await page.keyboard.press('3');
  const card = page.getByRole('listitem').filter({ hasText: '說話變唱歌' });
  await expect(card).toHaveCount(1);
  await page.keyboard.press('1');
  await page.keyboard.press('3');
  await card.getByRole('button', { name: /^開啟/ }).click();
  await expect.poll(async () => (await speechSnap(page)).page).toBe('speech');
  await expect(page.getByRole('tab', { name: /揭曉/ })).toHaveAttribute('aria-selected', 'true');
  expect((await speechSnap(page)).ratings).toEqual([1, null, 3, null, 5]);
});
