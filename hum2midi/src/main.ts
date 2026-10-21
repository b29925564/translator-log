// 應用程式外殼：頂部頁籤、頁面切換、全域快捷鍵。

import './style.css';
import { debugHooks } from './app/debug';
import { store, type AppState, type Page as PageName } from './app/state';
import { h } from './ui/dom';
import type { Page } from './ui/page';
import { onSaveError, startAutosave } from './app/library';
import { createEditPage } from './ui/page-edit';
import { createLibraryPage } from './ui/page-library';
import { createRecordPage } from './ui/page-record';
import { toast } from './ui/toast';

const TABS: { page: PageName; label: string; key: string }[] = [
  { page: 'record', label: '錄音', key: '1' },
  { page: 'edit', label: '編輯', key: '2' },
  { page: 'library', label: '庫', key: '3' },
];

function createPlaceholder(label: string, text: string): Page {
  const el = h('section', { class: 'page', 'aria-label': label }, h('div', { class: 'empty' }, text));
  return { el, show: () => el.classList.add('active'), hide: () => el.classList.remove('active'), onKey: () => false };
}

const pages: Record<PageName, Page> = {
  record: createRecordPage(),
  edit: createEditPage(),
  library: createLibraryPage(),
  speech: createPlaceholder('說話變唱歌', '說話變唱歌'),
};

startAutosave();
onSaveError((m) => toast(m, 'error'));

const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const mod = isMac ? '⌘' : 'Ctrl+';

const tabButtons = TABS.map((t) =>
  h(
    'button',
    {
      class: 'tab',
      role: 'tab',
      'aria-selected': 'false',
      'aria-label': `${t.label}（${mod}${t.key}）`,
      onclick: () => go(t.page),
    },
    t.label,
    h('kbd', {}, `${mod}${t.key}`),
  ),
);

const logo = h('button', { class: 'logo', 'aria-label': 'hum2midi' }, h('span', { class: 'logo-mark' }), 'hum2midi');
const header = h('header', { class: 'topbar' }, h('h1', { class: 'brand' }, logo), h('nav', { class: 'tabs', role: 'tablist', 'aria-label': '頁面' }, ...tabButtons), h('span', { class: 'spacer' }));
const main = h('main', { class: 'pages' }, ...Object.values(pages).map((p) => p.el));
document.querySelector('#app')!.append(header, main);

function go(page: PageName) {
  if (store.get().rec.status !== 'idle' && page !== 'record') return; // 錄音中不能離開
  store.set({ page });
}

let current: PageName | null = null;
function renderPage(s: AppState) {
  if (s.page === current) return;
  if (current) pages[current].hide();
  current = s.page;
  pages[current].show();
  TABS.forEach((t, i) => tabButtons[i].setAttribute('aria-selected', String(t.page === current)));
}

function renderTabs(s: AppState) {
  const locked = s.rec.status !== 'idle';
  TABS.forEach((t, i) => (tabButtons[i].disabled = locked && t.page !== 'record'));
}

store.subscribe((s, prev) => {
  if (s.page !== prev.page) renderPage(s);
  if (s.rec.status !== prev.rec.status) renderTabs(s);
});
renderPage(store.get());

// ---------- 快捷鍵 ----------

function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && !['checkbox', 'radio', 'range', 'button'].includes(target.type);
}

let swallowSpaceUp = false;

window.addEventListener('keydown', (e) => {
  // ⌘1／⌘2／⌘3（其他系統 Ctrl）切換頁面；瀏覽器若保留了這組快捷鍵，也可以不加修飾鍵直接按 1／2／3
  const tab = TABS.find((t) => t.key === e.key);
  if (tab && !e.shiftKey && !e.altKey && ((isMac ? e.metaKey : e.ctrlKey) || (!e.metaKey && !e.ctrlKey && !typing(e.target)))) {
    e.preventDefault();
    go(tab.page);
    return;
  }
  if (typing(e.target)) return;
  if (current && pages[current].onKey(e)) {
    e.preventDefault();
    // 焦點在按鈕上時，空白鍵放開會再「點」一次按鈕；已經處理過就吞掉
    if (e.code === 'Space') swallowSpaceUp = true;
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'Space' && swallowSpaceUp) {
    swallowSpaceUp = false;
    e.preventDefault();
  }
});

// ---------- 開發模式：給 Playwright 讀狀態 ----------

declare global {
  interface Window {
    __humDebug?: unknown;
  }
}

if (import.meta.env.DEV) {
  window.__humDebug = {
    store,
    get state() {
      return store.get();
    },
    get notes() {
      return store.get().session?.take.notes ?? [];
    },
    /** 音符在畫面上的位置（client 座標），e2e 測試用來點、拖。 */
    noteBox(id: string) {
      const roll = debugHooks.roll;
      const n = store.get().session?.take.notes.find((x) => x.id === id);
      if (!roll || !n) return null;
      const r = roll.canvas.getBoundingClientRect();
      const x = r.left + roll.timeToX(n.start);
      const y = r.top + roll.midiToY(n.midi);
      return { x, y, w: n.dur * roll.view.pxPerSec, h: roll.rowH };
    },
    /** 畫面座標 → 時間、音高 */
    rollAt(clientX: number, clientY: number) {
      const roll = debugHooks.roll!;
      const r = roll.canvas.getBoundingClientRect();
      return { t: roll.xToTime(clientX - r.left), midi: roll.yToMidi(clientY - r.top) };
    },
    rollBox() {
      const r = debugHooks.roll!.canvas.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height, rowH: debugHooks.roll!.rowH };
    },
  };
}
