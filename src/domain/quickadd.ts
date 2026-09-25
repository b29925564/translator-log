// “One sentence” job entry. Turns text like
//   「藍海翻譯社 醫療器材說明書 英翻中 12,500字 每字0.9 10/20交」
//   "Acme EN>ZH-TW marketing 3.2k words @ $0.08/word due fri"
// into structured job fields, locally and instantly.

import { addDays, endOfMonth, parseISO, toISODate } from './dates';
import type { JobStatus, ServiceType, Unit } from './types';

export type TokenKind = 'client' | 'pair' | 'qty' | 'rate' | 'fee' | 'due' | 'domain' | 'service' | 'status' | 'tool' | 'po';

export interface QuickToken {
  kind: TokenKind;
  start: number;
  end: number;
}

export interface QuickParse {
  title: string;
  clientId?: string;
  newClientName?: string;
  sourceLang?: string;
  targetLang?: string;
  unit?: Unit;
  quantity?: number;
  rate?: number;
  currency?: string;
  flatFee?: number;
  dueAt?: string;
  domain?: string;
  service?: ServiceType;
  status?: JobStatus;
  catTool?: string;
  poNumber?: string;
  tokens: QuickToken[];
}

export interface QuickContext {
  clients: { id: string; name: string; currency?: string }[];
  today: string;
  baseCurrency: string;
  defaultTargetLang: string;
}

// ---------- vocab ----------

const CODE_MAP: Record<string, string> = {
  en: 'en', eng: 'en', zh: 'zh', chi: 'zh', 'zh-tw': 'zh-TW', 'zh-hant': 'zh-TW', tc: 'zh-TW', cht: 'zh-TW', tw: 'zh-TW',
  'zh-cn': 'zh-CN', 'zh-hans': 'zh-CN', sc: 'zh-CN', chs: 'zh-CN', cn: 'zh-CN', 'zh-hk': 'zh-HK', hk: 'zh-HK',
  ja: 'ja', jp: 'ja', jpn: 'ja', ko: 'ko', kr: 'ko', kor: 'ko', fr: 'fr', de: 'de', ger: 'de', es: 'es', spa: 'es', it: 'it',
  pt: 'pt', ru: 'ru', vi: 'vi', vn: 'vi', th: 'th', id: 'id', ms: 'ms', ar: 'ar', nl: 'nl', tr: 'tr', pl: 'pl', sv: 'sv', hi: 'hi',
};

/** Two-letter codes that are languages, not regions (so en-ja is a pair but zh-tw is a locale). */
const LANG_ONLY = new Set(['en', 'zh', 'ja', 'ko', 'fr', 'de', 'es', 'it', 'pt', 'ru', 'vi', 'th', 'id', 'ms', 'ar', 'nl', 'tr', 'pl', 'sv', 'hi']);

const ZH_LANG: [string, string][] = [
  ['繁中', 'zh-TW'], ['繁體', 'zh-TW'], ['簡中', 'zh-CN'], ['簡體', 'zh-CN'], ['印尼', 'id'], ['馬來', 'ms'], ['阿拉伯', 'ar'], ['土耳其', 'tr'],
  ['英', 'en'], ['中', 'zh'], ['日', 'ja'], ['韓', 'ko'], ['法', 'fr'], ['德', 'de'], ['西', 'es'], ['義', 'it'], ['葡', 'pt'],
  ['俄', 'ru'], ['越', 'vi'], ['泰', 'th'], ['荷', 'nl'], ['繁', 'zh-TW'], ['簡', 'zh-CN'], ['粵', 'zh-HK'],
];
const ZH_LANG_ALT = ZH_LANG.map(([k]) => k).join('|');

