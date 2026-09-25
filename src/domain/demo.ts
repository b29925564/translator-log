// Deterministic sample data: four years of a plausible Taiwan-based
// EN/JA → ZH-TW freelancer. Every record is flagged `demo: true`.

import { addDays, diffDays, weekday } from './dates';
import type { Client, Invoice, Job, JobStatus, Project, ServiceType, Session, Unit } from './types';
import { jobGross, suggestDeductions } from './money';
import { DEFAULT_CAT_GRID, DEFAULT_SETTINGS } from './constants';

const mulberry32 = (seed: number) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

interface ClientSpec {
  c: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>;
  weight: number;
  from: string;
  to?: string;
  pair: [string, string];
  unit: Unit;
  rate: number;
  rateGrowth: number; // per year
  service: ServiceType;
  domains: string[];
  words: [number, number]; // log-normal median, spread
  titles: string[];
  tool?: string;
  fx: number;
}

const SPECS: ClientSpec[] = [
  {
    c: { name: '藍海翻譯社', kind: 'agency', country: 'TW', currency: 'TWD', paymentTermsDays: 30, withholds: true, defaultRate: 1.1, defaultUnit: 'word', publicLabel: '台灣語言服務公司', color: 0 },
    weight: 5, from: '2022-01-01', pair: ['en', 'zh-TW'], unit: 'word', rate: 1.0, rateGrowth: 0.05, service: 'translation', domains: ['medical', 'pharma', 'tech'], words: [3200, 0.9],
    titles: ['輸液幫浦使用說明書 v3.2', '血糖儀 IFU 改版', '臨床試驗受試者同意書', '醫療器材風險管理報告', '藥品仿單中譯', '伺服器產品白皮書', '手術機器人操作手冊', '病人衛教手冊'], tool: 'Trados Studio', fx: 1,
  },
  {
    c: { name: 'Lumina Localization', kind: 'agency', country: 'US', currency: 'USD', paymentTermsDays: 45, defaultRate: 0.09, defaultUnit: 'word', publicLabel: 'US-based localization provider', industry: '', color: 1, catGrid: DEFAULT_CAT_GRID },
    weight: 6, from: '2022-03-01', pair: ['en', 'zh-TW'], unit: 'word', rate: 0.08, rateGrowth: 0.06, service: 'translation', domains: ['software', 'marketing', 'tech'], words: [2400, 1.0],
    titles: ['SaaS onboarding emails', 'Mobile banking app UI strings', 'Smart home product page', 'Cloud security whitepaper', 'Help center articles batch 7', 'Holiday campaign landing page', 'Release notes 5.2'], tool: 'Phrase', fx: 31,
  },
  {
    c: { name: 'Harbor & Quill Language Services', kind: 'agency', country: 'GB', currency: 'USD', paymentTermsDays: 30, defaultRate: 0.11, defaultUnit: 'word', color: 2 },
    weight: 3, from: '2023-05-01', pair: ['en', 'zh-TW'], unit: 'word', rate: 0.1, rateGrowth: 0.04, service: 'translation', domains: ['medical', 'pharma', 'legal'], words: [4500, 0.8],
    titles: ['Clinical study protocol synopsis', 'Patient-reported outcome questionnaire', 'Pharmacovigilance SOP', 'Informed consent form update', 'Device labelling pack'], tool: 'memoQ', fx: 31,
  },
  {
    c: { name: '星河出版社', kind: 'publisher', country: 'TW', currency: 'TWD', paymentTermsDays: 60, withholds: true, defaultRate: 0.62, defaultUnit: 'char', publicLabel: '台灣文學出版社', color: 3 },
    weight: 0.35, from: '2022-06-01', pair: ['en', 'zh-TW'], unit: 'char', rate: 0.55, rateGrowth: 0.04, service: 'translation', domains: ['literary'], words: [70000, 0.3],
    titles: ['小說《夜行的鯨》', '散文集《北方的光》', '科普書《睡眠的祕密》', '繪本系列（三冊）', '回憶錄《潮汐之間》'], fx: 1,
  },
  {
    c: { name: '森田翻訳', kind: 'agency', country: 'JP', currency: 'JPY', paymentTermsDays: 30, defaultRate: 7, defaultUnit: 'char', publicLabel: '日本遊戲在地化公司', color: 4 },
    weight: 2.5, from: '2022-09-01', pair: ['ja', 'zh-TW'], unit: 'char', rate: 6, rateGrowth: 0.05, service: 'translation', domains: ['games', 'media'], words: [6000, 0.9],
    titles: ['RPG 主線劇情 第4章', '手遊活動文案', '角色語音台詞', '動畫字幕 第12話', '卡牌遊戲技能說明', '遊戲商城更新公告'], tool: 'memoQ', fx: 0.22,
  },
  {
    c: { name: 'Pixelforge Games', kind: 'direct', country: 'CA', currency: 'USD', paymentTermsDays: 30, defaultRate: 0.1, defaultUnit: 'word', publicLabel: 'Indie game studio', color: 5 },
    weight: 1.5, from: '2024-02-01', pair: ['en', 'zh-TW'], unit: 'word', rate: 0.1, rateGrowth: 0.03, service: 'translation', domains: ['games'], words: [5000, 0.9],
    titles: ['Patch 2.4 strings', 'Steam store page', 'Lore codex entries', 'Tutorial dialogue', 'DLC quest text'], tool: 'Crowdin', fx: 32,
  },
  {
    c: { name: '明律法律事務所', kind: 'direct', country: 'TW', currency: 'TWD', paymentTermsDays: 30, withholds: true, defaultRate: 2.2, defaultUnit: 'char', publicLabel: '台北律師事務所', color: 6 },
    weight: 1.6, from: '2023-01-01', pair: ['zh-TW', 'en'], unit: 'char', rate: 2.0, rateGrowth: 0.05, service: 'translation', domains: ['legal'], words: [3500, 0.8],
    titles: ['股權轉讓契約', '仲裁判斷書節譯', '保密協議 NDA', '公司章程修訂', '授權合約中譯英'], tool: 'Trados Studio', fx: 1,
  },
  {
    c: { name: '光譜行銷', kind: 'direct', country: 'TW', currency: 'TWD', paymentTermsDays: 45, withholds: true, defaultUnit: 'flat', publicLabel: '台灣品牌行銷公司', color: 7 },
    weight: 1.2, from: '2023-08-01', pair: ['en', 'zh-TW'], unit: 'flat', rate: 6000, rateGrowth: 0.05, service: 'transcreation', domains: ['marketing', 'fashion'], words: [1200, 0.6],
    titles: ['保養品牌年度 slogan 創譯', '運動品牌社群貼文', '精品錶款型錄文案', '咖啡品牌官網改寫'], fx: 1,
  },
  {
    c: { name: 'Veridia Subtitles', kind: 'agency', country: 'NL', currency: 'EUR', paymentTermsDays: 30, defaultRate: 5, defaultUnit: 'minute', color: 0 },
    weight: 1.2, from: '2022-11-01', to: '2025-06-30', pair: ['en', 'zh-TW'], unit: 'minute', rate: 4.5, rateGrowth: 0.02, service: 'subtitling', domains: ['media'], words: [45, 0.5],
    titles: ['Documentary: Coastline', 'Cooking series ep. 3', 'Indie film festival entry', 'Travel vlog season 2'], tool: 'Subtitle Edit', fx: 34.5,
  },
  {
    c: { name: '大川精密工業', kind: 'direct', country: 'TW', currency: 'TWD', paymentTermsDays: 60, withholds: true, defaultRate: 1.5, defaultUnit: 'char', publicLabel: '台灣精密機械製造商', color: 1 },
    weight: 1, from: '2024-04-01', pair: ['zh-TW', 'en'], unit: 'char', rate: 1.4, rateGrowth: 0.03, service: 'translation', domains: ['engineering'], words: [8000, 0.7],
    titles: ['CNC 車床操作手冊', '產品型錄英文版', '安規測試報告', '展覽簡報中譯英'], fx: 1,
  },
  {
    c: { name: 'Atlas Patent Partners', kind: 'agency', country: 'US', currency: 'USD', paymentTermsDays: 30, defaultRate: 0.12, defaultUnit: 'word', publicLabel: 'IP law firm', color: 2 },
    weight: 1, from: '2025-01-01', pair: ['en', 'zh-TW'], unit: 'word', rate: 0.12, rateGrowth: 0.02, service: 'translation', domains: ['patent'], words: [7000, 0.5],
    titles: ['半導體封裝專利說明書', 'Battery electrode patent claims', '醫療影像演算法專利', 'Office action response'], tool: 'Trados Studio', fx: 30.5,
  },
  {
    c: { name: '小滿國際會議', kind: 'direct', country: 'TW', currency: 'TWD', paymentTermsDays: 30, withholds: true, defaultRate: 4000, defaultUnit: 'hour', color: 3 },
    weight: 0.5, from: '2024-09-01', pair: ['en', 'zh-TW'], unit: 'hour', rate: 3800, rateGrowth: 0.03, service: 'interpreting', domains: ['tech', 'medical'], words: [4, 0.4],
    titles: ['半導體論壇逐步口譯', '醫學研討會陪同口譯', '產品發表會口譯'], fx: 1,
  },
];

