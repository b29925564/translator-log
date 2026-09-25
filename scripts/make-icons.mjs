// Renders the app icons and social preview with the real brand font.
// node scripts/make-icons.mjs  (needs network access to Google Fonts)
import { chromium } from 'playwright';

const { ProxyAgent, fetch: ufetch } = await import('undici');
const agent = process.env.HTTPS_PROXY ? new ProxyAgent(process.env.HTTPS_PROXY) : undefined;
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ deviceScaleFactor: 1 });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, async (route) => {
  const res = await ufetch(route.request().url(), { dispatcher: agent, headers: { 'user-agent': route.request().headers()['user-agent'] } });
  await route.fulfill({ status: res.status, body: Buffer.from(await res.arrayBuffer()), headers: { 'content-type': res.headers.get('content-type') || '', 'access-control-allow-origin': '*' } });
});
const page = await ctx.newPage();
const FONT = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500&family=IBM+Plex+Sans:wght@500;700&family=LXGW+WenKai+TC:wght@700&display=block">';

const mark = (size, { radius, scale, bleed }) => `
<div style="width:${size}px;height:${size}px;position:relative;background:${bleed ? '#0e7c6b' : 'transparent'};">
  <div style="position:absolute;inset:${bleed ? 0 : size * 0.03}px;border-radius:${radius * size}px;background:#0e7c6b;"></div>
  <div style="position:absolute;inset:${size * (bleed ? 0.5 - scale * 0.36 : 0.11)}px;border-radius:${radius * size * 0.72}px;border:${Math.max(1, size * 0.018)}px solid rgba(255,255,255,.35);"></div>
  <div style="position:absolute;inset:0;display:grid;place-items:center;font-family:'LXGW WenKai TC';font-weight:700;color:#fff;font-size:${size * 0.5 * scale}px;line-height:1;padding-bottom:${size * 0.02}px">譯</div>
  <div style="position:absolute;left:${size * (0.5 + scale * 0.23)}px;top:${size * (0.5 + scale * 0.27)}px;width:${size * 0.06 * scale}px;height:${size * 0.06 * scale}px;border-radius:50%;background:rgba(255,255,255,.9)"></div>
  <div style="position:absolute;left:${size * (0.5 + scale * 0.32)}px;top:${size * (0.5 + scale * 0.19)}px;width:${size * 0.045 * scale}px;height:${size * 0.045 * scale}px;border-radius:50%;background:rgba(255,255,255,.6)"></div>
</div>`;

const shots = [
  { file: 'public/icon-512.png', size: 512, html: mark(512, { radius: 0.24, scale: 1, bleed: false }), transparent: true },
  { file: 'public/icon-192.png', size: 192, html: mark(192, { radius: 0.24, scale: 1, bleed: false }), transparent: true },
  { file: 'public/icon-maskable-512.png', size: 512, html: mark(512, { radius: 0, scale: 0.78, bleed: true }) },
  { file: 'public/apple-touch-icon.png', size: 180, html: mark(180, { radius: 0, scale: 0.9, bleed: true }) },
];
for (const s of shots) {
  await page.setViewportSize({ width: s.size, height: s.size });
  await page.setContent(`<html><head>${FONT}<style>html,body{margin:0;background:transparent}</style></head><body>${s.html}</body></html>`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: s.file, omitBackground: !!s.transparent });
  console.log('wrote', s.file);
}

// social preview 1200x630
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(`<html><head>${FONT}<style>
html,body{margin:0}
.wrap{width:1200px;height:630px;box-sizing:border-box;padding:72px 80px;background:#eef1f0;font-family:'IBM Plex Sans','LXGW WenKai TC';position:relative;overflow:hidden}
.t{font-family:'LXGW WenKai TC';font-weight:700;font-size:96px;color:#0f1b24;margin-top:44px;letter-spacing:.02em}
.s{font-size:30px;color:#3e4c57;margin-top:18px;max-width:760px;line-height:1.45}
.brand{display:flex;align-items:center;gap:18px}
.name{font-family:'LXGW WenKai TC';font-weight:700;font-size:44px;color:#0f1b24;line-height:1}
.en{font-family:'IBM Plex Mono';font-size:15px;letter-spacing:.3em;color:#6c7a85;margin-top:6px}
.ring{position:absolute;border-radius:50%;border:3px solid;}
</style></head><body><div class="wrap">
<div class="brand">${mark(84, { radius: 0.24, scale: 1, bleed: false })}<div><div class="name">譯跡</div><div class="en">WORDTRAIL</div></div></div>
<div class="t">每一個字，都算數。</div>
<div class="s">自由譯者的工作紀錄本：一句話記案件、收款與報稅整理、自動生成履歷與年度回顧。</div>
<div class="ring" style="right:-130px;top:120px;width:360px;height:360px;border-color:#2a78d6;opacity:.9"></div>
<div class="ring" style="right:-100px;top:150px;width:300px;height:300px;border-color:#2a78d6;border-width:1.5px;opacity:.9"></div>
<div style="position:absolute;right:-6px;top:260px;font-family:'LXGW WenKai TC';font-weight:700;font-size:64px;color:#2a78d6;transform:rotate(-10deg)">入境</div>
<div style="position:absolute;right:250px;bottom:70px;border:6px solid #c23b2a;border-radius:18px;padding:10px 26px;transform:rotate(8deg);color:#c23b2a;font-family:'LXGW WenKai TC';font-weight:700;font-size:46px;letter-spacing:.12em">已收款</div>
</div></body></html>`, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: 'public/og.png' });
console.log('wrote public/og.png');
await browser.close();