const DOMAIN_KEYWORDS: [string, RegExp][] = [
  ['medical', /(醫療|醫學|醫材|醫院|醫師|病歷|病人|病患|手術|支架|心臟|血糖|輸液|診斷|medical|medic|IFU|device|healthcare|surgical|patient)/i],
  ['pharma', /(製藥|藥品|藥廠|臨床試驗|臨床|生技|pharma|clinical|biotech|protocol|ICF)/i],
  ['patent', /(專利|patent)/i],
  ['legal', /(法律|法務|合約|契約|判決|訴訟|legal|contract|agreement|NDA|court)/i],
  ['finance', /(財經|金融|財報|年報|投資|銀行|保險|finance|financial|annual report|banking|insurance|ESG)/i],
  ['games', /(遊戲|手遊|game|gaming|RPG)/i],
  ['software', /(軟體|UI字串|字串|app在地化|在地化|software|string|UI\b|localization|l10n)/i],
  ['tech', /(科技|半導體|資訊|IT\b|tech|semiconductor|cloud|SaaS|AI\b)/i],
  ['marketing', /(行銷|廣告|文案|品牌|新聞稿|marketing|advert|brand|press release|campaign|copy)/i],
  ['media', /(字幕|影片|影視|紀錄片|電影|影集|subtitle|video|film|drama|documentary|srt)/i],
  ['literary', /(小說|書籍|出版|文學|繪本|童書|novel|book|fiction|literary|manuscript)/i],
  ['academic', /(論文|學術|期刊|摘要|academic|paper|thesis|journal|abstract)/i],
  ['engineering', /(工程|機械|手冊|規格書|製造|engineering|manual|spec|machinery|automotive|汽車)/i],
  ['energy', /(能源|環境|環保|綠能|energy|environment|solar|wind)/i],
  ['government', /(政府|公文|標案|government|public sector|tender)/i],
  ['tourism', /(觀光|旅遊|飯店|餐廳|菜單|tourism|travel|hotel|menu)/i],
  ['fashion', /(時尚|美妝|保養|化妝品|fashion|beauty|cosmetic)/i],
  ['ecommerce', /(電商|商品|購物|e-?commerce|product listing|retail)/i],
];

const SERVICE_KEYWORDS: [ServiceType, RegExp][] = [
  ['mtpe', /(MTPE|譯後編輯|後編輯|機翻潤稿|post-?edit)/i],
  ['review', /(審稿|審校|潤稿|review|editing|edit\b)/i],
  ['proofreading', /(校對|校稿|proofread)/i],
  ['subtitling', /(字幕|subtitl|srt\b)/i],
  ['interpreting', /(口譯|同步|逐步|interpret)/i],
  ['transcription', /(聽打|逐字稿|聽寫|transcri)/i],
  ['transcreation', /(創譯|transcreat)/i],
  ['lqa', /(LQA|語言測試|在地化測試)/i],
];

const STATUS_KEYWORDS: [JobStatus, RegExp][] = [
  ['paid', /(已收款|已付款|已入帳|已付|paid)/i],
  ['invoiced', /(已請款|已開發票|invoiced)/i],
  ['delivered', /(已交稿|已交件|已交|交稿了|delivered|done)/i],
  ['quote', /(詢價|報價|估價|quote|inquiry)/i],
];

const TOOLS: [string, RegExp][] = [
  ['Trados Studio', /\b(trados|sdl studio)\b/i],
  ['memoQ', /\bmemoq\b/i],
  ['Phrase', /\b(phrase|memsource)\b/i],
  ['Smartcat', /\bsmartcat\b/i],
  ['XTM', /\bxtm\b/i],
  ['Crowdin', /\bcrowdin\b/i],
  ['Wordfast', /\bwordfast\b/i],
  ['Matecat', /\bmatecat\b/i],
];

const CURRENCY_TOKENS = 'NT\\$|US\\$|HK\\$|S\\$|A\\$|C\\$|CN¥|\\$|€|£|¥|₩|USD|TWD|NTD|EUR|GBP|JPY|CNY|RMB|HKD|KRW|SGD|AUD|CAD|CHF|MYR|美金|美元|台幣|新台幣|日圓|日幣|円|歐元|英鎊|人民幣|港幣|韓元|新幣|元|塊';
const CUR = `(?:${CURRENCY_TOKENS})`;
const UNIT_TOKENS = '中文字|字元|單字|字|words?|wds?|w(?![a-z])|chars?|characters?|小時|時|hours?|hrs?|h(?![a-z])|頁|pages?|分鐘|mins?|minutes?';

