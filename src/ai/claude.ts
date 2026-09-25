// Optional Claude features, using the person's own API key. The key lives
// only in this device's local table and is never synced or exported.

import type Anthropic from '@anthropic-ai/sdk';
import { create } from 'zustand';
import { delLocal, getLocal, setLocal } from '../db/db';
import { BUILTIN_DOMAINS, LANGUAGES } from '../domain/constants';
import type { QuickParse } from '../domain/quickadd';
import type { Client, Settings, Unit } from '../domain/types';

export const AI_MODEL = 'claude-opus-5';

export const useAI = create<{ key?: string; loaded: boolean }>(() => ({ loaded: false }));

export const loadAIKey = async () => {
  const key = await getLocal<string>('ai:key');
  useAI.setState({ key, loaded: true });
};

export const saveAIKey = async (key: string | undefined) => {
  if (key) await setLocal('ai:key', key.trim());
  else await delLocal('ai:key');
  useAI.setState({ key: key?.trim() || undefined });
};

export const aiAvailable = () => !__DEMO_BUILD__ && !!useAI.getState().key;

let clientPromise: Promise<Anthropic> | null = null;
let clientKey: string | undefined;

const getClient = async (): Promise<Anthropic> => {
  const key = useAI.getState().key;
  if (!key) throw new Error('no-key');
  if (!clientPromise || clientKey !== key) {
    clientKey = key;
    clientPromise = (__DEMO_BUILD__ ? Promise.reject(new Error('preview')) : import('@anthropic-ai/sdk')).then(({ default: A }) => new A({ apiKey: key, dangerouslyAllowBrowser: true }));
  }
  return clientPromise;
};

export class AIError extends Error {}

const describeError = async (e: unknown): Promise<AIError> => {
  if (__DEMO_BUILD__) return new AIError(String(e));
  const { default: A } = await import('@anthropic-ai/sdk');
  if (e instanceof A.AuthenticationError) return new AIError('API key 無效 / invalid API key');
  if (e instanceof A.PermissionDeniedError) return new AIError('此金鑰沒有權限 / key lacks permission');
  if (e instanceof A.RateLimitError) return new AIError('請求太頻繁，稍後再試 / rate limited');
  if (e instanceof A.APIConnectionError) return new AIError('無法連線 / connection failed');
  if (e instanceof A.APIError) return new AIError(`API ${e.status ?? ''} ${e.message}`);
  return new AIError((e as Error)?.message ?? String(e));
};

/** One request with server-side refusal fallback; returns the text of the answer. */
const ask = async (params: { system: string; user: string; effort: 'low' | 'medium' | 'high'; schema?: Record<string, unknown> }): Promise<string> => {
  const client = await getClient();
  try {
    const res = await client.beta.messages.create({
      model: AI_MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: params.system,
      messages: [{ role: 'user', content: params.user }],
      output_config: { effort: params.effort, ...(params.schema ? { format: { type: 'json_schema', schema: params.schema } } : {}) },
    });
    if (res.stop_reason === 'refusal') throw new AIError('Claude 無法處理這段內容 / Claude declined this request');
    return res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
  } catch (e) {
    if (e instanceof AIError) throw e;
    throw await describeError(e);
  }
};

// ---------- job extraction ----------

const nullable = (type: string, extra: Record<string, unknown> = {}) => ({ type: [type, 'null'], ...extra });

const JOB_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'clientName', 'sourceLang', 'targetLang', 'unit', 'quantity', 'rate', 'currency', 'flatFee', 'dueAt', 'domain', 'service', 'poNumber', 'catTool'],
  properties: {
    title: { type: 'string', description: 'Short project title in the language of the email' },
    clientName: nullable('string'),
    sourceLang: nullable('string', { enum: [...LANGUAGES.map((l) => l.code), null] }),
    targetLang: nullable('string', { enum: [...LANGUAGES.map((l) => l.code), null] }),
    unit: nullable('string', { enum: ['word', 'char', 'hour', 'minute', 'page', 'flat', null] }),
    quantity: nullable('number'),
    rate: nullable('number'),
    currency: nullable('string', { description: 'ISO 4217 code' }),
    flatFee: nullable('number'),
    dueAt: nullable('string', { description: 'YYYY-MM-DD or YYYY-MM-DDTHH:mm in the translator’s local time' }),
    domain: nullable('string', { enum: [...BUILTIN_DOMAINS.map((d) => d.id), null] }),
    service: nullable('string', { enum: ['translation', 'review', 'proofreading', 'mtpe', 'subtitling', 'transcreation', 'transcription', 'interpreting', 'lqa', 'other', null] }),
    poNumber: nullable('string'),
    catTool: nullable('string'),
  },
};

