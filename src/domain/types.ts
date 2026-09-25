// Core data model. Every synced record carries `id`, `updatedAt` and an
// optional `deletedAt` tombstone so devices can merge last-write-wins.

export type Unit = 'word' | 'char' | 'hour' | 'minute' | 'page' | 'flat';

export type JobStatus = 'quote' | 'active' | 'delivered' | 'invoiced' | 'paid' | 'cancelled';

export type ServiceType =
  | 'translation'
  | 'review'
  | 'proofreading'
  | 'mtpe'
  | 'subtitling'
  | 'transcreation'
  | 'transcription'
  | 'interpreting'
  | 'lqa'
  | 'other';

export type ClientKind = 'agency' | 'direct' | 'publisher' | 'platform' | 'other';

/** Taiwan income category used by the tax helper. */
export type IncomeCategory = '9B' | '9A' | '50' | 'none';

export interface SyncMeta {
  id: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  /** Records created by the sample-data generator. */
  demo?: boolean;
}

/** Fuzzy-match bands found in Trados / memoQ / Phrase analysis reports. */
export type CatBand =
  | 'context'
  | 'repetition'
  | 'm100'
  | 'm95'
  | 'm85'
  | 'm75'
  | 'm50'
  | 'noMatch'
  | 'mt';

export type CatGrid = Record<CatBand, number>; // percentage payable, 0–100
export type CatCounts = Partial<Record<CatBand, number>>;

export interface Job extends SyncMeta {
  title: string;
  clientId?: string;
  service: ServiceType;
  sourceLang: string;
  targetLang: string;
  domain?: string;
  tags: string[];

  unit: Unit;
  /** Billing quantity in `unit` (words, characters, hours…). */
  quantity: number;
  /** Word count used for statistics when unit is not word/char. */
  words?: number;
  /** CAT analysis band counts and the grid used to weight them. */
  cat?: { counts: CatCounts; grid: CatGrid };
  rate: number;
  currency: string;
  /** Rush fee (+) or discount (−) in percent. */
  surchargePct?: number;
  minimumFee?: number;
  /** Manual total that overrides the computed amount. */
  amountOverride?: number;
  /** Value of 1 unit of `currency` in the base currency, frozen at entry time. */
  fxToBase: number;

  withholding?: number;
  nhi?: number;
  fees?: number;
  incomeCategory?: IncomeCategory;

  status: JobStatus;
  receivedAt?: string; // YYYY-MM-DD
  dueAt?: string; // YYYY-MM-DD or YYYY-MM-DDTHH:mm
  deliveredAt?: string;
  invoicedAt?: string;
  paidAt?: string;
  paymentDueAt?: string;
  progress?: number; // 0–100
  /** Progress at the start of the most recent day it changed, for “done today”. */
  dayStart?: { date: string; progress: number };
  invoiceId?: string;

  catTool?: string;
  poNumber?: string;
  notes?: string;

  featured?: boolean;
  confidential?: boolean;
  publicTitle?: string;

  /** The project this job is a part of, e.g. the cutscenes of a game. */
  projectId?: string;
  /** Kind of part within the project (trailer, dialogue, chapter…). */
  part?: string;
}

export type ProjectKind = 'game' | 'series' | 'book' | 'software' | 'custom';

/** A question for the client, kept with the project until it is answered. */
export interface ProjectQuery {
  id: string;
  text: string;
  /** The part (job) it concerns. */
  jobId?: string;
  /** String ID, timecode, page or line the question points at. */
  ref?: string;
  status: 'open' | 'sent' | 'answered';
  answer?: string;
  createdAt: number;
  answeredAt?: number;
}

export interface ProjectLink {
  id: string;
  label: string;
  url: string;
}

/** A large engagement split into parts; each part is an ordinary job. */
export interface Project extends SyncMeta {
  name: string;
  clientId?: string;
  kind: ProjectKind;
  sourceLang?: string;
  targetLang?: string;
  /** Final deadline for the whole project. */
  dueAt?: string;
  notes?: string;
  links: ProjectLink[];
  queries: ProjectQuery[];
  /** Hide the title on résumés and the portfolio site (NDA). */
  confidential?: boolean;
  publicTitle?: string;
  archived?: boolean;
}

/** One line of a client's rate card, e.g. proofreading EN→ZH-TW at 0.04 per word. */
export interface ClientRate {
  id: string;
  service: ServiceType;
  /** Left empty, the rate applies to any source (or target) language. */
  sourceLang?: string;
  targetLang?: string;
  unit: Unit;
  rate: number;
  minimumFee?: number;
  note?: string;
}

export interface Client extends SyncMeta {
  name: string;
  kind: ClientKind;
  country?: string;
  industry?: string;
  /** How the client appears on an anonymised résumé, e.g. “國際醫療器材公司”. */
  publicLabel?: string;
  currency: string;
  defaultRate?: number;
  defaultUnit?: Unit;
  /** Rates by service and language pair; the default rate covers anything not listed. */
  rates?: ClientRate[];
  paymentTermsDays?: number;
  withholds?: boolean;
  contactName?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  taxId?: string;
  catGrid?: CatGrid;
  notes?: string;
  color?: number; // categorical slot index
  archived?: boolean;
}

export interface Session extends SyncMeta {
  jobId: string;
  start: number;
  end?: number;
  note?: string;
}

export interface Invoice extends SyncMeta {
  number: string;
  clientId: string;
  issueDate: string;
  dueDate?: string;
  currency: string;
  jobIds: string[];
  lang: 'zh' | 'en';
  notes?: string;
  status: 'draft' | 'sent' | 'paid';
  paidAt?: string;
}

export interface Pref extends SyncMeta {
  // id = preference key
  value: unknown;
}

export type TableName = 'jobs' | 'clients' | 'sessions' | 'invoices' | 'prefs' | 'projects';

export interface Profile {
  name: string;
  nameEn?: string;
  title?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  bank?: string;
  taxId?: string;
  since?: number; // year started freelancing
  bio?: string;
}

export interface Goals {
  yearIncome?: number;
  yearWords?: number;
  monthIncome?: number;
}

export interface TaxSettings {
  region: 'TW' | 'other';
  withholdingRate: number; // 0.10
  withholdingThreshold: number; // 20000 — withheld only when a payment exceeds this
  nhiRate: number; // 0.0211
  nhiThreshold: number; // 20000 — levied when a payment reaches this
  exemption9B: number; // 180000
  expenseRate9B: number; // 0.30
}

export interface WorkSettings {
  hoursPerDay: number;
  workDays: number[]; // 0=Sun … 6=Sat
  wordsPerHour: number; // fallback throughput when no timer data exists
}

export type Lang = 'zh-TW' | 'en';
export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  lang: Lang;
  theme: Theme;
  baseCurrency: string;
  defaultTargetLang: string;
  defaultSourceLang: string;
  profile: Profile;
  goals: Goals;
  tax: TaxSettings;
  work: WorkSettings;
  domains: string[];
  fx: { rates: Record<string, number>; base: string; updatedAt?: number; source?: string };
  onboarded: boolean;
  invoiceSeq: number;
  invoicePrefix: string;
}
