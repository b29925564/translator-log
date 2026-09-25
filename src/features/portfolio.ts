// Builds a standalone, bilingual one-page portfolio site from the log:
// a single HTML file the translator can host anywhere (GitHub Pages,
// Netlify, a personal domain) or send as an attachment.

import { W_LINES } from '../app/Logo';
import { layoutSkyline } from '../charts/skylineGeo';
import { bigNumber, type ResumeData } from '../domain/resume';
import type { SkylineMonth } from '../domain/stats';
import type { Profile } from '../domain/types';

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const GOLD = '#d4b36c';
const INK = '#0b0b0c';

const glyph = (size: number, color = GOLD) =>
  `<svg width="${size}" height="${Math.round(size * 0.8)}" viewBox="-3 11 70 56" aria-hidden="true"><defs><clipPath id="wc"><rect x="-10" y="14" width="90" height="80"/></clipPath></defs><g clip-path="url(#wc)" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="miter" stroke-miterlimit="12">${W_LINES.map((p) => `<polyline points="${p}"/>`).join('')}</g></svg>`;

/** A static rendering of the Career Skyline with a CSS rise-in. */
export const skylineSVG = (data: SkylineMonth[], width = 1200, height = 230) => {
  if (!data.length) return '';
  const L = layoutSkyline(data, width, height, { reserveTop: 0.08, minSlots: 24 });
  const g = L.groundY;
  const towers = L.towers
    .filter((t) => g - t.top > 0)
    .map((t) => {
      const lit = t.lit.map((l) => `<rect x="${l.x.toFixed(2)}" y="${l.y.toFixed(2)}" width="1.4" height="2" fill="${GOLD}"/>`).join('');
      const rim = `<line x1="${(t.x + 0.5).toFixed(2)}" x2="${(t.x + 0.5).toFixed(2)}" y1="${(t.top + (t.w >= 6 ? 4 : 0)).toFixed(2)}" y2="${g}" stroke="${GOLD}" stroke-opacity="${t.i === L.record ? 0.7 : 0.22}"/>`;
      return `<g class="t" style="--r:${(g - t.top + 4).toFixed(1)}px;animation-delay:${Math.round(t.delay)}ms"><path d="${t.d}" fill="url(#tg)"/>${rim}${lit}</g>`;
    })
    .join('');
  const rec = L.towers[L.record];
  const spire =
    rec && g - rec.top > 0
      ? `<line x1="${rec.x + rec.w / 2}" x2="${rec.x + rec.w / 2}" y1="${rec.top}" y2="${rec.top - 20}" stroke="${GOLD}" stroke-width="1.2"/><circle class="beacon" cx="${rec.x + rec.w / 2}" cy="${rec.top - 22}" r="2.4" fill="${GOLD}"/>`
      : '';
  const years = L.yearMarks
    .map((y) => `<line x1="${y.x}" x2="${y.x}" y1="${g + 4}" y2="${g + 9}" stroke="${GOLD}" stroke-opacity=".4"/><text x="${y.x + 3}" y="${height - 5}" font-size="10" fill="#8a8a90">${y.month.slice(0, 4)}</text>`)
    .join('');
  return `<svg class="skyline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMax meet" role="img" aria-label="Career skyline">
<defs><linearGradient id="tg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#232327"/><stop offset="1" stop-color="#121214"/></linearGradient><clipPath id="gc"><rect x="-10" y="-200" width="${width + 20}" height="${g + 200}"/></clipPath></defs>
<g clip-path="url(#gc)">${towers}</g>${spire}
<line x1="0" x2="${width}" y1="${g + 0.5}" y2="${g + 0.5}" stroke="${GOLD}" stroke-opacity=".55" stroke-width="1.2"/><line x1="0" x2="${width}" y1="${g + 3.5}" y2="${g + 3.5}" stroke="${GOLD}" stroke-opacity=".2"/>${years}
</svg>`;
};

const both = (zh: string, en: string, tag = 'span') => `<${tag} lang="zh-Hant">${zh}</${tag}><${tag} lang="en">${en}</${tag}>`;

