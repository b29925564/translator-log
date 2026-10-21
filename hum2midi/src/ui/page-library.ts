// Takes 庫：最新在前，分頁（不做無限捲動），每張卡片有迷你音高縮圖、名稱、日期、長度、音符數。

import { flushAutosave, openTake } from '../app/library';
import { newId } from '../app/session';
import { store } from '../app/state';
import { formatClock } from '../music';
import { deleteTake, duplicateTake, listTakes, renameTake, type TakeMeta } from '../store/takes';
import type { Note } from '../types';
import { confirmDialog, promptDialog } from './dialog';
import { cssVar, fitCanvas, h } from './dom';
import type { Page } from './page';
import { toast } from './toast';

const CARD_W = 270;
const CARD_H = 172;
const GAP = 16;

function dateText(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function drawThumb(canvas: HTMLCanvasElement, notes: Note[], duration: number) {
  const { w, h: H, ctx } = fitCanvas(canvas);
  ctx.fillStyle = cssVar('--bg');
  ctx.fillRect(0, 0, w, H);
  if (!notes.length) return;
  const lo = Math.min(...notes.map((n) => n.midi)) - 1;
  const hi = Math.max(...notes.map((n) => n.midi)) + 1;
  const end = Math.max(duration, ...notes.map((n) => n.start + n.dur));
  const rowH = H / Math.max(8, hi - lo + 1);
  ctx.fillStyle = cssVar('--note');
  for (const n of notes) {
    const x = (n.start / end) * w;
    const y = H - (n.midi - lo + 1) * rowH - (H - (hi - lo + 1) * rowH) / 2;
    ctx.fillRect(x, y, Math.max(2, (n.dur / end) * w - 1), Math.max(3, rowH - 1));
  }
}

export function createLibraryPage(): Page {
  let takes: TakeMeta[] = [];
  let page = 0;
  let perPage = 6;

  const count = h('span', { class: 'muted small num' });
  const prevBtn = h('button', { class: 'btn icon', 'aria-label': '上一頁', onclick: () => go(page - 1) }, '‹');
  const nextBtn = h('button', { class: 'btn icon', 'aria-label': '下一頁', onclick: () => go(page + 1) }, '›');
  const pageText = h('span', { class: 'num small', 'aria-live': 'polite' });
  const header = h('div', { class: 'toolbar-row lib-head' }, h('h2', { class: 'lib-title' }, 'Takes 庫'), count, h('span', { class: 'spacer' }), prevBtn, pageText, nextBtn);
  const grid = h('div', { class: 'lib-grid', role: 'list', 'aria-label': 'Takes' });
  const empty = h('div', { class: 'empty', hidden: true }, h('div', {}, h('p', {}, '還沒有任何 take。'), h('p', { class: 'small' }, '到「錄音」頁按空白鍵錄一段，停止後會自動存在這裡。')));
  const el = h('section', { class: 'page', 'aria-label': '庫' }, header, grid, empty);

  new ResizeObserver(() => {
    const r = grid.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const cols = Math.max(1, Math.floor((r.width + GAP) / (CARD_W + GAP)));
    const rows = Math.max(1, Math.floor((r.height + GAP) / (CARD_H + GAP)));
    if (cols * rows !== perPage) {
      const first = page * perPage;
      perPage = cols * rows;
      page = Math.floor(first / perPage);
      render();
    }
  }).observe(grid);

  async function reload() {
    try {
      takes = await listTakes();
    } catch (err) {
      takes = [];
      toast(`讀不到 Takes 庫：${err instanceof Error ? err.message : String(err)}`, 'error');
    }
    render();
  }

  function go(p: number) {
    const pages = Math.max(1, Math.ceil(takes.length / perPage));
    page = Math.max(0, Math.min(pages - 1, p));
    render();
  }

  async function open(id: string) {
    const s = await openTake(id);
    if (!s) {
      toast('找不到這個 take', 'error');
      return reload();
    }
    store.set({ session: s, page: s.take.mode === 'speech-song' && store.get().prefs.speechUnlocked ? 'speech' : 'edit' });
  }

  async function rename(t: TakeMeta) {
    const name = await promptDialog('重新命名', t.name, '儲存');
    if (!name || name === t.name) return;
    await flushAutosave();
    await renameTake(t.id, name);
    const s = store.get().session;
    if (s?.take.id === t.id) store.set({ session: { ...s, take: { ...s.take, name } } });
    await reload();
  }

  async function duplicate(t: TakeMeta) {
    await flushAutosave();
    await duplicateTake(t.id, newId());
    page = 0;
    await reload();
    toast(`已複製「${t.name}」`);
  }

  async function remove(t: TakeMeta) {
    if (!(await confirmDialog(`刪除「${t.name}」？刪除後無法復原。`, '刪除'))) return;
    await deleteTake(t.id);
    if (store.get().session?.take.id === t.id) store.set({ session: null });
    await reload();
    toast(`已刪除「${t.name}」`);
  }

  function card(t: TakeMeta) {
    const thumb = h('canvas', { class: 'lib-thumb', 'aria-hidden': 'true' });
    const current = store.get().session?.take.id === t.id;
    const c = h(
      'article',
      { class: 'take-card panel', role: 'listitem', 'aria-label': t.name, 'data-current': current ? 'true' : undefined },
      thumb,
      h(
        'div',
        { class: 'take-title-row' },
        h('h3', { class: 'take-name', title: t.name }, t.name),
        t.mode === 'speech-song' ? h('span', { class: 'badge small' }, '說話變唱歌') : null,
        current ? h('span', { class: 'badge small' }, '編輯中') : null,
      ),
      h('div', { class: 'small muted num' }, `${dateText(t.createdAt)} · ${formatClock(t.duration)} · ${t.notes.length} 音符`),
      h(
        'div',
        { class: 'take-actions' },
        h('button', { class: 'btn primary', 'aria-label': `開啟「${t.name}」`, onclick: () => void open(t.id) }, '開啟'),
        h('button', { class: 'btn icon', 'aria-label': `重新命名「${t.name}」`, onclick: () => void rename(t) }, '✎'),
        h('button', { class: 'btn icon', 'aria-label': `複製「${t.name}」`, onclick: () => void duplicate(t) }, '⧉'),
        h('button', { class: 'btn icon', 'aria-label': `刪除「${t.name}」`, onclick: () => void remove(t) }, '🗑'),
      ),
    );
    requestAnimationFrame(() => drawThumb(thumb, t.notes, t.duration));
    return c;
  }

  function render() {
    const pages = Math.max(1, Math.ceil(takes.length / perPage));
    page = Math.min(page, pages - 1);
    count.textContent = `${takes.length} 個`;
    pageText.textContent = `${page + 1} / ${pages}`;
    prevBtn.disabled = page === 0;
    nextBtn.disabled = page >= pages - 1;
    empty.hidden = takes.length > 0;
    grid.hidden = takes.length === 0;
    grid.replaceChildren(...takes.slice(page * perPage, (page + 1) * perPage).map(card));
  }

  return {
    el,
    show() {
      el.classList.add('active');
      void flushAutosave().then(reload);
    },
    hide() {
      el.classList.remove('active');
    },
    onKey(e) {
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        go(page - 1);
        return true;
      }
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        go(page + 1);
        return true;
      }
      return false;
    },
  };
}
