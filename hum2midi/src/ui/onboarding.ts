// 第一次開啟時的 3 張說明卡（按空白鍵錄音 → 編輯 → 拖進 GarageBand），可以左右翻、可以略過，之後從「?」重開。

import { setPrefs, store } from '../app/state';
import { h } from './dom';

const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const cmd = isMac ? '⌘' : 'Ctrl+';

/** GarageBand 匯入說明（說明卡第 3 張與編輯頁的小卡共用）。 */
export function garageBandTips(bpm?: number | null): HTMLElement {
  return h(
    'div',
    { class: 'gb-tips' },
    h('ol', {}, h('li', {}, '在 Finder 找到下載的 ', h('code', {}, '.mid'), ' 檔。'), h('li', {}, '拖到 GarageBand 的軌道區：拖到現有的軟體樂器軌，或拖到所有軌道下方的空白處（會新增一軌）。'), h('li', {}, '之後可以在左邊的「資料庫」換成任何樂器。')),
    h(
      'p',
      { class: 'small' },
      h('strong', {}, '速度：'),
      bpm === undefined ? '' : `這個檔案是 ${bpm ?? 120} BPM${bpm ? '' : '（沒設定 BPM 的錄音一律寫 120，時間保持原樣）'}。`,
      '如果 GarageBand 問要不要匯入檔案的速度資訊（Import Tempo Information），選匯入；沒有問的話，先把專案速度設成同一個 BPM 再拖進去。新專案預設就是 120。用「檔案 › 開啟」直接打開 .mid 也會照檔案的速度。',
    ),
  );
}

type Card = { title: string; art: HTMLElement; body: (HTMLElement | string)[] };

function cards(): Card[] {
  return [
    {
      title: '按空白鍵，哼一段',
      art: h('div', { class: 'ob-art ob-space', 'aria-hidden': 'true' }, 'space'),
      body: [
        h('p', {}, '打開就能錄：按 ', h('kbd', {}, '空白鍵'), ' 開始，再按一次停止。不用任何設定。'),
        h('p', { class: 'small muted' }, '想跟拍子對齊可以開節拍器（有 1 小節預備拍）。用內建或有線麥克風效果最好；音訊不會離開你的電腦。'),
      ],
    },
    {
      title: '自動變音符，順手改一改',
      art: h('div', { class: 'ob-art ob-notes', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i')),
      body: [
        h('p', {}, '停止後會自動轉成音符，原始音高曲線畫在後面，一眼看出切得對不對。'),
        h(
          'ul',
          { class: 'small' },
          h('li', {}, '拖曳改音高與位置，拖右緣改長度'),
          h('li', {}, h('kbd', {}, 'Delete'), ' 刪除、雙擊空白處新增、', h('kbd', {}, '↑'), h('kbd', {}, '↓'), ' 半音'),
          h('li', {}, h('kbd', {}, `${cmd}Z`), ' 復原、', h('kbd', {}, 'Space'), ' 播放、', h('kbd', {}, 'Enter'), ' 匯出 MIDI'),
        ),
      ],
    },
    {
      title: '拖進 GarageBand',
      art: h('div', { class: 'ob-art ob-file', 'aria-hidden': 'true' }, '.mid'),
      body: [garageBandTips()],
    },
  ];
}

export function showOnboarding() {
  if (document.querySelector('dialog.onboarding')) return;
  const all = cards();
  let i = 0;
  const title = h('h2', { id: 'ob-title' });
  const art = h('div', { class: 'ob-art-wrap' });
  const body = h('div', { class: 'ob-body' });
  const dots = h('div', { class: 'ob-dots', 'aria-hidden': 'true' }, ...all.map(() => h('span')));
  const counter = h('span', { class: 'num small muted', 'aria-live': 'polite' });
  const prev = h('button', { class: 'btn icon', type: 'button', 'aria-label': '上一張（←）', onclick: () => go(i - 1) }, '←');
  const next = h('button', { class: 'btn primary', type: 'button', onclick: () => (i < all.length - 1 ? go(i + 1) : finish()) });
  const skip = h('button', { class: 'btn', type: 'button', onclick: () => finish() }, '略過');
  const card = h('div', { class: 'ob-card' }, art, title, body);
  const dlg = h('dialog', { class: 'panel onboarding', 'aria-labelledby': 'ob-title' }, card, h('div', { class: 'ob-nav' }, skip, dots, counter, h('span', { class: 'spacer' }), prev, next));

  function go(n: number) {
    i = Math.max(0, Math.min(all.length - 1, n));
    const c = all[i];
    title.textContent = c.title;
    art.replaceChildren(c.art);
    body.replaceChildren(...c.body);
    counter.textContent = `${i + 1} / ${all.length}`;
    [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i));
    prev.disabled = i === 0;
    next.textContent = i < all.length - 1 ? '下一張 →' : '開始使用';
    next.setAttribute('aria-label', i < all.length - 1 ? '下一張（→）' : '開始使用');
  }

  function finish() {
    setPrefs({ onboarded: true });
    dlg.close();
  }

  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (i < all.length - 1) go(i + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(i - 1);
    }
  });
  // 左右滑動（觸控板拖曳、觸控螢幕）也能翻頁
  let x0: number | null = null;
  card.addEventListener('pointerdown', (e) => (x0 = e.clientX));
  card.addEventListener('pointerup', (e) => {
    if (x0 === null) return;
    const dx = e.clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 60) go(i + (dx < 0 ? 1 : -1));
  });
  dlg.addEventListener('close', () => {
    // Esc 關掉也算看過了
    if (!store.get().prefs.onboarded) setPrefs({ onboarded: true });
    dlg.remove();
  });
  document.body.append(dlg);
  go(0);
  dlg.showModal();
  next.focus();
}