const bars = (items: { label: string; words: number; jobs?: number; share: number }[], lang: 'zh' | 'en') => {
  const max = Math.max(1, ...items.map((d) => d.words));
  return `<ul class="bars">${items
    .slice(0, 6)
    .map(
      (d) =>
        `<li><div class="row"><span>${esc(d.label)}</span><span class="num">${lang === 'zh' ? `${esc(bigNumber(d.words, 'zh'))} 字` : `${esc(bigNumber(d.words, 'en'))} words`}</span></div><div class="bar"><i style="width:${Math.max(2, (d.words / max) * 100).toFixed(1)}%"></i></div></li>`,
    )
    .join('')}</ul>`;
};

const projects = (r: ResumeData) =>
  `<ol class="projects">${r.projects
    .map(
      (p) =>
        `<li><span class="yr">${p.year}</span><div><div class="pt">${esc(p.title)}</div><div class="pd">${esc([p.client, p.detail].filter(Boolean).join(r.lang === 'zh' ? '・' : ' · '))}</div></div></li>`,
    )
    .join('')}</ol>`;

const chips = (xs: string[]) => `<div class="chips">${xs.map((x) => `<span>${esc(x)}</span>`).join('')}</div>`;

export interface PortfolioInput {
  zh: ResumeData;
  en: ResumeData;
  profile: Profile;
  skyline: SkylineMonth[];
  defaultLang: 'zh' | 'en';
}

