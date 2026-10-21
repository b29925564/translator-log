// 畫面底部的短訊息（幾秒後自己消失），螢幕閱讀器也會唸。

import { h } from './dom';

let box: HTMLDivElement | null = null;

export function toast(message: string, kind: 'info' | 'error' = 'info') {
  box ??= document.body.appendChild(h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }));
  const t = h('div', { class: `toast panel ${kind}` }, message);
  box.append(t);
  window.setTimeout(() => t.remove(), kind === 'error' ? 8000 : 3500);
}
