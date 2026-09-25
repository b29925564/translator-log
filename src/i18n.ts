// Two-language UI. Strings live next to the component that uses them:
// tx('中文', 'English'). The app shell remounts when the language changes.

import type { Lang } from './domain/types';

let current: Lang = 'zh-TW';

export const setLang = (l: Lang) => {
  current = l;
  if (typeof document !== 'undefined') document.documentElement.lang = l === 'en' ? 'en' : 'zh-Hant-TW';
};

export const getLang = (): Lang => current;
export const isEn = () => current === 'en';

export const tx = (zh: string, en: string) => (current === 'en' ? en : zh);

/** Picks the Chinese or English half of a `{ zh, en }` label. */
export const lbl = (x: { zh: string; en: string } | undefined) => (x ? (current === 'en' ? x.en : x.zh) : '');
