// Turns the job log into résumé-ready material in Chinese or English.

import { CLIENT_KINDS, domainLabel, langInfo, serviceLabel } from './constants';
import { dateOnly, yearOf } from './dates';
import { jobWords } from './money';
import { groupJobs, incomeDate, isEarned, pairKey } from './stats';
import type { Client, Job, Profile, Project } from './types';

export type ResumeLang = 'zh' | 'en';
export type ClientMode = 'named' | 'anonymous' | 'hidden';

export interface ResumeOptions {
  lang: ResumeLang;
  from?: string;
  to?: string;
  clientMode: ClientMode;
  projectCount: number;
  /** Multi-part projects are listed once, with their parts added up. */
  projects?: Project[];
}

export interface ResumeData {
  lang: ResumeLang;
  name: string;
  headline: string;
  summary: string;
  since?: number;
  stats: { words: number; jobs: number; clients: number; years: number };
  pairs: { label: string; words: number; share: number }[];
  domains: { label: string; words: number; jobs: number; share: number }[];
  services: { label: string; jobs: number }[];
  tools: string[];
  projects: { year: number; client?: string; title: string; pair: string; words: number; detail: string }[];
  clients: string[];
}

const L = (lang: ResumeLang) => (lang === 'en' ? 'en' : 'zh-TW');

/** 2,351,200 → “235 萬” / “2.35M”. Rounded down so claims are never inflated. */
export const bigNumber = (n: number, lang: ResumeLang): string => {
  if (lang === 'zh') {
    if (n >= 100_000_000) return `${Math.floor(n / 10_000_000) / 10} 億`;
    if (n >= 10_000) return `${Math.floor(n / 10_000).toLocaleString('zh-TW')} 萬`;
    return n.toLocaleString('zh-TW');
  }
  if (n >= 1_000_000) return `${Math.floor(n / 10_000) / 100}M`;
  if (n >= 10_000) return `${Math.floor(n / 1000)}K`;
  return n.toLocaleString('en-US');
};

export const pairLabel = (j: Pick<Job, 'sourceLang' | 'targetLang'>, lang: ResumeLang) => {
  const s = langInfo(j.sourceLang);
  const t = langInfo(j.targetLang);
  if (lang === 'zh') {
    const short = (x: typeof s) => x.zh.replace(/文$/, '').replace('繁體中', '中').replace('簡體中', '簡中').replace('香港中', '港中');
    return `${short(s)}譯${short(t)}`;
  }
  return `${s.short} → ${t.short}`;
};

const HAS_CJK = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;

const COUNTRY: Record<string, { zh: string; en: string }> = {
  TW: { zh: '台灣', en: 'Taiwanese' },
  US: { zh: '美國', en: 'US-based' },
  JP: { zh: '日本', en: 'Japanese' },
  CN: { zh: '中國', en: 'Chinese' },
  HK: { zh: '香港', en: 'Hong Kong' },
  KR: { zh: '韓國', en: 'Korean' },
  GB: { zh: '英國', en: 'UK-based' },
  UK: { zh: '英國', en: 'UK-based' },
  CA: { zh: '加拿大', en: 'Canadian' },
  DE: { zh: '德國', en: 'German' },
  FR: { zh: '法國', en: 'French' },
  SG: { zh: '新加坡', en: 'Singapore' },
};

