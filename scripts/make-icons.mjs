// Renders the app icons, favicon and social preview from the brand mark.
// node scripts/make-icons.mjs  (needs network access to Google Fonts for og.png)
import { chromium } from 'playwright';
import fs from 'node:fs';

const INK = '#0b0b0c';
const GOLD = '#d4b36c';
// keep in sync with src/app/Logo.tsx
const W_LINES = [
  '8.2,2.17 19.54,33.59 32,5.8 44.46,33.59 55.8,2.17',
  '3.12,4 19,48 32,19 45,48 60.88,4',
  '-1.96,5.83 18.46,62.41 32,32.2 45.54,62.41 65.96,5.83',
];

/** The W centred on (cx, cy) at `scale` (1 = 70 units wide), as SVG markup. */
const glyph = (cx, cy, scale, stroke = 3, id = 'c') => `
  <defs><clipPath id="${id}"><rect x="-10" y="14" width="90" height="80"/></clipPath></defs>
  <g transform="translate(${cx} ${cy}) scale(${scale}) translate(-32 -39)">
    <g clip-path="url(#${id})" fill="none" stroke="${GOLD}" stroke-width="${stroke}" stroke-linejoin="miter" stroke-miterlimit="12">
      ${W_LINES.map((p) => `<polyline points="${p}"/>`).join('')}
    </g>
  </g>`;

/** Square icon. `bleed`: full-bleed ink (maskable, Apple); otherwise a rounded tile on transparent. */
const icon = (size, { bleed, glyphWidth, stroke = 3 }) => {
  const r = bleed ? 0 : size * 0.22;
  const inset = bleed ? 0 : size * 0.03;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect x="${inset}" y="${inset}" width="${size - inset * 2}" height="${size - inset * 2}" rx="${r}" fill="${INK}"/>
  ${glyph(size / 2, size / 2, (size * glyphWidth) / 70, stroke)}
</svg>`;
};

fs.writeFileSync(
  'public/favicon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="${INK}"/>
  ${glyph(32, 32.5, 0.66, 4.2)}
</svg>
`,
);
console.log('wrote public/favicon.svg');

const { ProxyAgent, fetch: ufetch } = await import('undici');
const agent = process.env.HTTPS_PROXY ? new ProxyAgent(process.env.HTTPS_PROXY) : undefined;
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ deviceScaleFactor: 1 });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, async (route) => {
  const res = await ufetch(route.request().url(), { dispatcher: agent, headers: { 'user-agent': route.request().headers()['user-agent'] } });
  await route.fulfill({ status: res.status, body: Buffer.from(await res.arrayBuffer()), headers: { 'content-type': res.headers.get('content-type') || '', 'access-control-allow-origin': '*' } });
});
const page = await ctx.newPage();

const shots = [
  { file: 'public/icon-512.png', size: 512, svg: icon(512, { bleed: false, glyphWidth: 0.62 }), transparent: true },
  { file: 'public/icon-192.png', size: 192, svg: icon(192, { bleed: false, glyphWidth: 0.62, stroke: 3.4 }), transparent: true },
  // maskable: keep the mark inside the 80% safe circle
  { file: 'public/icon-maskable-512.png', size: 512, svg: icon(512, { bleed: true, glyphWidth: 0.5 }) },
  { file: 'public/apple-touch-icon.png', size: 180, svg: icon(180, { bleed: true, glyphWidth: 0.58, stroke: 3.4 }) },
];
for (const s of shots) {
  await page.setViewportSize({ width: s.size, height: s.size });
  await page.setContent(`<html><head><style>html,body{margin:0;background:transparent}svg{display:block}</style></head><body>${s.svg}</body></html>`);
  await page.screenshot({ path: s.file, omitBackground: !!s.transparent });
  console.log('wrote', s.file);
}

// social preview 1200×630: an ink poster with a gold sunburst
const rays = Array.from({ length: 31 }, (_, k) => {
  const a = Math.PI + (k / 30) * (Math.PI / 2);
  return `<line x1="1200" y1="630" x2="${1200 + Math.cos(a) * 1600}" y2="${630 + Math.sin(a) * 1600}"/>`;
}).join('');
const FONT = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..700&family=Noto+Sans+TC:wght@500;700&display=block">';
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(
  `<html><head>${FONT}<style>
html,body{margin:0}
.wrap{width:1200px;height:630px;box-sizing:border-box;padding:64px 80px;background:${INK};color:#f2f2ef;font-family:'Archivo','Noto Sans TC';position:relative;overflow:hidden}
.wide{font-stretch:125%;font-weight:600;text-transform:uppercase}
.brand{display:flex;align-items:center;gap:20px;position:relative}
.name{font-size:22px;letter-spacing:.3em}
.zh{font-family:'Noto Sans TC';font-weight:500;font-size:15px;letter-spacing:.5em;color:#8a8a90;margin-top:8px}
.kicker{font-size:15px;letter-spacing:.3em;color:${GOLD};margin-top:78px;position:relative}
.t{font-weight:600;font-size:104px;letter-spacing:-.035em;line-height:1;margin-top:22px;position:relative}
.t2{font-family:'Noto Sans TC';font-weight:700;font-size:44px;color:#b9b9b4;margin-top:20px;letter-spacing:.02em;position:relative}
.rule{position:absolute;left:80px;right:80px;bottom:64px;height:5px;border-top:2px solid #f2f2ef;border-bottom:1px solid #f2f2ef}
.tags{position:absolute;left:80px;bottom:88px;font-size:12.5px;letter-spacing:.28em;color:#8a8a90}
</style></head><body><div class="wrap">
<svg width="1200" height="630" style="position:absolute;inset:0" stroke="${GOLD}" stroke-opacity=".2" stroke-width="1.2" fill="none">${rays}
<circle cx="1200" cy="630" r="220"/><circle cx="1200" cy="630" r="440"/><circle cx="1200" cy="630" r="660"/></svg>
<div class="brand"><svg width="64" height="52" viewBox="0 0 64 52">${glyph(32, 26, 0.9, 3)}</svg><div><div class="wide name">Wordtrail</div><div class="zh">譯跡</div></div></div>
<div class="wide kicker">A work log for freelance translators</div>
<div class="t">Every word counts.</div>
<div class="t2">每一個字，都算數。</div>
<div class="wide tags">Jobs · Payments · Taxes · Résumé · Year in review</div>
<div class="rule"></div>
</div></body></html>`,
  { waitUntil: 'networkidle' },
);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: 'public/og.png' });
console.log('wrote public/og.png');
await browser.close();
