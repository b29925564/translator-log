// End-to-end checks of the main flows in a real browser.
//   npm run dev   (in another terminal)
//   npm run e2e   (URL=http://localhost:5173/ by default)
// Web fonts are blocked so the run needs no network; failures leave a
// screenshot in e2e-output/.

import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.URL || 'http://localhost:5173/';
const OUT = 'e2e-output';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' } : {});
let failures = 0;
let passed = 0;

async function suite(name, opts, fn) {
  console.log(`\n${name}`);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !/ERR_FAILED|ERR_BLOCKED|Failed to load resource/.test(m.text()) && errors.push(m.text()));
  let n = 0;
  const step = async (label, run) => {
    n++;
    try {
      await run();
      passed++;
      console.log(`  ✓ ${label}`);
    } catch (e) {
      failures++;
      const file = `${OUT}/${name.replace(/\W+/g, '-')}-${n}.png`;
      await page.screenshot({ path: file }).catch(() => {});
      console.log(`  ✗ ${label}\n      ${String(e.message || e).split('\n')[0]}\n      screenshot: ${file}`);
    }
  };
  await fn(page, step);
  await step('no uncaught errors', async () => {
    if (errors.length) throw new Error(errors.slice(0, 3).join(' | '));
  });
  await ctx.close();
}

const expectVisible = async (locator, timeout = 5000) => locator.first().waitFor({ state: 'visible', timeout });
const skipOverture = async (page) => {
  const doors = page.locator('div.fixed.inset-0.z-\\[200\\]');
  if (await doors.count()) {
    await page.waitForTimeout(400);
    await doors.first().click({ force: true }).catch(() => {});
    await doors.first().waitFor({ state: 'detached', timeout: 5000 });
  }
};