const currencyCode = (tok: string | undefined, ctx: QuickContext): string | undefined => {
  if (!tok) return undefined;
  const t = tok.trim().toUpperCase();
  if (['NT$', 'NTD', 'TWD', '台幣', '新台幣'].includes(t)) return 'TWD';
  if (['US$', 'USD', '美金', '美元', 'CENT', 'CENTS'].includes(t)) return 'USD';
  if (['€', 'EUR', '歐元'].includes(t)) return 'EUR';
  if (['£', 'GBP', '英鎊'].includes(t)) return 'GBP';
  if (['¥', 'JPY', '日圓', '日幣', '円'].includes(t)) return 'JPY';
  if (['CN¥', 'CNY', 'RMB', '人民幣'].includes(t)) return 'CNY';
  if (['HK$', 'HKD', '港幣'].includes(t)) return 'HKD';
  if (['₩', 'KRW', '韓元'].includes(t)) return 'KRW';
  if (['S$', 'SGD', '新幣'].includes(t)) return 'SGD';
  if (['A$', 'AUD'].includes(t)) return 'AUD';
  if (['C$', 'CAD'].includes(t)) return 'CAD';
  if (t === 'CHF') return 'CHF';
  if (t === 'MYR') return 'MYR';
  if (t === '元' || t === '塊') return ctx.baseCurrency;
  if (t === '$') return '$';
  return undefined;
};

const unitFromToken = (tok: string): Unit | 'wordish' => {
  const t = tok.toLowerCase();
  if (/^(中文字|字元|chars?|characters?)$/.test(t)) return 'char';
  if (/^(字|單字)$/.test(t)) return 'wordish';
  if (/^(words?|wds?|w)$/.test(t)) return 'word';
  if (/^(小時|時|hours?|hrs?|h)$/.test(t)) return 'hour';
  if (/^(頁|pages?)$/.test(t)) return 'page';
  if (/^(分鐘|mins?|minutes?)$/.test(t)) return 'minute';
  return 'word';
};

const num = (s: string) => Number(s.replace(/,/g, ''));
const multiplier = (m?: string) => (!m ? 1 : m === '萬' ? 10000 : 1000);

const isCJKLang = (code?: string) => !!code && /^(zh|ja|ko)/.test(code);

// ---------- dates ----------

const WEEKDAY_ZH: Record<string, number> = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
const WEEKDAY_EN: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const MONTH_EN: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** Picks the year that puts month/day closest to today. */
const nearestDate = (month: number, day: number, today: string): string | undefined => {
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const y = Number(today.slice(0, 4));
  const t = parseISO(today).getTime();
  let best: string | undefined;
  let bestDist = Infinity;
  for (const yy of [y - 1, y, y + 1]) {
    const d = new Date(yy, month - 1, day);
    if (d.getMonth() !== month - 1) continue;
    const dist = Math.abs(d.getTime() - t);
    if (dist < bestDist) {
      bestDist = dist;
      best = toISODate(d);
    }
  }
  return best;
};

const nextWeekday = (today: string, wd: number, forceNextWeek: boolean): string => {
  const cur = parseISO(today).getDay();
  let delta = (wd - cur + 7) % 7;
  if (forceNextWeek) {
    // “下週五”: the Friday of next calendar week (weeks start on Monday)
    const toNextMonday = ((8 - cur) % 7) || 7;
    delta = toNextMonday + ((wd + 6) % 7);
  } else if (delta === 0) delta = 7;
  return addDays(today, delta);
};

// ---------- parser ----------

