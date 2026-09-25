// Screenshot helper for visual checks: node scripts/shoot.mjs <outDir> [routes...]
import { chromium } from 'playwright';
import fs from 'node:fs';

const out = process.argv[2] || 'shots';
const routes = process.argv.slice(3);
const base = process.env.URL || 'http://localhost:5173/';
fs.mkdirSync(out, { recursive: true });

// The sandbox only reaches the internet through an HTTPS proxy; the browser talks
// to the local dev server directly and web fonts are fetched here through the proxy.
const { ProxyAgent, fetch: ufetch } = await import('undici');
const agent = process.env.HTTPS_PROXY ? new ProxyAgent(process.env.HTTPS_PROXY) : undefined;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const fontCache = new Map();
const routeFonts = async (ctx) => {
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, async (route) => {
    const url = route.request().url();
    try {
      if (!fontCache.has(url)) {
        const res = await ufetch(url, { dispatcher: agent, headers: { 'user-agent': route.request().headers()['user-agent'] } });
        fontCache.set(url, { status: res.status, body: Buffer.from(await res.arrayBuffer()), type: res.headers.get('content-type') || '' });
      }
      const c = fontCache.get(url);
      await route.fulfill({ status: c.status, body: c.body, headers: { 'content-type': c.type, 'access-control-allow-origin': '*' } });
    } catch {
      await route.abort();
    }
  });
};
const modes = (process.env.MODES || 'desktop,mobile').split(',');
const theme = process.env.THEME || 'light';

for (const mode of modes) {
  const ctx = await browser.newContext(
    mode === 'mobile'
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: theme, ignoreHTTPSErrors: true }
      : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: theme, ignoreHTTPSErrors: true },
  );
  await routeFonts(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  if (await page.getByText(/先用示範資料逛逛|Explore with sample data/).count()) {
    await page.screenshot({ path: `${out}/${mode}-onboarding.png`, fullPage: true });
    await page.getByText(/先用示範資料逛逛|Explore with sample data/).first().click();
    await page.waitForTimeout(2500);
  }
  for (const r of routes.length ? routes : ['/']) {
    const [path, action] = r.split('@');
    await page.evaluate((p) => { location.hash = p; }, path);
    await page.waitForTimeout(1200);
    if (action) {
      for (const a of action.split('+')) {
        if (a.startsWith('click:')) await page.getByText(a.slice(6)).first().click();
        if (a.startsWith('sel:')) await page.locator(a.slice(4)).first().click();
        if (a.startsWith('key:')) await page.keyboard.press(a.slice(4));
        if (a.startsWith('type:')) await page.keyboard.type(a.slice(5), { delay: 5 });
        await page.waitForTimeout(700);
      }
    }
    const name = (path.replace(/\//g, '_') || '_root') + (action ? '-' + action.replace(/[^a-z0-9]+/gi, '_').slice(0, 30) : '');
    await page.screenshot({ path: `${out}/${mode}-${name}.png`, fullPage: process.env.FULL !== '0' });
  }
  if (errors.length) console.log(mode, 'ERRORS:\n' + [...new Set(errors)].slice(0, 20).join('\n'));
  await ctx.close();
}
await browser.close();
console.log('done');