export const clientPublicName = (c: Client | undefined, mode: ClientMode, lang: ResumeLang): string | undefined => {
  if (!c || mode === 'hidden') return undefined;
  if (mode === 'named') return c.name;
  // a label written in the other language is replaced by a generated one
  if (c.publicLabel && HAS_CJK.test(c.publicLabel) === (lang === 'zh')) return c.publicLabel;
  const kind = CLIENT_KINDS.find((k) => k.id === c.kind);
  const where = c.country ? COUNTRY[c.country.toUpperCase()] : undefined;
  const industry = c.industry && HAS_CJK.test(c.industry) === (lang === 'zh') ? c.industry : '';
  if (lang === 'zh') return `${where?.zh ?? ''}${industry}${kind?.id === 'agency' ? '語言服務公司' : kind?.id === 'direct' ? '企業客戶' : kind?.id === 'publisher' ? '出版社' : kind?.zh ?? '客戶'}`;
  const en = kind?.id === 'agency' ? 'language service provider' : kind?.id === 'direct' ? 'corporate client' : kind?.id === 'publisher' ? 'publisher' : (kind?.en ?? 'client').toLowerCase();
  const label = [where?.en, industry, en].filter(Boolean).join(' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const projectTitle = (j: Job, lang: ResumeLang) => {
  // an English résumé never shows a Chinese title for a confidential job
  const usable = (t?: string) => !!t && !(lang === 'en' && j.confidential && HAS_CJK.test(t));
  if (usable(j.publicTitle)) return j.publicTitle!;
  if (!j.confidential) return j.title;
  const d = domainLabel(j.domain, L(lang));
  const s = serviceLabel(j.service, L(lang));
  return lang === 'zh' ? `${d}領域${s}專案` : `${d} ${s.toLowerCase()} project`;
};

const projectCaseTitle = (p: Project, biggest: Job, lang: ResumeLang) => {
  if (!p.confidential) return p.name;
  if (p.publicTitle && !(lang === 'en' && HAS_CJK.test(p.publicTitle))) return p.publicTitle;
  const d = domainLabel(biggest.domain, L(lang));
  return lang === 'zh' ? `${d}領域大型在地化專案` : `Large ${d.toLowerCase()} localisation project`;
};

const joinList = (items: string[], lang: ResumeLang) => {
  if (lang === 'zh') return items.join('、');
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
};

export const buildResume = (jobs: Job[], clients: Client[], profile: Profile, opts: ResumeOptions): ResumeData => {
  const lang = opts.lang;
  const loc = L(lang);
  const done = jobs.filter((j) => !j.deletedAt && isEarned(j)).filter((j) => {
    const d = incomeDate(j);
    return (!opts.from || d >= opts.from) && (!opts.to || d <= opts.to);
  });
  const cmap = new Map(clients.map((c) => [c.id, c]));
  const words = done.reduce((s, j) => s + jobWords(j), 0);
  const clientIds = new Set(done.map((j) => j.clientId).filter(Boolean) as string[]);
  const firstYear = done.length ? Math.min(...done.map((j) => yearOf(incomeDate(j)))) : new Date().getFullYear();
  const since = profile.since ?? firstYear;
  const years = Math.max(1, new Date().getFullYear() - since + 1);

  const pairs = groupJobs(done, pairKey)
    .sort((a, b) => b.words - a.words)
    .filter((g) => g.words > 0 || g.jobs > 0)
    .map((g) => {
      const [s, t] = g.key.split('>');
      return { label: pairLabel({ sourceLang: s, targetLang: t }, lang), words: g.words, share: words ? g.words / words : 0 };
    });
  const domainGroups = groupJobs(done, (j) => j.domain ?? 'general').sort((a, b) => b.words - a.words || b.jobs - a.jobs);
  const domains = domainGroups.map((g) => ({ label: domainLabel(g.key, loc), words: g.words, jobs: g.jobs, share: words ? g.words / words : 0 }));
  const services = groupJobs(done, (j) => j.service)
    .sort((a, b) => b.jobs - a.jobs)
    .map((g) => ({ label: serviceLabel(g.key as Job['service'], loc), jobs: g.jobs }));
  const toolCounts = new Map<string, number>();
  for (const j of done) if (j.catTool) toolCounts.set(j.catTool, (toolCounts.get(j.catTool) || 0) + 1);
  const tools = [...toolCounts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);

  // one case per standalone job, and one per multi-part project
  const pmap = new Map((opts.projects ?? []).filter((p) => !p.deletedAt).map((p) => [p.id, p]));
  const cases = new Map<string, { date: string; words: number; featured: boolean; job: Job; project?: Project; parts: number }>();
  for (const j of done) {
    const p = j.projectId ? pmap.get(j.projectId) : undefined;
    const key = p ? 'p:' + p.id : 'j:' + j.id;
    const w = jobWords(j);
    const c = cases.get(key);
    if (!c) cases.set(key, { date: incomeDate(j), words: w, featured: !!j.featured, job: j, project: p, parts: 1 });
    else {
      c.words += w;
      c.parts++;
      c.featured ||= !!j.featured;
      if (incomeDate(j) > c.date) c.date = incomeDate(j);
      if (w > jobWords(c.job)) c.job = j;
    }
  }
  const projects = [...cases.values()]
    .sort((a, b) => Number(b.featured) - Number(a.featured) || b.words - a.words)
    .slice(0, opts.projectCount)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((c) => {
      const j = c.job;
      const w = c.words;
      const pair = pairLabel(j, lang);
      const wordsText = w ? (lang === 'zh' ? `${w.toLocaleString('zh-TW')} 字` : `${w.toLocaleString('en-US')} words`) : '';
      const partsText = c.parts > 1 ? (lang === 'zh' ? `${c.parts} 個部分` : `${c.parts} parts`) : '';
      return {
        year: yearOf(dateOnly(c.date)),
        client: clientPublicName(j.clientId ? cmap.get(j.clientId) : undefined, opts.clientMode, lang),
        title: c.project ? projectCaseTitle(c.project, j, lang) : projectTitle(j, lang),
        pair,
        words: w,
        detail: [pair, wordsText, partsText].filter(Boolean).join(lang === 'zh' ? '，' : ', '),
      };
    });

  const clientNames = [...new Set(
    groupJobs(done.filter((j) => j.clientId), (j) => j.clientId)
      .map((g) => clientPublicName(cmap.get(g.key), opts.clientMode, lang))
      .filter(Boolean) as string[],
  )];

  const topDomains = domains.filter((d) => d.label && d.words > 0).slice(0, 3);
  const kinds = [...new Set(done.map((j) => (j.clientId ? cmap.get(j.clientId)?.kind : undefined)).filter(Boolean))] as Client['kind'][];
  const EN_PLURAL: Record<Client['kind'], string> = { agency: 'agencies', direct: 'direct clients', publisher: 'publishers', platform: 'platforms', other: 'other clients' };
  const kindWords = kinds.map((k) => (lang === 'zh' ? CLIENT_KINDS.find((x) => x.id === k)!.zh.split('／')[0] : EN_PLURAL[k]));
  const mainPair = pairs[0]?.label;
  const name = lang === 'zh' ? profile.name : profile.nameEn || profile.name;

  const headline =
    lang === 'zh'
      ? ['自由譯者', mainPair, topDomains.map((d) => d.label).join('・')].filter(Boolean).join('｜')
      : ['Freelance Translator', pairs[0] ? pairs[0].label : '', topDomains.map((d) => d.label).join(' · ')].filter(Boolean).join(' | ');

  let summary: string;
  if (lang === 'zh') {
    summary =
      `自 ${since} 年起從事自由翻譯，累計完成 ${done.length.toLocaleString('zh-TW')} 件案件、逾 ${bigNumber(words, 'zh')}字，` +
      `合作客戶 ${clientIds.size} 家${kindWords.length ? `，包括${joinList(kindWords, 'zh')}` : ''}。` +
      (topDomains.length
        ? `專精${joinList(topDomains.map((d) => `${d.label}（${bigNumber(d.words, 'zh')}字）`), 'zh')}等領域。`
        : '') +
      (tools.length ? `熟悉 ${tools.slice(0, 4).join('、')} 等 CAT 工具。` : '');
  } else {
    summary =
      `Freelance translator since ${since}, with ${bigNumber(words, 'en')}+ words delivered across ${done.length.toLocaleString('en-US')} projects ` +
      `for ${clientIds.size} clients${kindWords.length ? `, including ${joinList(kindWords, 'en')}` : ''}. ` +
      (topDomains.length ? `Specialised in ${joinList(topDomains.map((d) => `${d.label} (${bigNumber(d.words, 'en')} words)`), 'en')}. ` : '') +
      (tools.length ? `Proficient in ${joinList(tools.slice(0, 4), 'en')}.` : '');
  }

  return {
    lang,
    name,
    headline,
    summary: summary.trim(),
    since,
    stats: { words, jobs: done.length, clients: clientIds.size, years },
    pairs,
    domains,
    services,
    tools,
    projects,
    clients: clientNames,
  };
};

export const resumeMarkdown = (r: ResumeData): string => {
  const zh = r.lang === 'zh';
  const lines: string[] = [];
  if (r.name) lines.push(`# ${r.name}`, '');
  lines.push(`**${r.headline}**`, '', r.summary, '');
  lines.push(zh ? '## 翻譯經歷概覽' : '## Experience at a glance', '');
  lines.push(
    zh
      ? `- 累計字數：${bigNumber(r.stats.words, 'zh')}字\n- 完成案件：${r.stats.jobs} 件\n- 合作客戶：${r.stats.clients} 家\n- 年資：${r.stats.years} 年`
      : `- Words delivered: ${bigNumber(r.stats.words, 'en')}\n- Projects: ${r.stats.jobs}\n- Clients: ${r.stats.clients}\n- Years freelancing: ${r.stats.years}`,
    '',
  );
  if (r.pairs.length) {
    lines.push(zh ? '## 語言組合' : '## Language pairs', '');
    for (const p of r.pairs.slice(0, 5)) lines.push(`- ${p.label}${p.words ? (zh ? `（${bigNumber(p.words, 'zh')}字）` : ` (${bigNumber(p.words, 'en')} words)`) : ''}`);
    lines.push('');
  }
  if (r.domains.length) {
    lines.push(zh ? '## 專業領域' : '## Specialisations', '');
    for (const d of r.domains.slice(0, 6)) lines.push(`- ${d.label}${d.words ? (zh ? `：${bigNumber(d.words, 'zh')}字，${d.jobs} 件` : `: ${bigNumber(d.words, 'en')} words, ${d.jobs} projects`) : ''}`);
    lines.push('');
  }
  if (r.projects.length) {
    lines.push(zh ? '## 代表案例' : '## Selected projects', '');
    for (const p of r.projects) lines.push(`- ${p.year}｜${[p.client, p.title].filter(Boolean).join(zh ? '｜' : ' — ')}（${p.detail}）`.replace('（', zh ? '（' : ' (').replace(/）$/, zh ? '）' : ')'));
    lines.push('');
  }
  if (r.clients.length) {
    lines.push(zh ? '## 合作客戶' : '## Clients', '', r.clients.slice(0, 12).join(zh ? '、' : ', '), '');
  }
  if (r.tools.length) lines.push(zh ? '## 工具' : '## Tools', '', r.tools.join(zh ? '、' : ', '), '');
  return lines.join('\n').trim() + '\n';
};
