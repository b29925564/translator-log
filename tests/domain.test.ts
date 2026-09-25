import { describe, expect, it } from 'vitest';
import { parseCatReport, weightedWords } from '../src/domain/cat';
import { DEFAULT_CAT_GRID, DEFAULT_SETTINGS } from '../src/domain/constants';
import { parseCSV, parseDate, guessMapping, toCSV } from '../src/domain/csv';
import { addDays, diffDays, workingDays } from '../src/domain/dates';
import { generateDemo } from '../src/domain/demo';
import { buildICS } from '../src/domain/ics';
import { mergeSnapshots, emptySnapshot } from '../src/domain/merge';
import { fxRate, jobGross, jobNet, suggestDeductions } from '../src/domain/money';
import { buildResume, resumeMarkdown, bigNumber } from '../src/domain/resume';
import {
  clientStats,
  dailyWords,
  earliestFinish,
  hoursByJob,
  insights,
  milestones,
  monthlySeries,
  monthsBack,
  rateBenchmark,
  receivables,
  workload,
  yearReview,
} from '../src/domain/stats';
import { taxYear } from '../src/domain/tax';
import type { Job } from '../src/domain/types';
import { countText, billableCount } from '../src/domain/wordcount';
import { extractFromText, extractFromZip } from '../src/domain/fileText';
import { zipSync, strToU8 } from 'fflate';

const job = (over: Partial<Job> = {}): Job => ({
  id: 'j' + Math.random(),
  createdAt: 0,
  updatedAt: 0,
  title: 't',
  service: 'translation',
  sourceLang: 'en',
  targetLang: 'zh-TW',
  tags: [],
  unit: 'word',
  quantity: 1000,
  rate: 1,
  currency: 'TWD',
  fxToBase: 1,
  status: 'delivered',
  ...over,
});

describe('money', () => {
  it('computes gross with surcharge, minimum and override', () => {
    expect(jobGross(job({ quantity: 12500, rate: 0.9 }))).toBe(11250);
    expect(jobGross(job({ quantity: 1000, rate: 1, surchargePct: 30 }))).toBe(1300);
    expect(jobGross(job({ quantity: 100, rate: 1, minimumFee: 500 }))).toBe(500);
    expect(jobGross(job({ unit: 'flat', rate: 8000 }))).toBe(8000);
    expect(jobGross(job({ amountOverride: 4321 }))).toBe(4321);
    expect(jobGross(job({ currency: 'USD', quantity: 3333, rate: 0.085 }))).toBe(283.31);
  });

  it('applies CAT weighting', () => {
    const j = job({ quantity: 1000, rate: 1, cat: { counts: { noMatch: 600, m100: 200, repetition: 200 }, grid: DEFAULT_CAT_GRID } });
    expect(jobGross(j)).toBe(700);
  });

  it('suggests Taiwan withholding and NHI premium', () => {
    const tax = DEFAULT_SETTINGS.tax;
    expect(suggestDeductions(20000, 'TWD', { withholds: true }, tax)).toEqual({ withholding: 0, nhi: 422 });
    expect(suggestDeductions(30000, 'TWD', { withholds: true }, tax)).toEqual({ withholding: 3000, nhi: 633 });
    expect(suggestDeductions(30000, 'USD', { withholds: true }, tax)).toEqual({ withholding: 0, nhi: 0 });
    expect(suggestDeductions(30000, 'TWD', { withholds: false }, tax)).toEqual({ withholding: 0, nhi: 0 });
    expect(jobNet(job({ quantity: 30000, withholding: 3000, nhi: 633 }))).toBe(26367);
  });

  it('converts through USD rates', () => {
    expect(fxRate('USD', 'TWD', { USD: 1, TWD: 30 })).toBe(30);
    expect(fxRate('TWD', 'USD', { USD: 1, TWD: 30 })).toBeCloseTo(1 / 30);
    expect(fxRate('EUR', 'TWD', { USD: 1, TWD: 30, EUR: 0.8 })).toBeCloseTo(37.5);
  });
});