export const parseQuickAdd = (input: string, ctx: QuickContext): QuickParse => {
  let w = input;
  const tokens: QuickToken[] = [];
  const out: QuickParse = { title: '', tokens };

  const take = (kind: TokenKind, start: number, end: number) => {
    // regexes may swallow whitespace (including already-masked tokens) at the edges
    while (end > start && /\s/.test(w[end - 1])) end--;
    while (start < end && /\s/.test(w[start])) start++;
    tokens.push({ kind, start, end });
    w = w.slice(0, start) + ' '.repeat(end - start) + w.slice(end);
  };
  const find = (re: RegExp) => {
    re.lastIndex = 0;
    return re.exec(w);
  };

  // 1. client — longest existing client name first
  const sorted = [...ctx.clients].filter((c) => c.name.trim().length >= 2).sort((a, b) => b.name.length - a.name.length);
  for (const c of sorted) {
    const idx = w.toLowerCase().indexOf(c.name.toLowerCase());
    if (idx >= 0) {
      out.clientId = c.id;
      take('client', idx, idx + c.name.length);
      break;
    }
  }

  // 2. language pair
  let m = find(/(?<![A-Za-z])([A-Za-z]{2,3}(?:-[A-Za-z]{2,4})?)\s*(?:>|→|->|=>|›|»|⇒|\bto\b|2)\s*([A-Za-z]{2,3}(?:-[A-Za-z]{2,4})?)(?![A-Za-z])/i);
  if (m && CODE_MAP[m[1].toLowerCase()] && CODE_MAP[m[2].toLowerCase()]) {
    out.sourceLang = CODE_MAP[m[1].toLowerCase()];
    out.targetLang = CODE_MAP[m[2].toLowerCase()];
    take('pair', m.index, m.index + m[0].length);
  } else if (
    (m = find(/(?<![A-Za-z-])([a-z]{2})[-_]([a-z]{2})(?![A-Za-z-])/i)) &&
    !CODE_MAP[`${m[1]}-${m[2]}`.toLowerCase()] &&
    LANG_ONLY.has(m[1].toLowerCase()) &&
    LANG_ONLY.has(m[2].toLowerCase())
  ) {
    out.sourceLang = CODE_MAP[m[1].toLowerCase()];
    out.targetLang = CODE_MAP[m[2].toLowerCase()];
    take('pair', m.index, m.index + m[0].length);
  } else {
    m = find(new RegExp(`(${ZH_LANG_ALT})(?:文|語)?\\s*(?:翻譯成|翻成|譯成|翻|譯|轉|→|>|到)\\s*(${ZH_LANG_ALT})(?:文|語)?`));
    if (m) {
      out.sourceLang = ZH_LANG.find(([k]) => k === m![1])![1];
      out.targetLang = ZH_LANG.find(([k]) => k === m![2])![1];
      take('pair', m.index, m.index + m[0].length);
    } else {
      m = find(new RegExp(`(${ZH_LANG_ALT})(${ZH_LANG_ALT})(?=翻譯|筆譯|口譯|譯)`));
      if (m && m[1] !== m[2]) {
        out.sourceLang = ZH_LANG.find(([k]) => k === m![1])![1];
        out.targetLang = ZH_LANG.find(([k]) => k === m![2])![1];
        take('pair', m.index, m.index + m[0].length);
      }
    }
  }
  const zhVariant = ctx.defaultTargetLang.startsWith('zh') ? ctx.defaultTargetLang : 'zh-TW';
  if (out.sourceLang === 'zh') out.sourceLang = zhVariant;
  if (out.targetLang === 'zh') out.targetLang = zhVariant;

  // 3. PO number
  m = find(/\bPO\s*[#:：]?\s*([A-Z0-9][A-Z0-9-]{2,})/i);
  if (m) {
    out.poNumber = m[1];
    take('po', m.index, m.index + m[0].length);
  }

  // 4. dates (ISO, M/D, M月D日, relative, weekday, English month)
  let date: string | undefined;
  const dateRes: [RegExp, (mm: RegExpExecArray) => string | undefined][] = [
    [/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/, (x) => toISODate(new Date(+x[1], +x[2] - 1, +x[3]))],
    [/(?<![\d.])(\d{1,2})月(\d{1,2})[日號]?/, (x) => nearestDate(+x[1], +x[2], ctx.today)],
    [/(?<![\d.,$])(\d{1,2})\/(\d{1,2})(?![\d/])/, (x) => nearestDate(+x[1], +x[2], ctx.today)],
    [/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i, (x) => nearestDate(MONTH_EN[x[1].toLowerCase()], +x[2], ctx.today)],
    [/大後天/, () => addDays(ctx.today, 3)],
    [/後天/, () => addDays(ctx.today, 2)],
    [/(明天|明日|\btomorrow\b)/i, () => addDays(ctx.today, 1)],
    [/(今天|今日|今晚|\btoday\b|\btonight\b)/i, () => ctx.today],
    [/(\d{1,2})\s*天(?:後|内|內)/, (x) => addDays(ctx.today, +x[1])],
    [/\bin\s+(\d{1,2})\s+days?\b/i, (x) => addDays(ctx.today, +x[1])],
    [/(下下?)(?:週|周|禮拜|星期)([一二三四五六日天])/, (x) => nextWeekday(ctx.today, WEEKDAY_ZH[x[2]], true)],
    [/(?:週|周|禮拜|星期)([一二三四五六日天])/, (x) => nextWeekday(ctx.today, WEEKDAY_ZH[x[1]], false)],
    [/\bnext\s+(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/i, (x) => nextWeekday(ctx.today, WEEKDAY_EN[x[1].toLowerCase()], true)],
    [/\b(sun|mon|tue|wed|thu|fri|sat)(?:day|nesday|urday|sday|rsday)?\b/i, (x) => nextWeekday(ctx.today, WEEKDAY_EN[x[1].toLowerCase()], false)],
    [/(月底|\bend of (?:the )?month\b)/i, () => endOfMonth(ctx.today)],
  ];
  for (const [re, fn] of dateRes) {
    const mm = find(re);
    if (mm) {
      date = fn(mm);
      if (date) {
        take('due', mm.index, mm.index + mm[0].length);
        break;
      }
    }
  }
  // time of day
  let time: string | undefined;
  m = find(/(上午|早上|中午|下午|晚上|傍晚)?\s*(\d{1,2})\s*(?:[:：](\d{2})|點(?:(\d{1,2})分?|(半))?)(?!\s*(?:字|元|%))/);
  const m2 = !m ? find(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i) : null;
  if (m && (m[1] || m[0].includes('點') || m[3])) {
    let h = +m[2];
    const min = m[3] ? +m[3] : m[4] ? +m[4] : m[5] ? 30 : 0;
    if (m[1] && /下午|晚上|傍晚/.test(m[1]) && h < 12) h += 12;
    if (h <= 23 && min <= 59) {
      time = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
      take('due', m.index, m.index + m[0].length);
    }
  } else if (m2) {
    let h = +m2[1];
    if (m2[3].toLowerCase() === 'pm' && h < 12) h += 12;
    if (m2[3].toLowerCase() === 'am' && h === 12) h = 0;
    time = `${String(h).padStart(2, '0')}:${m2[2] || '00'}`;
    take('due', m2.index, m2.index + m2[0].length);
  }
  if (time && !date) date = ctx.today;
  if (date) out.dueAt = time ? `${date}T${time}` : date;
  // swallow “交 / 截稿 / 截止 / due / deadline” next to a date
  m = find(/(前交|前截稿|交稿|交件|截稿|截止|到期|deadline|due\s*(?:by|on)?|交|前)/i);
  if (m && out.dueAt) take('due', m.index, m.index + m[0].length);

  // 5. rate: “每字0.9元”, “0.9元/字”, “$0.08/word”, “@0.08”, “單價 0.9”, “8 cents/word”
  let rateUnit: Unit | 'wordish' | undefined;
  let rawCur: string | undefined;
  const rateRes: RegExp[] = [
    new RegExp(`每(?:個|一)?(${UNIT_TOKENS})\\s*(${CUR})?\\s*(\\d+(?:\\.\\d+)?)\\s*(${CUR})?`, 'i'),
    new RegExp(`@?\\s*(${CUR})?\\s*(\\d+(?:\\.\\d+)?)\\s*(${CUR}|cents?)?\\s*(?:/|每|per\\s*|一)\\s*(${UNIT_TOKENS})`, 'i'),
  ];
  m = find(rateRes[0]);
  if (m) {
    rateUnit = unitFromToken(m[1]);
    out.rate = Number(m[3]);
    rawCur = m[2] || m[4];
    take('rate', m.index, m.index + m[0].length);
  } else {
    m = find(rateRes[1]);
    if (m) {
      rateUnit = unitFromToken(m[4]);
      out.rate = Number(m[2]);
      rawCur = m[1] || m[3];
      if (m[3] && /cent/i.test(m[3])) {
        out.rate = out.rate / 100;
        rawCur = 'USD';
      }
      take('rate', m.index, m.index + m[0].length);
    } else {
      m = find(new RegExp(`(?:@|(?:單價|費率|字價|rate)\\s*[:：]?)\\s*(${CUR})?\\s*(\\d+(?:\\.\\d+)?)\\s*(${CUR})?`, 'i'));
      if (m) {
        out.rate = Number(m[2]);
        rawCur = m[1] || m[3];
        take('rate', m.index, m.index + m[0].length);
      }
    }
  }

  // 6. quantity: “12,500字”, “1.2萬字”, “3k words”, “5小時”
  m = find(new RegExp(`(?<![\\d.])(\\d[\\d,]*(?:\\.\\d+)?)\\s*(萬|千|k|K)?\\s*(${UNIT_TOKENS})(?![a-z])`, 'i'));
  let qtyUnit: Unit | 'wordish' | undefined;
  if (m) {
    out.quantity = Math.round(num(m[1]) * multiplier(m[2]) * 100) / 100;
    qtyUnit = unitFromToken(m[3]);
    take('qty', m.index, m.index + m[0].length);
  }

  // 7. flat fee / total: “總價 5000”, “共 NT$12,000”, “稿費 1.5萬”, or a bare amount with a currency
  let feeCur: string | undefined;
  m = find(new RegExp(`(?:總價|總額|總計|合計|共|報酬|稿費|酬勞|案費|費用|flat(?:\\s*fee)?|total|fee)\\s*[:：]?\\s*(${CUR})?\\s*(\\d[\\d,]*(?:\\.\\d+)?)\\s*(萬|k|K)?\\s*(${CUR})?`, 'i'));
  if (!m) m = find(new RegExp(`(${CUR})\\s*(\\d[\\d,]*(?:\\.\\d+)?)\\s*(萬|k|K)?()`, 'i'));
  if (!m) m = find(new RegExp(`()(?<![\\d.])(\\d[\\d,]*(?:\\.\\d+)?)\\s*(萬|k|K)?\\s*(${CUR})(?![a-z])`, 'i'));
  if (m) {
    out.flatFee = num(m[2]) * multiplier(m[3]);
    feeCur = m[1] || m[4];
    take('fee', m.index, m.index + m[0].length);
  }

  // 8. service, domain, status, tool
  for (const [id, re] of SERVICE_KEYWORDS) {
    const mm = find(re);
    if (mm) {
      out.service = id;
      tokens.push({ kind: 'service', start: mm.index, end: mm.index + mm[0].length });
      break;
    }
  }
  for (const [id, re] of STATUS_KEYWORDS) {
    const mm = find(re);
    if (mm) {
      out.status = id;
      take('status', mm.index, mm.index + mm[0].length);
      break;
    }
  }
  for (const [name, re] of TOOLS) {
    const mm = find(re);
    if (mm) {
      out.catTool = name;
      take('tool', mm.index, mm.index + mm[0].length);
      break;
    }
  }
  for (const [id, re] of DOMAIN_KEYWORDS) {
    const mm = find(re);
    if (mm) {
      out.domain = id;
      // domain words usually belong in the title too, so they are highlighted but not removed
      tokens.push({ kind: 'domain', start: mm.index, end: mm.index + mm[0].length });
      break;
    }
  }

  // ---------- resolve units & currency ----------
  const resolveWordish = (u: Unit | 'wordish' | undefined): Unit | undefined =>
    u === 'wordish' ? (isCJKLang(out.sourceLang) ? 'char' : 'word') : u;
  out.unit = resolveWordish(qtyUnit) ?? resolveWordish(rateUnit);
  if (out.unit === 'word' && rateUnit === 'char') out.unit = 'char';
  if (!out.unit && out.flatFee != null && out.rate == null) out.unit = 'flat';

  // “12,500字 0.9元”: a tiny bare amount next to a word count is a per-word rate.
  if (
    out.flatFee != null &&
    out.rate == null &&
    out.quantity &&
    (out.unit === 'word' || out.unit === 'char') &&
    out.flatFee * 50 < out.quantity
  ) {
    out.rate = out.flatFee;
    out.flatFee = undefined;
    const t = tokens.find((x) => x.kind === 'fee');
    if (t) t.kind = 'rate';
  }

  const clientCur = ctx.clients.find((c) => c.id === out.clientId)?.currency;
  let cur = currencyCode(rawCur, ctx) ?? currencyCode(feeCur, ctx);
  if (cur === '$') {
    const perWord = out.unit === 'word' || out.unit === 'char';
    const r = out.rate ?? 0;
    cur = out.rate != null && ((perWord && r < 0.6) || (!perWord && r < 200)) ? 'USD' : ctx.baseCurrency;
  }
  out.currency = cur ?? clientCur;

  // ---------- client guess & title ----------
  const leftover = w
    .replace(/[，,、；;｜|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  let title = leftover;
  if (!out.clientId) {
    const WORD = "[A-Z][\\p{L}\\p{N}.'’-]*";
    const NOT_NAMES = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December|Today|Tomorrow|Next)\b/;
    let found: { name: string; start: number; end: number } | undefined;
    // 1. an organisation suffix: 藍海翻譯社, Lumina Localization, Atlas Patent Partners
    const cm = new RegExp(
      `([\\p{L}\\p{N}&.\\-]+(?:公司|翻譯社|出版社|出版|集團|工作室|事務所|語言|翻譯|翻訳|株式会社|有限公司)|${WORD}(?:\\s+(?:&|and|\\+|${WORD}))*\\s+(?:Inc\\.?|Ltd\\.?|LLC|LLP|PLC|Corp\\.?|Co\\.|GmbH|AG|Limited|Company|Localization|Localisation|Translations?|Language Services|Studios?|Games|Publishing|Media|Partners|Group|Agency|Labs?|Press|Books|Consulting|Solutions|Communications|International|Technologies|Software|Pharmaceuticals?|Legal|Law|Entertainment|Interactive|Films?|Pictures|Productions?))`,
      'u',
    ).exec(title);
    if (cm) found = { name: cm[1], start: cm.index, end: cm.index + cm[0].length };
    // 2. an explicit marker: “for Harbor & Quill”, “from Acme”, “客戶：光譜行銷”
    if (!found) {
      const m = new RegExp(`(?:^|\\s)(?:for|from|via|client:?)\\s+(${WORD}(?:\\s+(?:&|and|\\+|${WORD}))*)`, 'u').exec(title) ?? /(?:客戶|業主)[:：]\s*([^\s]+)/u.exec(title);
      if (m && !NOT_NAMES.test(m[1])) found = { name: m[1], start: m.index, end: m.index + m[0].length };
    }
    // 3. a leading name joined by “&”: Harbor & Quill clinical protocol
    if (!found) {
      const m = new RegExp(`^(${WORD}(?:\\s+${WORD})*\\s+(?:&|and|\\+)\\s+${WORD}(?:\\s+${WORD})*)(?=\\s+[a-z\\p{Script=Han}])`, 'u').exec(title);
      if (m) found = { name: m[1], start: 0, end: m[0].length };
    }
    if (found) {
      out.newClientName = found.name.trim();
      const i = input.indexOf(out.newClientName);
      if (i >= 0) tokens.push({ kind: 'client', start: i, end: i + out.newClientName.length });
      title = (title.slice(0, found.start) + ' ' + title.slice(found.end)).replace(/\s+/g, ' ').trim();
    }
  }
  title = title.replace(/^(的|幫|for)\s+/i, '').replace(/\s+的$/, '').trim();
  out.title = title;
  tokens.sort((a, b) => a.start - b.start);
  return out;
};