export const buildPortfolio = ({ zh, en, profile, skyline, defaultLang }: PortfolioInput): string => {
  const nameZh = esc(profile.name || zh.name || 'Translator');
  const nameEn = esc(profile.nameEn || profile.name || en.name || 'Translator');
  const since = zh.since ?? new Date().getFullYear();
  const contact = [
    profile.email && `<a href="mailto:${esc(profile.email)}">${esc(profile.email)}</a>`,
    profile.phone && `<a href="tel:${esc(profile.phone.replace(/\s/g, ''))}">${esc(profile.phone)}</a>`,
    profile.website && `<a href="${esc(/^https?:/.test(profile.website) ? profile.website : 'https://' + profile.website)}" rel="me">${esc(profile.website.replace(/^https?:\/\//, ''))}</a>`,
  ].filter(Boolean);
  const stat = (v: string, zhL: string, enL: string) => `<div class="stat"><div class="v">${v}</div><div class="l">${both(zhL, enL)}</div></div>`;
  const year = new Date().getFullYear();

  return `<!doctype html>
<html lang="${defaultLang === 'zh' ? 'zh-Hant' : 'en'}" data-lang="${defaultLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${defaultLang === 'zh' ? `${nameZh}｜${esc(zh.headline)}` : `${nameEn} — ${esc(en.headline)}`}</title>
<meta name="description" content="${esc(defaultLang === 'zh' ? zh.summary : en.summary)}">
<meta property="og:title" content="${defaultLang === 'zh' ? nameZh : nameEn}">
<meta property="og:description" content="${esc(defaultLang === 'zh' ? zh.headline : en.headline)}">
<meta name="theme-color" content="${INK}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..700&family=Noto+Sans+TC:wght@400;500;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}
:root{--ink:${INK};--paper:#f4f4f2;--gold:${GOLD};--gold-d:#87672b;--muted:#6f6f75;--line:#e2e2de}
html{background:var(--paper);-webkit-text-size-adjust:100%}
body{margin:0;color:var(--ink);font:16px/1.6 "Archivo","Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
[data-lang=zh] [lang=en],[data-lang=en] [lang=zh-Hant]{display:none!important}
a{color:inherit}
.wide{font-stretch:125%;font-weight:600;text-transform:uppercase;letter-spacing:.24em}
.hero{position:relative;overflow:hidden;background:var(--ink);color:#f2f2ef;isolation:isolate}
.hero:before{content:"";position:absolute;inset:0;z-index:-1;background:repeating-conic-gradient(from 270deg at 50% 100%,rgb(212 179 108/.28) 0 .3deg,transparent .3deg 4deg);-webkit-mask:radial-gradient(circle at 50% 100%,#000,transparent 75%);mask:radial-gradient(circle at 50% 100%,#000,transparent 75%)}
nav{display:flex;align-items:center;gap:14px;max-width:1120px;margin:0 auto;padding:22px 24px}
nav .who{font-size:12px;flex:1}
.lang{display:inline-flex;border:1px solid #37373b;border-radius:3px;padding:2px}
.lang button{all:unset;cursor:pointer;font-size:12px;padding:5px 10px;border-radius:2px;color:#b9b9b4}
.lang button[aria-pressed=true]{background:var(--gold);color:var(--ink);font-weight:600}
.hero-in{max-width:1120px;margin:0 auto;padding:56px 24px 12px}
.kicker{color:var(--gold);font-size:12px;margin:0}
h1{font-weight:600;font-size:clamp(44px,8vw,96px);line-height:1;letter-spacing:-.035em;margin:18px 0 0}
.headline{font-size:clamp(17px,2.2vw,22px);color:#b9b9b4;margin:18px 0 0;max-width:46ch}
.cta{display:inline-flex;align-items:center;gap:10px;margin-top:30px;background:var(--gold);color:var(--ink);text-decoration:none;font-weight:600;padding:14px 22px;border-radius:3px}
.cta:hover{filter:brightness(1.08)}
.skyline{display:block;width:100%;max-width:1200px;margin:24px auto 0;height:auto}
.skyline .t{animation:rise 1.2s cubic-bezier(.2,.8,.2,1) both}
.beacon{transform-box:fill-box;transform-origin:center;animation:beacon 2.4s ease-in-out infinite}
@keyframes rise{from{transform:translateY(var(--r))}to{transform:none}}
@keyframes beacon{0%,100%{opacity:.35}50%{opacity:1}}
main{max-width:1120px;margin:0 auto;padding:0 24px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid var(--ink);border-top:2px solid var(--ink);margin-top:48px}
.stat{padding:22px 18px 20px 0}
.stat+.stat{border-left:1px solid var(--line);padding-left:18px}
.stat .v{font-size:clamp(28px,4vw,44px);font-weight:500;letter-spacing:-.03em;line-height:1}
.stat .l{margin-top:8px;font-size:13px;color:var(--muted)}
section{padding:56px 0 0}
h2{font-stretch:125%;font-weight:600;text-transform:uppercase;letter-spacing:.2em;font-size:12px;color:var(--gold-d);margin:0 0 18px}
.about p{font-size:clamp(18px,2.2vw,22px);line-height:1.65;margin:0;max-width:62ch}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:48px}
.bars{list-style:none;margin:0;padding:0}
.bars li+li{margin-top:14px}
.bars .row{display:flex;justify-content:space-between;gap:12px;font-size:15px}
.bars .num{color:var(--muted);font-variant-numeric:tabular-nums}
.bar{height:3px;background:var(--line);margin-top:6px}
.bar i{display:block;height:100%;background:var(--ink)}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chips span{border:1px solid #c6c6c1;border-radius:2px;padding:4px 10px;font-size:14px}
.projects{list-style:none;margin:0;padding:0;border-top:1px solid var(--ink)}
.projects li{display:grid;grid-template-columns:72px 1fr;gap:16px;padding:16px 0;border-bottom:1px solid var(--line)}
.yr{font-variant-numeric:tabular-nums;color:var(--muted);font-size:14px;padding-top:2px}
.pt{font-weight:600;font-size:17px}
.pd{color:var(--muted);font-size:14px;margin-top:2px}
.clients{font-size:17px;line-height:1.8;max-width:70ch;margin:0}
footer{margin-top:80px;background:var(--ink);color:#b9b9b4}
footer .in{max-width:1120px;margin:0 auto;padding:44px 24px;display:flex;flex-wrap:wrap;gap:24px;justify-content:space-between;align-items:flex-end}
footer .contact{display:flex;flex-direction:column;gap:6px;font-size:16px}
footer .contact a{color:#f2f2ef;text-decoration:none;border-bottom:1px solid var(--gold)}
footer small{font-size:12px;color:#76767c}
.rule{height:5px;border-top:2px solid var(--gold);border-bottom:1px solid var(--gold);width:120px;margin:0 0 16px}
@media (max-width:760px){.grid2{grid-template-columns:1fr;gap:40px}.stats{grid-template-columns:1fr 1fr}.stat:nth-child(3){border-left:0;padding-left:0}.stat:nth-child(n+3){border-top:1px solid var(--line)}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
@media print{.hero{background:#fff;color:var(--ink)}.hero:before,.lang,.cta,.skyline{display:none}footer{background:#fff;color:var(--ink)}}
</style>
</head>
<body>
<header class="hero">
  <nav>${glyph(30)}<span class="who wide">${nameEn}</span><div class="lang" role="group" aria-label="Language"><button type="button" data-set="zh" aria-pressed="${defaultLang === 'zh'}">中文</button><button type="button" data-set="en" aria-pressed="${defaultLang === 'en'}">EN</button></div></nav>
  <div class="hero-in">
    <p class="kicker wide">${both(`自由譯者 · ${since} 年起`, `Freelance translator · since ${since}`)}</p>
    <h1>${both(nameZh, nameEn)}</h1>
    <p class="headline">${both(esc(zh.headline), esc(en.headline))}</p>
    ${profile.email ? `<a class="cta" href="mailto:${esc(profile.email)}">${both('與我聯絡', 'Get in touch')} →</a>` : ''}
  </div>
  ${skylineSVG(skyline)}
</header>
<main>
  <div class="stats">
    ${stat(both(esc(bigNumber(zh.stats.words, 'zh')), esc(bigNumber(en.stats.words, 'en'))), '累計字數', 'words delivered')}
    ${stat(String(zh.stats.jobs), '完成案件', 'projects')}
    ${stat(String(zh.stats.clients), '合作客戶', 'clients')}
    ${stat(String(zh.stats.years), '年資', zh.stats.years === 1 ? 'year freelancing' : 'years freelancing')}
  </div>
  <section class="about"><h2>${both('關於我', 'About')}</h2>${both(esc(zh.summary), esc(en.summary), 'p')}</section>
  <section class="grid2">
    <div><h2>${both('專業領域', 'Specialisations')}</h2><div lang="zh-Hant">${bars(zh.domains, 'zh')}</div><div lang="en">${bars(en.domains, 'en')}</div></div>
    <div><h2>${both('語言組合', 'Language pairs')}</h2><div lang="zh-Hant">${bars(zh.pairs, 'zh')}</div><div lang="en">${bars(en.pairs, 'en')}</div></div>
  </section>
  <section class="grid2">
    <div><h2>${both('服務項目', 'Services')}</h2><div lang="zh-Hant">${chips(zh.services.map((s) => s.label))}</div><div lang="en">${chips(en.services.map((s) => s.label))}</div></div>
    ${zh.tools.length ? `<div><h2>${both('CAT 工具', 'CAT tools')}</h2>${chips(zh.tools)}</div>` : ''}
  </section>
  ${zh.projects.length ? `<section><h2>${both('代表案例', 'Selected projects')}</h2><div lang="zh-Hant">${projects(zh)}</div><div lang="en">${projects(en)}</div></section>` : ''}
  ${zh.clients.length ? `<section><h2>${both('合作客戶', 'Clients')}</h2><p class="clients" lang="zh-Hant">${esc(zh.clients.slice(0, 16).join('、'))}</p><p class="clients" lang="en">${esc(en.clients.slice(0, 16).join(' · '))}</p></section>` : ''}
</main>
<footer><div class="in"><div><div class="rule"></div><div class="contact">${contact.join('') || both('（在記譯設定中加入聯絡方式）', '(Add contact details in Witimemo settings)')}</div></div><small>© ${year} ${nameEn} · ${both('以記譯 Witimemo 製作', 'Made with Witimemo')}</small></div></footer>
<script>
(function(){var h=document.documentElement;function set(l){h.setAttribute('data-lang',l);h.lang=l==='zh'?'zh-Hant':'en';document.querySelectorAll('.lang button').forEach(function(b){b.setAttribute('aria-pressed',String(b.getAttribute('data-set')===l))});}
document.querySelectorAll('.lang button').forEach(function(b){b.addEventListener('click',function(){set(b.getAttribute('data-set'))})});})();
</script>
</body>
</html>
`;
};
