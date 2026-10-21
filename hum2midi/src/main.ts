// 應用程式外殼：頂部頁籤、頁面切換、全域快捷鍵、隱藏模式解鎖。

import './style.css';
import { debugHooks } from './app/debug';
import { onSaveError, startAutosave } from './app/library';
import { setPrefs, store, type AppState, type Page as PageName } from './app/state';
import { h } from './ui/dom';
import type { Page } from './ui/page';
import { createEditPage } from './ui/page-edit';
import { createLibraryPage } from './ui/page-library';
import { createRecordPage } from './ui/page-record';
import { createSpeechPage } from './ui/page-speech-song';
import { toast } from './ui/toast';

const TABS: { page: PageName; label: string; key: string; hidden?: boolean }[] = [
  { page: 'record', label: '錄音', key: '1' },
  { page: 'edit', label: '編輯', key: '2' },
  { page: 'library', label: '庫', key: '3' },
  { page: 'speech', label: '說話變唱歌', key: '4', hidden: true },
];

const pages: Record<PageName, Page> = {
  record: createRecordPage(),
  edit: createEditPage(),
  library: createLibraryPage(),
  speech: createSpeechPage(),
};

startAutosave();
onSaveError((m) => toast(m, 'error'));

const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const mod = isMac ? '⌘' : 'Ctrl+';

const tabButtons = TABS.map((t) =>
  h(
    'button',
    {
      class: t.hidden ? 'tab secret' : 'tab',
      role: 'tab',
      'aria-selected': 'false',
      'aria-label': `${t.label}（${mod}${t.key}）`,
      onclick: () => go(t.page),
    },
    t.label,
    h('kbd', {}, `${mod}${t.key}`),
  ),
);

const logo = h('button', { class: 'logo', 'aria-label': 'hum2midi', onclick: () => onLogoClick() }, h('span', { class: 'logo-mark' }), 'hum2midi');
const header = h('header', { class: 'topbar' }, h('h1', { class: 'brand' }, logo), h('nav', { class: 'tabs', role: 'tablist', 'aria-label': '頁面' }, ...tabButtons), h('span', { class: 'spacer' }));
const main = h('main', { class: 'pages' }, ...Object.values(pages).map((p) => p.el));
document.querySelector('#app')!.append(header, main);

function go(page: PageName) {
  if (store.get().rec.status !== 'idle' && page !== store.get().page) return; // 錄音中不能離開
  if (page === 'speech' && !store.get().prefs.speechUnlocked) return;
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
  TABS.forEach((t, i) => {
    tabButtons[i].disabled = locked && t.page !== s.page;
    if (t.hidden) tabButtons[i].hidden = !s.prefs.speechUnlocked;
  });
}

store.subscribe((s, prev) => {
  if (s.page !== prev.page) renderPage(s);
  if (s.rec.status !== prev.rec.status || s.prefs.speechUnlocked !== prev.prefs.speechUnlocked || s.page !== prev.page) renderTabs(s);
});
renderPage(store.get());
renderTabs(store.get());

// ---------- 隱藏模式：在錄音頁連點 logo 三下，或按 ⇧S ----------

function unlockSpeech() {
  if (!store.get().prefs.speechUnlocked) {
    setPrefs({ speechUnlocked: true });
    toast('解鎖隱藏模式：說話變唱歌');
  }
  go('speech');
}

let logoClicks: number[] = [];
function onLogoClick() {
  const now = performance.now();
  logoClicks = [...logoClicks.filter((t) => now - t < 700), now];
  if (logoClicks.length >= 3 && store.get().page === 'record' && store.get().rec.status === 'idle') {
    logoClicks = [];
    unlockSpeech();
  }
}

// ---------- 快捷鍵 ----------

function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && !['checkbox', 'radio', 'range', 'button'].includes(target.type);
}

/** 焦點在控制項上時，讓瀏覽器照原本的方式處理按鍵（鍵盤操作按鈕、核取方塊、滑桿）。 */
function nativeKey(e: KeyboardEvent): boolean {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return false;
  const activates = t instanceof HTMLButtonElement || t instanceof HTMLAnchorElement || (t instanceof HTMLInputElement && (t.type === 'checkbox' || t.type === 'radio'));
  if (activates && (e.key === 'Enter' || e.key === ' ')) return true;
  if (t instanceof HTMLInputElement && t.type === 'range' && /^(Arrow|Page|Home|End)/.test(e.key)) return true;
  if (t instanceof HTMLInputElement && t.type === 'radio' && e.key.startsWith('Arrow')) return true;
  return false;
}

// 用滑鼠點過的按鈕、核取方塊、單選鈕不要留著焦點：否則之後按空白鍵會再「按」一次那個控制項，
// 而不是錄音／播放。鍵盤操作的焦點不受影響。
let lastPointer = 0;
document.addEventListener('pointerdown', () => (lastPointer = performance.now()), true);
document.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement | null)?.closest('button');
  if (b && e.detail > 0) b.blur();
});
document.addEventListener(
  'change',
  (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement && (t.type === 'checkbox' || t.type === 'radio') && performance.now() - lastPointer < 1000) t.blur();
  },
  true,
);

let swallowSpaceUp = false;

window.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]')) return;
  const tab = TABS.find((t) => t.key === e.key);
  const cmd = isMac ? e.metaKey : e.ctrlKey;
  // ⌘1–⌘4（其他系統 Ctrl）切換頁面
  if (tab && cmd && !e.shiftKey && !e.altKey) {
    e.preventDefault();
    go(tab.page);
    return;
  }
  if (typing(e.target) || nativeKey(e)) return;
  if (current && pages[current].onKey(e)) {
    e.preventDefault();
    // 焦點在別的地方時，空白鍵放開可能會觸發瀏覽器的預設動作；已經處理過就吞掉
    if (e.code === 'Space') swallowSpaceUp = true;
    return;
  }
  // 瀏覽器可能保留了 ⌘＋數字（切換分頁）：不加修飾鍵直接按 1–4 也可以
  if (tab && !cmd && !e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
    e.preventDefault();
    go(tab.page);
    return;
  }
  if (e.key === 'S' && e.shiftKey && !cmd && !e.altKey) {
    e.preventDefault();
    unlockSpeech();
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
