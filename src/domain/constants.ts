import type { CatBand, CatGrid, ClientKind, JobStatus, ServiceType, Settings, Unit } from './types';

export interface LangInfo {
  code: string;
  short: string;
  zh: string;
  en: string;
}

export const LANGUAGES: LangInfo[] = [
  { code: 'en', short: 'EN', zh: '英文', en: 'English' },
  { code: 'zh-TW', short: 'ZH-TW', zh: '繁體中文', en: 'Chinese (Traditional)' },
  { code: 'zh-CN', short: 'ZH-CN', zh: '簡體中文', en: 'Chinese (Simplified)' },
  { code: 'zh-HK', short: 'ZH-HK', zh: '香港中文', en: 'Chinese (Hong Kong)' },
  { code: 'ja', short: 'JA', zh: '日文', en: 'Japanese' },
  { code: 'ko', short: 'KO', zh: '韓文', en: 'Korean' },
  { code: 'fr', short: 'FR', zh: '法文', en: 'French' },
  { code: 'de', short: 'DE', zh: '德文', en: 'German' },
  { code: 'es', short: 'ES', zh: '西班牙文', en: 'Spanish' },
  { code: 'it', short: 'IT', zh: '義大利文', en: 'Italian' },
  { code: 'pt', short: 'PT', zh: '葡萄牙文', en: 'Portuguese' },
  { code: 'ru', short: 'RU', zh: '俄文', en: 'Russian' },
  { code: 'vi', short: 'VI', zh: '越南文', en: 'Vietnamese' },
  { code: 'th', short: 'TH', zh: '泰文', en: 'Thai' },
  { code: 'id', short: 'ID', zh: '印尼文', en: 'Indonesian' },
  { code: 'ms', short: 'MS', zh: '馬來文', en: 'Malay' },
  { code: 'ar', short: 'AR', zh: '阿拉伯文', en: 'Arabic' },
  { code: 'nl', short: 'NL', zh: '荷蘭文', en: 'Dutch' },
  { code: 'tr', short: 'TR', zh: '土耳其文', en: 'Turkish' },
  { code: 'pl', short: 'PL', zh: '波蘭文', en: 'Polish' },
  { code: 'sv', short: 'SV', zh: '瑞典文', en: 'Swedish' },
  { code: 'hi', short: 'HI', zh: '印地文', en: 'Hindi' },
];

export const langInfo = (code: string): LangInfo =>
  LANGUAGES.find((l) => l.code === code) ?? { code, short: code.toUpperCase(), zh: code, en: code };

export interface CurrencyInfo {
  code: string;
  symbol: string;
  decimals: number;
  zh: string;
  en: string;
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'TWD', symbol: 'NT$', decimals: 0, zh: '新台幣', en: 'Taiwan Dollar' },
  { code: 'USD', symbol: 'US$', decimals: 2, zh: '美元', en: 'US Dollar' },
  { code: 'EUR', symbol: '€', decimals: 2, zh: '歐元', en: 'Euro' },
  { code: 'JPY', symbol: '¥', decimals: 0, zh: '日圓', en: 'Japanese Yen' },
  { code: 'CNY', symbol: 'CN¥', decimals: 2, zh: '人民幣', en: 'Chinese Yuan' },
  { code: 'GBP', symbol: '£', decimals: 2, zh: '英鎊', en: 'British Pound' },
  { code: 'HKD', symbol: 'HK$', decimals: 2, zh: '港幣', en: 'Hong Kong Dollar' },
  { code: 'KRW', symbol: '₩', decimals: 0, zh: '韓元', en: 'Korean Won' },
  { code: 'SGD', symbol: 'S$', decimals: 2, zh: '新加坡幣', en: 'Singapore Dollar' },
  { code: 'AUD', symbol: 'A$', decimals: 2, zh: '澳幣', en: 'Australian Dollar' },
  { code: 'CAD', symbol: 'C$', decimals: 2, zh: '加幣', en: 'Canadian Dollar' },
  { code: 'CHF', symbol: 'CHF ', decimals: 2, zh: '瑞士法郎', en: 'Swiss Franc' },
  { code: 'MYR', symbol: 'RM', decimals: 2, zh: '馬幣', en: 'Malaysian Ringgit' },
];

export const currencyInfo = (code: string): CurrencyInfo =>
  CURRENCIES.find((c) => c.code === code) ?? { code, symbol: code + ' ', decimals: 2, zh: code, en: code };

/** Approximate rates per 1 USD, used until live rates are fetched. */
export const DEFAULT_RATES_PER_USD: Record<string, number> = {
  USD: 1,
  TWD: 30.5,
  EUR: 0.86,
  JPY: 147,
  CNY: 7.15,
  GBP: 0.74,
  HKD: 7.8,
  KRW: 1390,
  SGD: 1.29,
  AUD: 1.52,
  CAD: 1.38,
  CHF: 0.8,
  MYR: 4.25,
};

export interface DomainInfo {
  id: string;
  zh: string;
  en: string;
}

export const BUILTIN_DOMAINS: DomainInfo[] = [
  { id: 'medical', zh: '醫療', en: 'Medical' },
  { id: 'pharma', zh: '生技製藥', en: 'Pharma & Biotech' },
  { id: 'legal', zh: '法律', en: 'Legal' },
  { id: 'patent', zh: '專利', en: 'Patents' },
  { id: 'finance', zh: '金融財經', en: 'Finance' },
  { id: 'tech', zh: '科技資訊', en: 'IT & Tech' },
  { id: 'software', zh: '軟體在地化', en: 'Software Localization' },
  { id: 'games', zh: '遊戲', en: 'Games' },
  { id: 'marketing', zh: '行銷廣告', en: 'Marketing' },
  { id: 'media', zh: '影視字幕', en: 'Film & Media' },
  { id: 'literary', zh: '出版文學', en: 'Publishing & Literature' },
  { id: 'academic', zh: '學術', en: 'Academic' },
  { id: 'engineering', zh: '工程製造', en: 'Engineering' },
  { id: 'energy', zh: '能源環境', en: 'Energy & Environment' },
  { id: 'government', zh: '政府公文', en: 'Government' },
  { id: 'tourism', zh: '觀光旅遊', en: 'Travel & Tourism' },
  { id: 'fashion', zh: '時尚美妝', en: 'Fashion & Beauty' },
  { id: 'ecommerce', zh: '電商零售', en: 'E-commerce' },
  { id: 'general', zh: '一般', en: 'General' },
];

