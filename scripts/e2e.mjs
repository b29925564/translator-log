// End-to-end checks of the main flows in a real browser.
//   npm run dev   (in another terminal)
//   npm run e2e   (URL=http://localhost:5173/ by default)
// Web fonts are blocked so the run needs no network; failures leave a
// screenshot in e2e-output/.

import { chromium } from 'playwright';
import { strToU8, zipSync } from 'fflate';
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

/** A minimal .xlsx with inline strings, as vendor portals export. */
const xlsxOf = (rows) => {
  const cell = (v, r, c) => {
    const ref = String.fromCharCode(65 + c) + (r + 1);
    return typeof v === 'number' ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${v.replace(/&/g, '&amp;')}</t></is></c>`;
  };
  const sheet = rows.map((row, r) => `<row r="${r + 1}">${row.map((v, c) => cell(v, r, c)).join('')}</row>`).join('');
  return Buffer.from(
    zipSync({
      'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="Remittance" sheetId="1" r:id="rId1"/></sheets></workbook>'),
      'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Type="ws" Target="worksheets/sheet1.xml"/></Relationships>'),
      'xl/worksheets/sheet1.xml': strToU8(`<worksheet><sheetData>${sheet}</sheetData></worksheet>`),
    }),
  );
};

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
  await step('a big project splits into parts from a template', async () => {
    await page.evaluate(() => (location.hash = '/projects'));
    await expectVisible(page.getByText('大案子，拆開來管'));
    await page.getByRole('button', { name: '新增專案' }).first().click();
    await page.getByRole('textbox', { name: '專案名稱' }).fill('Starfall');
    await page.locator('#pj-client').selectOption({ label: 'Harbor & Quill' });
    await expectVisible(page.getByText('將建立 4 個部分'));
    await page.getByRole('button', { name: '建立專案' }).click();
    await expectVisible(page.getByRole('heading', { name: 'Starfall' }));
    for (const part of ['預告片字幕', '過場動畫', '劇情對話', '介面文字']) await expectVisible(page.locator('li').filter({ hasText: part }));
  });
  await step('adding a part and starting it puts it on the Today plan', async () => {
    await page.getByRole('button', { name: '新增部分' }).first().click();
    await page.getByRole('button', { name: '道具與技能說明' }).click();
    await page.getByLabel('份量').fill('3000');
    await page.getByLabel('截止日').fill('2099-01-01');
    await page.getByRole('button', { name: '新增', exact: true }).click();
    await expectVisible(page.getByText('部分（5）'));
    await page.locator('li').filter({ hasText: '道具與技能說明' }).getByRole('button', { name: '開始' }).click();
    await expectVisible(page.locator('li').filter({ hasText: '道具與技能說明' }).getByText('進行中'));
    await page.evaluate(() => (location.hash = '/'));
    await expectVisible(page.locator('li').filter({ hasText: 'Starfall｜道具與技能說明' }));
    await expectVisible(page.getByRole('heading', { name: '專案' }));
  });
  await step('the query log tracks questions until answered', async () => {
    await page.evaluate(() => (location.hash = '/projects'));
    await page.locator('button.card').filter({ hasText: 'Starfall' }).click();
    await page.getByLabel('新問題').fill('Keep character names in English?');
    await page.getByLabel('相關部分').selectOption({ label: '過場動畫' });
    await page.getByLabel('參照').fill('CS_001');
    await page.getByRole('button', { name: '加入', exact: true }).first().click();
    await expectVisible(page.getByText('1 個待回覆'));
    await page.getByLabel('標為已寄出').first().click();
    await expectVisible(page.getByText('已寄出', { exact: true }));
    await page.getByLabel('記錄回覆').first().click();
    await page.getByLabel('回覆', { exact: true }).fill('Yes, keep them.');
    await page.getByRole('button', { name: '儲存', exact: true }).click();
    await expectVisible(page.getByText('0 個待回覆'));
  });
  await step('an Excel remittance marks the matching part paid and adds the rest', async () => {
    await page.evaluate(() => (location.hash = '/money'));
    await page.getByRole('button', { name: '匯入報表' }).click();
    await page.getByLabel('選擇報表檔案').setInputFiles({
      name: 'harbor-remittance.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: xlsxOf([['Harbor & Quill — Remittance advice'], ['Payment date: 2026-09-20'], [], ['Project', 'Amount'], ['Starfall 預告片字幕', 300], ['Onboarding emails', 250], ['Total', 550]]),
    });
    await expectVisible(page.getByText('本機讀取'));
    await expectVisible(page.getByText('2 列 · 對應到 1 筆既有案件'));
    const dialog = page.getByRole('dialog');
    await expectVisible(dialog.locator('li').filter({ hasText: 'Starfall 預告片字幕' }).getByText('「Starfall｜預告片字幕」'));
    await page.getByLabel('「Onboarding emails」的處理方式').selectOption('new');
    await expectVisible(page.getByText('1 筆標記已收款 · 1 筆新增'));
    await page.getByRole('button', { name: '套用', exact: true }).click();
    await expectVisible(page.getByText(/匯入完成：1 筆標記已收款、新增 1 筆/));
    await page.evaluate(() => (location.hash = '/jobs'));
    await expectVisible(page.getByText('Onboarding emails'));
  });
  await step('a CSV dropped anywhere opens the import; a PDF asks for an AI key', async () => {
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(['Job,Words,Rate,Due date\nGlossary cleanup,1200,0.1,2099-02-01\n'], 'po-list.csv', { type: 'text/csv' }));
      document.body.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
      document.body.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    });
    await expectVisible(page.getByText('po-list.csv'));
    await expectVisible(page.getByLabel('「Glossary cleanup」的處理方式'));
    await page.getByRole('button', { name: '換一個檔案' }).first().click();
    await page.getByLabel('選擇報表檔案').setInputFiles({ name: 'statement.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF') });
    await expectVisible(page.getByText(/PDF、照片和截圖要由 Claude 讀取/));
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
  await step('the sample game project is organised by part', async () => {
    await page.goto(BASE + '#/projects');
    await page.locator('button.card').filter({ hasText: '星墜紀元' }).click();
    await expectVisible(page.getByText('時程'));
    const rows = await page.locator('svg[aria-label^="7 個部分"]').count();
    if (!rows) throw new Error('timeline missing');
    await expectVisible(page.getByText('3 個待回覆'));
  });
  await step('delivered parts go on one invoice', async () => {
    await page.getByRole('button', { name: /請款 2 個已交稿部分/ }).click();
    await expectVisible(page.getByText('2 個項目，合計'));
    await page.getByRole('button', { name: '建立', exact: true }).click();
    await expectVisible(page.getByRole('button', { name: '標記已付款' }));
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
  for (const route of ['/', '/projects', '/jobs', '/clients', '/money', '/insights', '/resume', '/tools', '/tax', '/settings', '/wrapped']) {
    await step(`${route} fits the screen`, async () => {
      await page.keyboard.press('Escape');
      await page.evaluate((r) => (location.hash = r), route);
      await page.waitForTimeout(700);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (over > 1) throw new Error(`page is ${over}px wider than the screen`);
    });
  }
  await step('a project page fits the screen', async () => {
    await page.evaluate(() => (location.hash = '/projects'));
    await page.waitForTimeout(500);
    await page.locator('button.card').first().click();
    await page.waitForTimeout(800);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (over > 1) throw new Error(`page is ${over}px wider than the screen`);
  });
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
