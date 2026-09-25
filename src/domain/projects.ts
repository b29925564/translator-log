// Projects: one large engagement split into parts (a game's trailer,
// cutscenes and dialogue; a series' episodes; a book's chapters). Each part
// is an ordinary job, so pricing, time tracking, the daily plan, invoices
// and statistics keep working per part.

import { dateOnly, diffDays } from './dates';
import { jobGrossBase, jobWords } from './money';
import { estimateHours, isEarned } from './stats';
import type { Job, Project, ProjectKind, ProjectQuery, ServiceType, Unit } from './types';

export interface PartKind {
  id: string;
  zh: string;
  en: string;
  service: ServiceType;
  unit: Unit;
  /** Numbered parts (episodes, chapters) are created N at a time. */
  numbered?: boolean;
}

export const PART_KINDS: PartKind[] = [
  { id: 'trailer', zh: '預告片字幕', en: 'Trailer subtitles', service: 'subtitling', unit: 'minute' },
  { id: 'cutscene', zh: '過場動畫', en: 'Cutscenes', service: 'subtitling', unit: 'word' },
  { id: 'dialogue', zh: '劇情對話', en: 'Dialogue & conversations', service: 'translation', unit: 'word' },
  { id: 'ui', zh: '介面文字', en: 'UI strings', service: 'translation', unit: 'word' },
  { id: 'items', zh: '道具與技能說明', en: 'Items & skills', service: 'translation', unit: 'word' },
  { id: 'store', zh: '商店頁與行銷文案', en: 'Store page & marketing', service: 'transcreation', unit: 'word' },
  { id: 'patch', zh: '更新說明', en: 'Patch notes', service: 'translation', unit: 'word' },
  { id: 'lqa', zh: '語言測試 LQA', en: 'Linguistic QA', service: 'lqa', unit: 'hour' },
  { id: 'episode', zh: '集', en: 'Episode', service: 'subtitling', unit: 'minute', numbered: true },
  { id: 'chapter', zh: '章', en: 'Chapter', service: 'translation', unit: 'word', numbered: true },
  { id: 'docs', zh: '說明文件', en: 'Help docs', service: 'translation', unit: 'word' },
  { id: 'other', zh: '其他', en: 'Other', service: 'translation', unit: 'word' },
];

export const partKind = (id?: string) => PART_KINDS.find((p) => p.id === id);

export interface ProjectTemplate {
  kind: ProjectKind;
  zh: string;
  en: string;
  /** Parts offered, and which of them start ticked. */
  parts: string[];
  selected: string[];
  /** Default count for numbered parts. */
  count?: number;
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  { kind: 'game', zh: '遊戲在地化', en: 'Game localisation', parts: ['trailer', 'cutscene', 'dialogue', 'ui', 'items', 'store', 'patch', 'lqa'], selected: ['trailer', 'cutscene', 'dialogue', 'ui'] },
  { kind: 'series', zh: '影集／節目', en: 'Series or show', parts: ['episode', 'trailer', 'store'], selected: ['episode', 'trailer'], count: 8 },
  { kind: 'book', zh: '書籍', en: 'Book', parts: ['chapter', 'store'], selected: ['chapter'], count: 12 },
  { kind: 'software', zh: '軟體／App', en: 'Software or app', parts: ['ui', 'docs', 'store', 'patch', 'lqa'], selected: ['ui', 'docs', 'store'] },
  { kind: 'custom', zh: '自訂', en: 'Custom', parts: ['other'], selected: [] },
];

export const templateFor = (kind: ProjectKind) => PROJECT_TEMPLATES.find((t) => t.kind === kind) ?? PROJECT_TEMPLATES[PROJECT_TEMPLATES.length - 1];

/** Label for part `n` of a kind, e.g. “第 3 集” / “Episode 3”. */
export const partLabel = (kind: PartKind, lang: 'zh-TW' | 'en', n?: number) => {
  if (!kind.numbered || n == null) return lang === 'en' ? kind.en : kind.zh;
  return lang === 'en' ? `${kind.en} ${n}` : `第 ${n} ${kind.zh}`;
};

const SEPARATORS = ['｜', ' — ', ' - ', ' · ', '：', ': '];

