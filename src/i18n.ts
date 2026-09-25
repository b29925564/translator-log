// Two-language UI. Strings live next to the component that uses them:
// tx('中文', 'English'). The app shell remounts when the language changes.

import type { Lang } from './domain/types';

let current: Lang = 'zh-TW';
let applied: Lang | undefined;

export const setLang = (l: Lang) => {
  current = l;
  if (typeof document === 'undefined' || applied === l) return;
  applied = l;
  document.documentElement.lang = l === 'en' ? 'en' : 'zh-Hant-TW';
  document.title = l === 'en' ? 'Witimemo' : '記譯 Witimemo';
  // iOS reads this when the app is added to the home screen
  document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', l === 'en' ? 'Witimemo' : '記譯');
};

export const getLang = (): Lang => current;
export const isEn = () => current === 'en';

export const tx = (zh: string, en: string) => (current === 'en' ? en : zh);

/** Picks the Chinese or English half of a `{ zh, en }` label. */
export const lbl = (x: { zh: string; en: string } | undefined) => (x ? (current === 'en' ? x.en : x.zh) : '');