interface AIJob {
  title: string;
  clientName: string | null;
  sourceLang: string | null;
  targetLang: string | null;
  unit: Unit | null;
  quantity: number | null;
  rate: number | null;
  currency: string | null;
  flatFee: number | null;
  dueAt: string | null;
  domain: string | null;
  service: QuickParse['service'] | null;
  poNumber: string | null;
  catTool: string | null;
}

export const aiParseJob = async (text: string, ctx: { clients: Client[]; today: string; settings: Settings }): Promise<QuickParse> => {
  const system = [
    'You extract translation job details from messages that clients send to a freelance translator (emails, purchase orders, chat messages).',
    `Today is ${ctx.today}. Resolve relative dates ("Friday", "next Tuesday", "EOD tomorrow") against today. The translator's default target language is ${ctx.settings.defaultTargetLang}; plain "Chinese" in Taiwan usually means zh-TW.`,
    'Use "word" for per-word pricing of alphabetic source text and "char" for per-character pricing (typical for Chinese, Japanese or Korean source). If a CAT analysis gives a weighted word count, use the weighted count as quantity.',
    'Leave a field null when the message does not say it. Do not invent rates or deadlines.',
    ctx.clients.length ? `Known clients (reuse the exact spelling when one matches): ${ctx.clients.slice(0, 80).map((c) => c.name).join('; ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const raw = await ask({ system, user: text, effort: 'low', schema: JOB_SCHEMA });
  const j = JSON.parse(raw) as AIJob;
  const match = j.clientName ? ctx.clients.find((c) => c.name.toLowerCase() === j.clientName!.toLowerCase()) : undefined;
  return {
    title: j.title,
    clientId: match?.id,
    newClientName: match ? undefined : j.clientName ?? undefined,
    sourceLang: j.sourceLang ?? undefined,
    targetLang: j.targetLang ?? undefined,
    unit: j.unit ?? undefined,
    quantity: j.quantity ?? undefined,
    rate: j.rate ?? undefined,
    currency: j.currency?.toUpperCase() ?? undefined,
    flatFee: j.flatFee ?? undefined,
    dueAt: j.dueAt ?? undefined,
    domain: j.domain ?? undefined,
    service: j.service ?? undefined,
    poNumber: j.poNumber ?? undefined,
    catTool: j.catTool ?? undefined,
    tokens: [],
  };
};

// ---------- résumé polish ----------

export const aiPolishResume = async (markdown: string, lang: 'zh' | 'en', notes?: string): Promise<string> => {
  const system =
    lang === 'zh'
      ? '你是協助自由譯者撰寫履歷的編輯。根據提供的真實接案紀錄，用台灣繁體中文改寫成專業、具體、自然的履歷段落。保留所有數字與事實，不可誇大或捏造；用字精煉，避免空泛形容詞。輸出 Markdown，包含：一段 3–4 句的個人簡介、「核心經歷」條列（4–6 點，每點以動詞開頭並帶數字）、「代表案例」條列。'
      : 'You are an editor helping a freelance translator write their CV. Rewrite the factual work record below into a concise, specific, professional CV section in English. Keep every number and fact; never exaggerate or invent. Output Markdown with: a 3–4 sentence profile, a "Key experience" list (4–6 bullets, each starting with a verb and carrying a number), and a "Selected projects" list.';
  return ask({ system, user: markdown + (notes ? `\n\n---\n${notes}` : ''), effort: 'medium' });
};

export const testAIKey = async () => {
  await ask({ system: 'Reply with the single word OK.', user: 'ping', effort: 'low' });
};