/** Job title for a part: the project name first, so the part reads well on invoices and lists. */
export const partTitle = (projectName: string, label: string, lang: 'zh-TW' | 'en') => `${projectName}${lang === 'en' ? ' — ' : '｜'}${label}`;

/** The part's own name, without the project prefix. */
export const shortPartName = (title: string, projectName: string) => {
  for (const sep of SEPARATORS) if (title.startsWith(projectName + sep)) return title.slice(projectName.length + sep.length).trim() || title;
  return title;
};

export interface ProjectStats {
  parts: number;
  done: number;
  active: number;
  quotes: number;
  words: number;
  minutes: number;
  hours: number;
  /** Base-currency value of all parts (quotes included). */
  value: number;
  earned: number;
  /** Work-weighted completion, 0–1. */
  progress: number;
  openQueries: number;
  overdue: number;
  nextDue?: { job: Job; date: string };
  start?: string;
  end?: string;
}

/** Totals and work-weighted progress for a project's parts. */
export const projectStats = (project: Project, parts: Job[], today: string, wph = 450): ProjectStats => {
  const live = parts.filter((j) => !j.deletedAt && j.status !== 'cancelled');
  let weightSum = 0;
  let doneSum = 0;
  for (const j of live) {
    // weigh parts by the effort they take, so a trailer counts less than the dialogue
    const w = Math.max(0.25, estimateHours(j, wph));
    const p = isEarned(j) ? 1 : j.status === 'active' ? (j.progress || 0) / 100 : 0;
    weightSum += w;
    doneSum += w * p;
  }
  const upcoming = live
    .filter((j) => (j.status === 'active' || j.status === 'quote') && j.dueAt)
    .map((j) => ({ job: j, date: dateOnly(j.dueAt!) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const starts = live.map((j) => j.receivedAt).filter(Boolean) as string[];
  const ends = [...live.map((j) => (j.dueAt ? dateOnly(j.dueAt) : j.deliveredAt)).filter(Boolean), project.dueAt ? dateOnly(project.dueAt) : undefined].filter(Boolean) as string[];
  return {
    parts: live.length,
    done: live.filter(isEarned).length,
    active: live.filter((j) => j.status === 'active').length,
    quotes: live.filter((j) => j.status === 'quote').length,
    words: live.filter((j) => j.unit !== 'minute' && j.unit !== 'hour').reduce((s, j) => s + jobWords(j), 0),
    minutes: live.filter((j) => j.unit === 'minute').reduce((s, j) => s + (j.quantity || 0), 0),
    hours: live.filter((j) => j.unit === 'hour').reduce((s, j) => s + (j.quantity || 0), 0),
    value: live.reduce((s, j) => s + jobGrossBase(j), 0),
    earned: live.filter(isEarned).reduce((s, j) => s + jobGrossBase(j), 0),
    progress: weightSum ? doneSum / weightSum : 0,
    openQueries: project.queries.filter((q) => q.status !== 'answered').length,
    overdue: upcoming.filter((x) => x.job.status === 'active' && diffDays(today, x.date) < 0).length,
    nextDue: upcoming.find((x) => x.date >= today) ?? upcoming[0],
    start: starts.sort()[0],
    end: ends.sort().at(-1),
  };
};

/**
 * The unanswered questions as a numbered list, ready to paste into an
 * email to the client. Each line names the part and the reference.
 */
export const queriesText = (project: Project, parts: Job[], lang: 'zh-TW' | 'en'): string => {
  const open = project.queries.filter((q) => q.status !== 'answered');
  if (!open.length) return '';
  const names = new Map(parts.map((j) => [j.id, shortPartName(j.title, project.name)]));
  const lines = open.map((q, i) => {
    const where = [q.jobId ? names.get(q.jobId) : undefined, q.ref].filter(Boolean).join(' · ');
    return `${i + 1}. ${where ? `[${where}] ` : ''}${q.text.trim()}`;
  });
  const head = lang === 'en' ? `Questions on ${project.name} (${open.length})` : `關於「${project.name}」的問題（${open.length}）`;
  return [head, '', ...lines].join('\n');
};

export const sortQueries = (qs: ProjectQuery[]) => {
  const rank = { open: 0, sent: 1, answered: 2 } as const;
  return [...qs].sort((a, b) => rank[a.status] - rank[b.status] || b.createdAt - a.createdAt);
};