describe('cat report parsing', () => {
  it('reads a Trados-style analysis', () => {
    const text = `Type\tSegments\tWords\tCharacters\tPercent
PerfectMatch\t0\t0\t0\t0.00%
Context Match\t12\t140\t800\t2.10%
Repetitions\t30\t420\t2,100\t6.20%
Cross-file Repetitions\t5\t60\t300\t0.90%
100%\t40\t610\t3,050\t9.00%
95% - 99%\t20\t300\t1,500\t4.40%
85% - 94%\t10\t150\t750\t2.20%
75% - 84%\t8\t100\t520\t1.50%
50% - 74%\t6\t80\t400\t1.20%
New\t300\t4,900\t25,000\t72.40%
Total\t431\t6,760\t34,020\t100%`;
    const { counts, matched } = parseCatReport(text);
    expect(counts).toEqual({ context: 140, repetition: 480, m100: 610, m95: 300, m85: 150, m75: 100, m50: 80, noMatch: 4900 });
    expect(matched).toBe(10);
    expect(weightedWords(counts, DEFAULT_CAT_GRID)).toBe(480 * 0.25 + 610 * 0.25 + 150 + 105 + 100 + 80 + 4900);
  });

  it('reads Phrase-style bands including 0%-49%', () => {
    const { counts } = parseCatReport('101%  2  30\nRepetitions 4 50\n0%-49% 100 2,000\nMT 10 300');
    expect(counts).toEqual({ context: 30, repetition: 50, noMatch: 2000, mt: 300 });
  });
});

describe('word count', () => {
  it('counts mixed CJK and English', () => {
    const c = countText('翻譯是一座橋。Translation is a bridge, isn’t it?');
    expect(c.cjkChars).toBe(6);
    expect(c.cjkPunct).toBe(1);
    expect(c.words).toBe(6);
    expect(c.msWord).toBe(13);
    expect(billableCount(c, 'word')).toBe(12);
  });
  it('keeps numbers and hyphenated words together', () => {
    expect(countText('The state-of-the-art device costs 1,250.50 dollars.').words).toBe(6);
  });
});

describe('file extraction', () => {
  it('extracts docx paragraphs', () => {
    const xml = '<w:document><w:body><w:p><w:r><w:t>Hello</w:t></w:r><w:r><w:t xml:space="preserve"> world</w:t></w:r></w:p><w:p><w:r><w:t>第二段 &amp; more</w:t></w:r></w:p></w:body></w:document>';
    const zip = zipSync({ 'word/document.xml': strToU8(xml) });
    expect(extractFromZip('docx', zip)).toBe('Hello world\n第二段 & more');
  });
  it('strips srt timing', () => {
    expect(extractFromText('srt', '1\n00:00:01,000 --> 00:00:02,000\nHello there\n\n2\n00:00:03,000 --> 00:00:04,000\n<i>General Kenobi</i>\n')).toBe('Hello there\nGeneral Kenobi');
  });
});

describe('dates', () => {
  it('does calendar arithmetic', () => {
    expect(addDays('2026-02-27', 3)).toBe('2026-03-02');
    expect(diffDays('2026-09-25', '2026-10-20')).toBe(25);
    expect(workingDays('2026-09-25', '2026-09-29', [1, 2, 3, 4, 5])).toEqual(['2026-09-25', '2026-09-28', '2026-09-29']);
  });
});

describe('csv', () => {
  it('parses quoted CSV and guesses mappings', () => {
    const rows = parseCSV('日期,客戶,案件名稱,字數,單價,金額\n2024/3/5,"ABC, Inc.",說明書,"1,200",1.2,1440\n');
    expect(rows[1][1]).toBe('ABC, Inc.');
    expect(guessMapping(rows[0])).toEqual(['date', 'client', 'title', 'quantity', 'rate', 'amount']);
    expect(parseDate('113/05/20')).toBe('2024-05-20');
    expect(parseDate('45567')).toBe('2024-10-02');
    expect(toCSV([['a,b', 'c"d']])).toBe('﻿"a,b","c""d"');
  });
});

describe('merge', () => {
  it('last write wins and converges', () => {
    const a = emptySnapshot();
    const b = emptySnapshot();
    a.jobs.push({ id: '1', createdAt: 0, updatedAt: 10 } as never, { id: '2', createdAt: 0, updatedAt: 5 } as never);
    b.jobs.push({ id: '1', createdAt: 0, updatedAt: 20 } as never, { id: '3', createdAt: 0, updatedAt: 1 } as never);
    const r = mergeSnapshots(a, b);
    expect(r.merged.jobs.map((x) => x.id).sort()).toEqual(['1', '2', '3']);
    expect(r.toLocal.jobs.map((x) => x.id).sort()).toEqual(['1', '3']);
    expect(r.remoteStale).toBe(true);
    const r2 = mergeSnapshots(b, a);
    expect(JSON.stringify(r2.merged.jobs.sort((x, y) => x.id.localeCompare(y.id)))).toBe(
      JSON.stringify(r.merged.jobs.sort((x, y) => x.id.localeCompare(y.id))),
    );
    const r3 = mergeSnapshots(r.merged, r.merged);
    expect(r3.remoteStale).toBe(false);
    expect(r3.stats.pulled).toBe(0);
  });
});