const fxDrift = (base: number, date: string) => {
  if (base === 1) return 1;
  const y = Number(date.slice(0, 4));
  const k = y <= 2022 ? 0.98 : y === 2023 ? 1.0 : y === 2024 ? 1.03 : y === 2025 ? 0.99 : 0.97;
  return Math.round(base * k * 10000) / 10000;
};

const nextWorkday = (d: string) => {
  let x = d;
  while (weekday(x) === 0 || weekday(x) === 6) x = addDays(x, 1);
  return x;
};

export interface DemoData {
  clients: Client[];
  jobs: Job[];
  sessions: Session[];
  invoices: Invoice[];
  projects: Project[];
}

export const generateDemo = (today: string, seed = 42): DemoData => {
  const rnd = mulberry32(seed);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  const gauss = () => {
    let u = 0;
    let v = 0;
    while (u === 0) u = rnd();
    while (v === 0) v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  let n = 0;
  const id = (p: string) => `demo-${p}-${(++n).toString(36)}`;
  const ts = (d: string) => new Date(d + 'T10:00:00').getTime();

  const clients: Client[] = SPECS.map((s) => ({ ...s.c, id: id('c'), createdAt: ts(s.from), updatedAt: ts(s.from), demo: true }));
  const jobs: Job[] = [];
  const sessions: Session[] = [];

  const start = '2022-01-03';
  const horizon = addDays(today, 10);
  let day = start;
  while (day <= horizon) {
    const monthsIn = diffDays(start, day) / 30;
    const perWeek = 1.1 + Math.min(1.9, monthsIn * 0.04); // the practice grows
    const count = Math.max(0, Math.round(perWeek + gauss() * 0.8));
    for (let k = 0; k < count; k++) {
      const eligible = SPECS.map((s, i) => ({ s, i })).filter(({ s }) => day >= s.from && (!s.to || day <= s.to));
      const totalW = eligible.reduce((a, e) => a + e.s.weight, 0);
      let r = rnd() * totalW;
      const chosen = eligible.find((e) => (r -= e.s.weight) <= 0) ?? eligible[0];
      const spec = chosen.s;
      const client = clients[chosen.i];

      const received = nextWorkday(addDays(day, Math.floor(rnd() * 5)));
      const qtyRaw = Math.exp(Math.log(spec.words[0]) + gauss() * spec.words[1]);
      const unit = spec.unit;
      let quantity =
        unit === 'hour' ? Math.max(2, Math.round(qtyRaw)) : unit === 'minute' ? Math.max(8, Math.round(qtyRaw)) : Math.max(120, Math.round(qtyRaw / 10) * 10);
      if (unit === 'flat') quantity = 1;
      const words = unit === 'flat' ? Math.max(300, Math.round(qtyRaw / 10) * 10) : unit === 'minute' ? Math.round(quantity * 110) : undefined;
      const workWords = unit === 'hour' ? 0 : words ?? quantity;
      const years = diffDays(spec.from, received) / 365;
      const perUnit = unit !== 'flat' && unit !== 'hour';
      const rawRate = spec.rate * (1 + spec.rateGrowth * Math.max(0, years)) * (0.94 + rnd() * 0.12);
      const rate = perUnit ? Math.round(rawRate * 1000) / 1000 : Math.round(rawRate);
      const flatRate = unit === 'flat' ? Math.round((rate * (0.7 + (workWords / 1200) * 0.5)) / 500) * 500 : rate;
      const days = unit === 'hour' ? 0 : Math.max(1, Math.ceil(workWords / (spec.domains[0] === 'literary' ? 1100 : unit === 'char' ? 3600 : 2600)) + Math.floor(rnd() * 3));
      const dueAt = unit === 'hour' ? nextWorkday(addDays(received, 7 + Math.floor(rnd() * 14))) : nextWorkday(addDays(received, days + 1));
      const deliveredPlanned = unit === 'hour' ? dueAt : addDays(dueAt, rnd() < 0.85 ? -Math.floor(rnd() * 2) : 0);
      const domain = pick(spec.domains);
      const useCat = spec.c.catGrid && unit === 'word' && rnd() < 0.7;
      const counts = useCat
        ? (() => {
            const total = quantity;
            const reps = Math.round(total * (0.04 + rnd() * 0.08));
            const m100 = Math.round(total * (0.05 + rnd() * 0.1));
            const m95 = Math.round(total * (0.03 + rnd() * 0.05));
            const m85 = Math.round(total * (0.03 + rnd() * 0.05));
            const m75 = Math.round(total * rnd() * 0.04);
            return { repetition: reps, m100, m95, m85, m75, noMatch: total - reps - m100 - m95 - m85 - m75 };
          })()
        : undefined;

      let status: JobStatus;
      let deliveredAt: string | undefined;
      let invoicedAt: string | undefined;
      let paidAt: string | undefined;
      let progress: number | undefined;
      if (received > today) status = 'quote';
      else if (deliveredPlanned > today) {
        status = 'active';
        const span = Math.max(1, diffDays(received, deliveredPlanned));
        progress = Math.min(90, Math.round((diffDays(received, today) / span) * 100 / 10) * 10);
      } else {
        deliveredAt = deliveredPlanned;
        status = 'delivered';
        const inv = addDays(deliveredAt, Math.floor(rnd() * 8));
        if (inv <= today) {
          invoicedAt = inv;
          status = 'invoiced';
          const slow = (client.name === '星河出版社' || client.name === '大川精密工業' ? 20 : 0) + (rnd() < 0.07 ? 30 + Math.floor(rnd() * 45) : 0);
          const pay = addDays(inv, (spec.c.paymentTermsDays ?? 30) + Math.round(gauss() * 6) + slow - 3);
          if (pay <= today) {
            paidAt = pay;
            status = 'paid';
          }
        }
      }
      if (rnd() < 0.012 && status !== 'quote') status = 'cancelled';

      const fx = fxDrift(spec.fx, received);
      const base: Job = {
        id: id('j'),
        createdAt: ts(received),
        updatedAt: ts(paidAt ?? deliveredAt ?? received),
        demo: true,
        title: pick(spec.titles),
        clientId: client.id,
        service: spec.service,
        sourceLang: spec.pair[0],
        targetLang: spec.pair[1],
        domain,
        tags: [],
        unit,
        quantity,
        words,
        cat: counts ? { counts, grid: spec.c.catGrid! } : undefined,
        rate: unit === 'flat' ? flatRate : rate,
        currency: spec.c.currency,
        fxToBase: fx,
        status,
        receivedAt: received,
        dueAt: unit === 'hour' ? `${dueAt}T${pick(['09:30', '13:30', '14:00'])}` : dueAt,
        deliveredAt,
        invoicedAt,
        paidAt,
        progress,
        catTool: spec.tool,
        incomeCategory: '9B',
        confidential: spec.c.kind === 'agency' || rnd() < 0.3,
        featured: false,
      };
      if (spec.c.withholds && status !== 'quote') {
        const d = suggestDeductions(jobGross(base), base.currency, client, DEFAULT_SETTINGS.tax);
        base.withholding = d.withholding || undefined;
        base.nhi = d.nhi || undefined;
      }
      if (spec.c.currency !== 'TWD' && status === 'paid') base.fees = Math.round(jobGross(base) * 0.012 * 100) / 100;
      jobs.push(base);

      // timer sessions for most recent work, so hourly-rate insights have data
      if ((status === 'paid' || status === 'invoiced' || status === 'delivered' || status === 'active') && received >= '2024-06-01' && unit !== 'hour' && rnd() < 0.7) {
        const wph = domain === 'literary' ? 380 : domain === 'legal' || domain === 'patent' ? 330 : spec.service === 'transcreation' ? 180 : unit === 'minute' ? 700 : 470;
        let hoursLeft = ((unit === 'char' ? workWords / 1.6 : workWords) * (status === 'active' ? (progress ?? 0) / 100 : 1)) / (wph * (0.85 + rnd() * 0.3));
        let d = received;
        const last = deliveredAt ?? today;
        let guard = 0;
        while (hoursLeft > 0.1 && guard++ < 200) {
          if (weekday(d) !== 0 && (weekday(d) !== 6 || rnd() < 0.3)) {
            const chunk = Math.min(hoursLeft, 1 + rnd() * 2.5);
            const night = rnd() < 0.22;
            const hour = night ? 21 + Math.floor(rnd() * 2) : 9 + Math.floor(rnd() * 8);
            const s = new Date(d + `T${String(hour).padStart(2, '0')}:${String(Math.floor(rnd() * 4) * 15).padStart(2, '0')}:00`).getTime();
            sessions.push({ id: id('s'), jobId: base.id, start: s, end: s + Math.round(chunk * 3_600_000), createdAt: s, updatedAt: s, demo: true });
            hoursLeft -= chunk;
          }
          d = addDays(d, 1);
          if (d > last) d = last;
        }
      }
    }
    day = addDays(day, 7);
  }

  // a realistic “right now”: a few jobs in progress and a couple of open quotes
  const current: { spec: number; title: string; qty: number; dueIn: number; progress: number; status: JobStatus; time?: string }[] = [
    { spec: 0, title: '心臟支架使用說明書 v2.1', qty: 8600, dueIn: 2, progress: 80, status: 'active' },
    { spec: 1, title: 'Fintech app onboarding flow', qty: 3400, dueIn: 4, progress: 45, status: 'active' },
    { spec: 4, title: '手遊 2.5 週年活動劇情', qty: 12000, dueIn: 9, progress: 30, status: 'active' },
    { spec: 6, title: '技術授權契約中譯英', qty: 5200, dueIn: 12, progress: 10, status: 'active' },
    { spec: 5, title: 'Winter DLC quest text', qty: 7500, dueIn: 14, progress: 0, status: 'quote' },
  ];
  for (const c of current) {
    const spec = SPECS[c.spec];
    const client = clients[c.spec];
    const due = nextWorkday(addDays(today, c.dueIn));
    const unit = spec.unit;
    const rate = Math.round(spec.rate * (1 + spec.rateGrowth * Math.max(0, diffDays(spec.from, today) / 365)) * 1000) / 1000;
    const j: Job = {
      id: id('j'),
      createdAt: ts(addDays(today, -3)),
      updatedAt: ts(today),
      demo: true,
      title: c.title,
      clientId: client.id,
      service: spec.service,
      sourceLang: spec.pair[0],
      targetLang: spec.pair[1],
      domain: spec.domains[0],
      tags: [],
      unit,
      quantity: c.qty,
      rate,
      currency: spec.c.currency,
      fxToBase: fxDrift(spec.fx, today),
      status: c.status,
      receivedAt: c.status === 'quote' ? today : addDays(today, -Math.max(2, Math.round(c.qty / 2500))),
      dueAt: due,
      progress: c.progress,
      // part of today's work is already done, so the Today plan starts mid-day
      dayStart: c.progress >= 10 ? { date: today, progress: c.progress - 10 } : undefined,
      catTool: spec.tool,
      incomeCategory: '9B',
      confidential: spec.c.kind === 'agency',
    };
    if (spec.c.withholds) {
      const d = suggestDeductions(jobGross(j), j.currency, client, DEFAULT_SETTINGS.tax);
      j.withholding = d.withholding || undefined;
      j.nhi = d.nhi || undefined;
    }
    jobs.push(j);
    if (c.progress > 0) {
      const hours = ((unit === 'char' ? c.qty / 1.6 : c.qty) * (c.progress / 100)) / 470;
      let left = hours;
      let d = j.receivedAt!;
      while (left > 0.1 && d <= today) {
        const chunk = Math.min(left, 2.5);
        const s = new Date(d + 'T10:00:00').getTime();
        sessions.push({ id: id('s'), jobId: j.id, start: s, end: s + Math.round(chunk * 3_600_000), createdAt: s, updatedAt: s, demo: true });
        left -= chunk;
        d = addDays(d, 1);
      }
    }
  }

  // feature a handful of the most impressive jobs for the résumé, with public-safe titles
  const PUBLIC: Record<string, string> = {
    medical: '國際醫療器材大廠 產品使用手冊',
    pharma: '跨國藥廠 臨床試驗文件',
    legal: '跨國併購案 契約文件',
    patent: '半導體與電池技術專利說明書',
    games: '日系手機遊戲 主線劇情在地化',
    media: '國際影展紀錄片 字幕翻譯',
    software: '全球 SaaS 平台 產品介面與說明中心',
    marketing: '國際品牌 年度行銷活動',
    tech: '雲端服務商 技術白皮書',
    engineering: '精密機械製造商 產品型錄與手冊',
    fashion: '保養品牌 官網與社群文案',
  };
  const byWords = [...jobs].filter((j) => j.status === 'paid').sort((a, b) => (b.words ?? b.quantity) - (a.words ?? a.quantity));
  const seen = new Set<string>();
  for (const j of byWords) {
    if (seen.size >= 6) break;
    if (seen.has(j.clientId!)) continue;
    seen.add(j.clientId!);
    j.featured = true;
    const kind = clients.find((c) => c.id === j.clientId)?.kind;
    if (kind === 'publisher') j.confidential = false;
    else {
      j.confidential = true;
      j.publicTitle = PUBLIC[j.domain ?? ''] ?? undefined;
    }
  }

  // monthly invoices for USD agencies
  const invoices: Invoice[] = [];
  let seq = 1;
  for (const c of clients.filter((x) => x.currency === 'USD' && x.kind === 'agency')) {
    const byMonth = new Map<string, Job[]>();
    for (const j of jobs) {
      if (j.clientId !== c.id || !j.invoicedAt) continue;
      const k = j.deliveredAt!.slice(0, 7);
      byMonth.set(k, [...(byMonth.get(k) ?? []), j]);
    }
    for (const [month, list] of [...byMonth.entries()].sort()) {
      const issue = addDays(month + '-01', 31).slice(0, 7) + '-01';
      const invId = id('i');
      const allPaid = list.every((j) => j.status === 'paid');
      const number = `INV-${month.replace('-', '')}-${String(seq++).padStart(3, '0')}`;
      invoices.push({
        id: invId,
        number,
        clientId: c.id,
        issueDate: issue > today ? today : issue,
        dueDate: addDays(issue, c.paymentTermsDays ?? 30),
        currency: c.currency,
        jobIds: list.map((j) => j.id),
        lang: 'en',
        status: allPaid ? 'paid' : 'sent',
        paidAt: allPaid ? list.map((j) => j.paidAt!).sort().pop() : undefined,
        createdAt: ts(issue > today ? today : issue),
        updatedAt: ts(issue > today ? today : issue),
        demo: true,
      });
      for (const j of list) j.invoiceId = invId;
    }
  }

  // a big game project in its early days: two parts delivered, one in progress, the rest quoted
  const projects: Project[] = [];
  const pf = clients.find((c) => c.name === 'Pixelforge Games');
  if (pf) {
    const pid = id('p');
    const fx = fxDrift(32, today);
    const part = (kind: string, title: string, o: Partial<Job>): Job => ({
      id: id('j'),
      createdAt: ts(addDays(today, -14)),
      updatedAt: ts(today),
      demo: true,
      title: `《星墜紀元》｜${title}`,
      clientId: pf.id,
      projectId: pid,
      part: kind,
      service: 'translation',
      sourceLang: 'en',
      targetLang: 'zh-TW',
      domain: 'games',
      tags: [],
      unit: 'word',
      quantity: 0,
      rate: 0.105,
      currency: 'USD',
      fxToBase: fx,
      status: 'quote',
      receivedAt: addDays(today, -14),
      catTool: 'Crowdin',
      incomeCategory: '9B',
      ...o,
    });
    const parts = [
      part('trailer', '預告片字幕', { service: 'subtitling', unit: 'minute', quantity: 3, rate: 18, status: 'delivered', dueAt: addDays(today, -6), deliveredAt: addDays(today, -7), progress: 100 }),
      part('ui', '介面文字', { quantity: 4800, status: 'delivered', dueAt: addDays(today, -2), deliveredAt: addDays(today, -3), progress: 100 }),
      part('cutscene', '過場動畫', { service: 'subtitling', quantity: 6500, status: 'active', receivedAt: addDays(today, -4), dueAt: nextWorkday(addDays(today, 15)), progress: 30, dayStart: { date: today, progress: 22 } }),
      part('dialogue', '劇情對話', { quantity: 38000, dueAt: nextWorkday(addDays(today, 34)), receivedAt: today }),
      part('items', '道具與技能說明', { quantity: 9200, dueAt: nextWorkday(addDays(today, 26)), receivedAt: today }),
      part('store', '商店頁與行銷文案', { service: 'transcreation', quantity: 1400, rate: 0.14, dueAt: nextWorkday(addDays(today, 20)), receivedAt: today }),
      part('lqa', '語言測試 LQA', { service: 'lqa', unit: 'hour', quantity: 16, rate: 35, dueAt: nextWorkday(addDays(today, 38)), receivedAt: today }),
    ];
    jobs.push(...parts);
    const [trailer, ui, cutscene, dialogue] = parts;
    const at = (d: number) => ts(addDays(today, d));
    projects.push({
      id: pid,
      createdAt: at(-14),
      updatedAt: at(0),
      demo: true,
      name: '《星墜紀元》',
      clientId: pf.id,
      kind: 'game',
      sourceLang: 'en',
      targetLang: 'zh-TW',
      dueAt: nextWorkday(addDays(today, 40)),
      notes: '窗口：Maya（製作人）。每週五寄進度回報。\n字幕每行上限 16 個全形字，雙行為限。\n角色名以術語表為準，未列入者先保留英文並提問。',
      publicTitle: '北美獨立遊戲 奇幻 RPG 在地化',
      confidential: true,
      links: [
        { id: id('l'), label: '術語表 Glossary', url: 'https://example.com/starfall/glossary' },
        { id: id('l'), label: '風格指南 Style guide', url: 'https://example.com/starfall/style-guide' },
        { id: id('l'), label: '角色設定集 Character bible', url: 'https://example.com/starfall/characters' },
      ],
      queries: [
        { id: id('q'), text: '角色名「Aria」要保留英文，還是音譯為「艾莉亞」？', jobId: cutscene.id, ref: 'CS_014 00:02:31', status: 'open', createdAt: at(-1) },
        { id: id('q'), text: '商人 NPC 的口吻要偏古風還是現代口語？有沒有角色語氣的參考？', jobId: dialogue.id, ref: 'NPC_Merchant_*', status: 'open', createdAt: at(0) },
        { id: id('q'), text: '「Respec」要譯為「重置天賦」還是「洗點」？這個按鈕的字數上限是多少？', jobId: ui.id, ref: 'UI_MENU_OPT_07', status: 'sent', createdAt: at(-5) },
        { id: id('q'), text: '預告片最後的標語要保留英文嗎？', jobId: trailer.id, ref: '00:00:48', status: 'answered', answer: '保留英文標語，下方加中文字幕。', createdAt: at(-9), answeredAt: at(-8) },
        { id: id('q'), text: '術語表會用共用試算表更新嗎？', status: 'answered', answer: '會，已共享到你的信箱，每週一更新。', createdAt: at(-13), answeredAt: at(-12) },
      ],
    });
  }

  return { clients, jobs, sessions, invoices, projects };
};

export const DEMO_PROFILE = {
  name: '林予安',
  nameEn: 'Yu-An Lin',
  title: '英日譯中｜醫療・軟體・遊戲',
  email: 'yuan.lin@example.com',
  website: 'yuanlin.example.com',
  address: '台北市大安區（示範資料）',
  bank: '範例銀行 012 帳號 000-000-0000（示範）',
  since: 2021,
};