export const domainLabel = (id: string | undefined, lang: 'zh-TW' | 'en'): string => {
  if (!id) return lang === 'en' ? 'Uncategorised' : '未分類';
  const d = BUILTIN_DOMAINS.find((x) => x.id === id);
  if (!d) return id;
  return lang === 'en' ? d.en : d.zh;
};

export const SERVICES: { id: ServiceType; zh: string; en: string }[] = [
  { id: 'translation', zh: '筆譯', en: 'Translation' },
  { id: 'review', zh: '審稿', en: 'Review / Editing' },
  { id: 'proofreading', zh: '校對', en: 'Proofreading' },
  { id: 'mtpe', zh: '譯後編輯 MTPE', en: 'MT Post-editing' },
  { id: 'subtitling', zh: '字幕翻譯', en: 'Subtitling' },
  { id: 'transcreation', zh: '創譯文案', en: 'Transcreation' },
  { id: 'transcription', zh: '聽打逐字稿', en: 'Transcription' },
  { id: 'interpreting', zh: '口譯', en: 'Interpreting' },
  { id: 'lqa', zh: '語言品質測試', en: 'LQA' },
  { id: 'other', zh: '其他', en: 'Other' },
];

export const serviceLabel = (id: ServiceType, lang: 'zh-TW' | 'en') => {
  const s = SERVICES.find((x) => x.id === id);
  return s ? (lang === 'en' ? s.en : s.zh) : id;
};

export const UNITS: { id: Unit; zh: string; en: string; per: { zh: string; en: string } }[] = [
  { id: 'word', zh: '字（單字）', en: 'Words', per: { zh: '字', en: 'word' } },
  { id: 'char', zh: '字（中文字元）', en: 'Characters', per: { zh: '中文字', en: 'char' } },
  { id: 'hour', zh: '小時', en: 'Hours', per: { zh: '小時', en: 'hr' } },
  { id: 'minute', zh: '分鐘（影音）', en: 'Minutes', per: { zh: '分鐘', en: 'min' } },
  { id: 'page', zh: '頁', en: 'Pages', per: { zh: '頁', en: 'page' } },
  { id: 'flat', zh: '整案計價', en: 'Flat fee', per: { zh: '案', en: 'job' } },
];

export const unitInfo = (u: Unit) => UNITS.find((x) => x.id === u)!;

export const STATUSES: JobStatus[] = ['quote', 'active', 'delivered', 'invoiced', 'paid', 'cancelled'];
export const PIPELINE: JobStatus[] = ['quote', 'active', 'delivered', 'invoiced', 'paid'];

export const CLIENT_KINDS: { id: ClientKind; zh: string; en: string }[] = [
  { id: 'agency', zh: '翻譯社／語言服務商', en: 'Agency / LSP' },
  { id: 'direct', zh: '企業直客', en: 'Direct client' },
  { id: 'publisher', zh: '出版社', en: 'Publisher' },
  { id: 'platform', zh: '接案平台', en: 'Platform' },
  { id: 'other', zh: '其他', en: 'Other' },
];

export const CAT_BANDS: { id: CatBand; label: string }[] = [
  { id: 'context', label: 'Context / 101%' },
  { id: 'repetition', label: 'Repetitions' },
  { id: 'm100', label: '100%' },
  { id: 'm95', label: '95–99%' },
  { id: 'm85', label: '85–94%' },
  { id: 'm75', label: '75–84%' },
  { id: 'm50', label: '50–74%' },
  { id: 'noMatch', label: 'No match' },
  { id: 'mt', label: 'MT' },
];

export const DEFAULT_CAT_GRID: CatGrid = {
  context: 0,
  repetition: 25,
  m100: 25,
  m95: 50,
  m85: 70,
  m75: 100,
  m50: 100,
  noMatch: 100,
  mt: 100,
};

export const CAT_TOOLS = ['Trados Studio', 'memoQ', 'Phrase', 'Wordfast', 'Smartcat', 'XTM', 'Crowdin', 'Matecat', 'OmegaT', 'Déjà Vu', 'CafeTran', 'Aegisub', 'Subtitle Edit'];

export const DEFAULT_SETTINGS: Settings = {
  lang: 'zh-TW',
  theme: 'system',
  baseCurrency: 'TWD',
  defaultSourceLang: 'en',
  defaultTargetLang: 'zh-TW',
  profile: { name: '' },
  goals: { yearIncome: 1_200_000, yearWords: 800_000 },
  tax: {
    region: 'TW',
    withholdingRate: 0.1,
    withholdingThreshold: 20000,
    nhiRate: 0.0211,
    nhiThreshold: 20000,
    exemption9B: 180000,
    expenseRate9B: 0.3,
  },
  work: { hoursPerDay: 6, workDays: [1, 2, 3, 4, 5], wordsPerHour: 450 },
  domains: [],
  fx: { rates: DEFAULT_RATES_PER_USD, base: 'USD' },
  onboarded: false,
  invoiceSeq: 1,
  invoicePrefix: 'INV',
};