describe('ics', () => {
  it('builds all-day and timed events', () => {
    const s = buildICS([
      { uid: 'a', title: '交稿：說明書', when: '2026-10-20' },
      { uid: 'b', title: 'Interpreting', when: '2026-10-21T14:00' },
    ]);
    expect(s).toContain('DTSTART;VALUE=DATE:20261020');
    expect(s).toContain('DTEND;VALUE=DATE:20261021');
    expect(s).toContain('DTSTART:20261021T140000');
    expect(s.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });
});

describe('demo data + stats', () => {
  const today = '2026-09-25';
  const demo = generateDemo(today);
  const hours = hoursByJob(demo.sessions);

  it('generates a believable dataset', () => {
    expect(demo.clients.length).toBe(12);
    expect(demo.jobs.length).toBeGreaterThan(300);
    expect(demo.jobs.some((j) => j.status === 'active')).toBe(true);
    expect(demo.jobs.some((j) => j.status === 'invoiced')).toBe(true);
    expect(demo.sessions.length).toBeGreaterThan(100);
    expect(demo.invoices.length).toBeGreaterThan(10);
    expect(generateDemo(today).jobs.length).toBe(demo.jobs.length); // deterministic
  });

  it('computes series, receivables, benchmarks and workload', () => {
    const months = monthlySeries(demo.jobs, monthsBack(today, 12));
    expect(months).toHaveLength(12);
    expect(months.reduce((s, m) => s + m.earned, 0)).toBeGreaterThan(500_000);
    const rec = receivables(demo.jobs, demo.clients, today);
    expect(rec.length).toBeGreaterThan(0);
    const bench = rateBenchmark(demo.jobs, { ratePerWordBase: 2.5, sourceLang: 'en', targetLang: 'zh-TW', unit: 'word' });
    expect(bench!.n).toBeGreaterThan(5);
    expect(bench!.percentile).toBeGreaterThan(0);
    const load = workload(demo.jobs, DEFAULT_SETTINGS.work, today, 14, 450);
    expect(load).toHaveLength(14);
    expect(earliestFinish(load, 5)).toBeDefined();
    const cs = clientStats(demo.clients[0], demo.jobs, hours, today, bench!.median);
    expect(['A', 'B', 'C', 'D']).toContain(cs.grade);
    expect(cs.avgDaysToPay).toBeGreaterThan(20);
  });

  it('builds a year review, milestones, insights and daily output', () => {
    const r = yearReview(demo.jobs, demo.sessions, 2025, today, [1, 2, 3, 4, 5]);
    expect(r.totals.words).toBeGreaterThan(100_000);
    expect(r.topClient).toBeDefined();
    expect(r.activeDays).toBeGreaterThan(50);
    expect(r.persona).not.toBe('default');
    const ms = milestones(demo.jobs);
    expect(ms.find((m) => m.id === 'words-100000')!.achievedAt).toBeDefined();
    const ins = insights({ jobs: demo.jobs, clients: demo.clients, sessions: demo.sessions, today, work: DEFAULT_SETTINGS.work, yearGoal: 1_500_000 });
    expect(ins.length).toBeGreaterThan(1);
    const daily = dailyWords(demo.jobs, demo.sessions, today);
    expect(daily.size).toBeGreaterThan(300);
  });

  it('summarises a tax year', () => {
    const t = taxYear(demo.jobs, 2025, DEFAULT_SETTINGS.tax);
    expect(t.gross).toBeGreaterThan(0);
    expect(t.withheld).toBeGreaterThan(0);
    expect(t.unwithheld).toBeGreaterThan(0);
    expect(t.taxable9B).toBeGreaterThanOrEqual(0);
  });

  it('writes a résumé in both languages', () => {
    const zh = buildResume(demo.jobs, demo.clients, { name: '林予安', since: 2021 }, { lang: 'zh', clientMode: 'anonymous', projectCount: 5 });
    expect(zh.summary).toContain('自 2021 年起');
    expect(zh.projects).toHaveLength(5);
    const md = resumeMarkdown(zh);
    expect(md).toContain('## 代表案例');
    const en = buildResume(demo.jobs, demo.clients, { name: '林予安', nameEn: 'Yu-An Lin' }, { lang: 'en', clientMode: 'named', projectCount: 3 });
    expect(en.summary).toMatch(/^Freelance translator since/);
    expect(en.name).toBe('Yu-An Lin');
    expect(bigNumber(2_351_200, 'zh')).toBe('235 萬');
    expect(bigNumber(2_351_200, 'en')).toBe('2.35M');
  });
});