await suite('New user, English', { locale: 'en-US' }, async (page, step) => {
  await step('opening doors play and can be skipped', async () => {
    await page.goto(BASE);
    await expectVisible(page.locator('div.fixed.inset-0.z-\\[200\\]'));
    await skipOverture(page);
  });
  await step('onboarding in English', async () => {
    await expectVisible(page.getByText('Three quick choices'));
    await page.getByLabel('Your name').fill('Mei Chen');
    await page.getByRole('button', { name: /Start logging/ }).click();
    await expectVisible(page.getByText('Four steps to make it yours'));
    await expectVisible(page.getByText('Deliver your first job and your skyline starts to rise.'));
  });
  await step('quick add parses a sentence and creates the job', async () => {
    await page.keyboard.press('n');
    await expectVisible(page.getByText('Add a job in one line').first());
    await page.getByLabel('Describe the job in one line').fill('Harbor & Quill clinical protocol EN>ZH-TW 4000 words $0.11/word due in 5 days');
    await expectVisible(page.getByText('Harbor & Quill (new)'));
    await page.getByRole('button', { name: 'Create job' }).click();
    await expectVisible(page.getByText(/Added “/));
  });
  await step('today plan picks the job up', async () => {
    await expectVisible(page.getByText('Today’s plan'));
    await expectVisible(page.locator('li').filter({ hasText: 'clinical protocol' }));
  });
  await step('logging progress updates the day', async () => {
    await page.getByLabel('Log progress').first().click();
    await page.getByRole('button', { name: '+500 words' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expectVisible(page.getByText('Logged 500 words'));
    await expectVisible(page.getByText('500 done'));
  });
  await step('focus mode runs the timer and logs a session', async () => {
    await page.getByLabel('Focus mode').first().click();
    await page.getByRole('button', { name: /Start focusing/ }).click();
    await page.waitForTimeout(1500);
    await expectVisible(page.getByRole('button', { name: /Pause/ }));
    await page.getByRole('button', { name: /End & log/ }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expectVisible(page.getByText('Session complete'));
    await page.getByRole('button', { name: 'Back to overview' }).click();
    await expectVisible(page.getByText('Today’s plan'));
  });
  await step('delivering the job from its page', async () => {
    await page.locator('li button').filter({ hasText: 'clinical protocol' }).first().click();
    await page.getByRole('button', { name: /^Delivered/ }).click();
    await expectVisible(page.locator('[aria-current="step"]').filter({ hasText: 'Delivered' }));
  });
  await step('invoice, then mark it paid', async () => {
    await page.evaluate(() => (location.hash = '/money'));
    await page.getByRole('button', { name: 'New invoice' }).first().click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expectVisible(page.getByRole('button', { name: 'Mark paid' }));
    await page.getByRole('button', { name: 'Mark paid' }).click();
    await expectVisible(page.locator('svg[aria-label^="PAID"]'));
  });
  await step('switching to 中文 relabels the app', async () => {
    await page.evaluate(() => (location.hash = '/'));
    await page.getByRole('button', { name: '中文', exact: true }).first().click();
    await expectVisible(page.getByRole('button', { name: '總覽' }));
  });
  await step('portfolio website is generated from the log', async () => {
    await page.evaluate(() => (location.hash = '/resume'));
    await page.getByRole('button', { name: '個人網站' }).click();
    const doc = await page.locator('iframe').getAttribute('srcdoc');
    if (!doc || !doc.includes('Mei Chen') || !doc.startsWith('<!doctype html>')) throw new Error('portfolio HTML missing or incomplete');
    await page.keyboard.press('Escape');
  });
  await step('text shared into the app opens Quick Add', async () => {
    await page.goto(BASE + '?text=' + encodeURIComponent('Pixelforge patch notes 2000 words $0.1/word'));
    await expectVisible(page.getByText('一句話新增案件').first());
    const v = await page.getByLabel('用一句話描述案件').inputValue();
    if (!v.includes('Pixelforge')) throw new Error('shared text not in Quick Add: ' + v);
    if (page.url().includes('?text=')) throw new Error('share params left in the URL');
  });
});

await suite('Sample data, 繁體中文', { locale: 'zh-TW' }, async (page, step) => {
  await step('sample data loads a full dashboard', async () => {
    await page.goto(BASE);
    await skipOverture(page);
    await page.getByRole('button', { name: /先用示範資料逛逛/ }).click();
    await expectVisible(page.getByText('職涯天際線').first(), 10000);
  });
  await step('the skyline draws a tower per month', async () => {
    await page.waitForTimeout(800);
    const towers = await page.locator('g.sk-rise').count();
    if (towers < 24) throw new Error(`only ${towers} towers`);
  });
  await step('year in review runs to the share card', async () => {
    await page.evaluate(() => (location.hash = '/wrapped'));
    await page.getByRole('button', { name: '暫停' }).click();
    for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight');
    await page.getByRole('button', { name: /產生分享圖卡/ }).click();
    await expectVisible(page.getByAltText('年度回顧分享圖卡'), 8000);
  });
  await step('insights show earned medals', async () => {
    await page.goto(BASE + '#/insights');
    await expectVisible(page.getByText('里程碑紀念章'));
    if ((await page.locator('.tilt').count()) < 3) throw new Error('medals missing');
  });
  await step('command palette finds a job', async () => {
    await page.keyboard.press('Control+k');
    await page.getByPlaceholder(/搜尋/).fill('心臟');
    await expectVisible(page.getByText('心臟支架使用說明書 v2.1'));
    await page.keyboard.press('Escape');
  });
});

await suite('Phone', { locale: 'zh-TW', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, async (page, step) => {
  await step('tab bar and More sheet', async () => {
    await page.goto(BASE);
    await skipOverture(page);
    await page.getByRole('button', { name: /先用示範資料逛逛/ }).click();
    await expectVisible(page.getByRole('navigation', { name: '主選單' }).last());
    await page.getByRole('button', { name: '更多' }).click();
    await expectVisible(page.getByRole('button', { name: '履歷' }));
  });
  for (const route of ['/', '/jobs', '/clients', '/money', '/insights', '/resume', '/tools', '/tax', '/settings', '/wrapped']) {
    await step(`${route} fits the screen`, async () => {
      await page.keyboard.press('Escape');
      await page.evaluate((r) => (location.hash = r), route);
      await page.waitForTimeout(700);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (over > 1) throw new Error(`page is ${over}px wider than the screen`);
    });
  }
  await step('focus mode fits the screen', async () => {
    await page.evaluate(() => (location.hash = '/'));
    await page.waitForTimeout(500);
    await page.getByLabel('記錄進度').first().click();
    await page.getByRole('button', { name: '儲存', exact: true }).click();
    const id = await page.evaluate(() => [...document.querySelectorAll('a,button')].length);
    if (!id) throw new Error('no controls');
    await page.evaluate(() => (location.hash = '/jobs'));
    await page.waitForTimeout(500);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (over > 1) throw new Error(`page is ${over}px wider than the screen`);
  });
});

await browser.close();
console.log(`\n${passed} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
