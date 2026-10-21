// 編輯頁：鋼琴捲軸（改音高、改長度、刪除、新增、復原）＋播放＋右側設定（立即重新分析）＋匯出。

import { gridSeconds } from '../analysis/quantize';
import { debugHooks } from '../app/debug';
import { exportMidi, exportWav } from '../app/export';
import { History, addNote, deleteNotes, neighborId, transpose } from '../app/edit-ops';
import { analyzeSession, newId, sameNotes } from '../app/session';
import { store, type Session } from '../app/state';
import { formatClock, midiName } from '../music';
import type { Note } from '../types';
import { confirmDialog, infoDialog } from './dialog';
import { garageBandTips } from './onboarding';
import { h } from './dom';
import { createEditSettings, type TakePatch } from './edit-settings';
import type { Page } from './page';
import { PianoRoll } from './pianoroll';
import { createTransport } from './transport';

const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function createEditPage(): Page {
  const roll = new PianoRoll('鋼琴捲軸：音符與原始音高曲線');
  roll.editable = true;
  if (import.meta.env.DEV) debugHooks.roll = roll;
  const history = new History();
  let cursor = 0;

  const title = h('span', { class: 'title' });
  const info = h('span', { class: 'muted small num' });
  const tuning = h('span', { class: 'badge' });
  const busy = h('span', { class: 'badge', hidden: true }, '分析中…');
  const transport = createTransport({
    source: () => {
      const s = store.get().session;
      return s ? { samples: s.samples, sampleRate: s.take.sampleRate, notes: s.take.notes } : null;
    },
    from: () => cursor,
    onPosition: (t) => {
      roll.playhead = t;
      if (t !== null) roll.follow(t);
      roll.render();
    },
  });
  const undoBtn = h('button', { class: 'btn icon', 'aria-label': `復原（${isMac ? '⌘Z' : 'Ctrl+Z'}）`, onclick: () => undo() }, '↶');
  const redoBtn = h('button', { class: 'btn icon', 'aria-label': `重做（${isMac ? '⇧⌘Z' : 'Ctrl+Shift+Z'}）`, onclick: () => redo() }, '↷');
  const midiBtn = h('button', { class: 'btn primary', 'aria-label': '匯出 MIDI（Enter）', onclick: () => withSession(exportMidi) }, '⬇ 匯出 MIDI', h('kbd', { class: 'small' }, '⏎'));
  const wavBtn = h('button', { class: 'btn', 'aria-label': '匯出 WAV', onclick: () => withSession(exportWav) }, '⬇ WAV');
  const gbBtn = h(
    'button',
    { class: 'btn', title: '怎麼把 MIDI 拖進 GarageBand', onclick: () => withSession((s) => infoDialog('拖進 GarageBand', garageBandTips(s.take.bpm))) },
    'GarageBand 說明',
  );
  const toolbar = h(
    'div',
    { class: 'toolbar panel' },
    h('div', { class: 'toolbar-row' }, title, info, tuning, busy, h('span', { class: 'spacer' }), gbBtn, wavBtn, midiBtn),
    h('div', { class: 'toolbar-row' }, transport.el, h('span', { class: 'spacer' }), undoBtn, redoBtn),
  );
  const settings = createEditSettings((patch) => void reanalyze(patch));
  const status = h('div', { class: 'sr-only', 'aria-live': 'polite' });
  const help = h(
    'div',
    { class: 'roll-help small muted' },
    '拖曳音符改音高與位置 · 拖右緣改長度 · 雙擊空白處新增 · Delete 刪除 · ↑↓ 半音 · ←→ 切換 · 點時間尺設定播放起點',
  );
  const editor = h('div', { class: 'editor' }, h('div', { class: 'roll-wrap' }, roll.el, help), settings.el);
  const empty = h('div', { class: 'empty' }, h('div', {}, h('p', {}, '還沒有錄音。'), h('p', { class: 'small' }, '到「錄音」頁按空白鍵開始，停止後會自動轉成音符出現在這裡。')));
  const el = h('section', { class: 'page', 'aria-label': '編輯' }, toolbar, editor, empty, status);

  function withSession(fn: (s: Session) => void) {
    const s = store.get().session;
    if (s) fn(s);
  }

  // ---------- 音符編輯 ----------

  /** 套用新的音符（並記入復原歷史）。 */
  function commit(notes: Note[], before?: Note[]) {
    const s = store.get().session;
    if (!s) return;
    history.record(before ?? s.take.notes);
    store.set({ session: { ...s, take: { ...s.take, notes }, edited: true } });
  }

  function undo() {
    const s = store.get().session;
    const prev = s && history.undo(s.take.notes);
    if (s && prev) store.set({ session: { ...s, take: { ...s.take, notes: prev }, edited: true } });
  }

  function redo() {
    const s = store.get().session;
    const next = s && history.redo(s.take.notes);
    if (s && next) store.set({ session: { ...s, take: { ...s.take, notes: next }, edited: true } });
  }

  function gridStep(s: Session): number | null {
    const { bpm, settings: st } = s.take;
    return bpm && st.quantize.enabled ? gridSeconds(bpm, st.quantize.grid) : null;
  }

  roll.onEdit = (notes, done) => {
    if (done) commit(notes);
    else announceSelection(notes);
  };
  roll.onSelect = () => announceSelection(store.get().session?.take.notes ?? []);
  roll.onSeek = (t) => {
    cursor = t;
    roll.cursor = t;
    roll.render();
    if (transport.playing) transport.restart();
  };
  roll.onAdd = (midi, t) =>
    withSession((s) => {
      const g = gridStep(s);
      const start = g ? (s.take.gridOffset ?? 0) + Math.floor((t - (s.take.gridOffset ?? 0)) / g) * g : t;
      const note: Note = { id: newId(), midi, start, dur: g ?? 0.25, velocity: 90 };
      roll.selected = new Set([note.id]);
      commit(addNote(s.take.notes, note));
    });

  function announceSelection(notes: Note[]) {
    const sel = notes.filter((n) => roll.selected.has(n.id));
    status.textContent =
      sel.length === 1
        ? `選取 ${midiName(sel[0].midi)}，${sel[0].start.toFixed(2)} 秒起，長 ${sel[0].dur.toFixed(2)} 秒`
        : sel.length > 1
          ? `選取 ${sel.length} 個音符`
          : '';
  }

  // ---------- 重新分析 ----------

  let analyzing = false;
  async function reanalyze(patch: TakePatch) {
    const s = store.get().session;
    if (!s || analyzing) return;
    analyzing = true;
    busy.hidden = false;
    try {
      const next = await analyzeSession({ ...s.take, ...patch }, s.samples);
      if (s.edited && !sameNotes(next.take.notes, s.take.notes)) {
        const ok = await confirmDialog('重新分析會覆蓋你手動改過的音符，確定嗎？', '重新分析');
        if (!ok) {
          settings.render(store.get().session);
          return;
        }
      }
      if (store.get().session?.take.id !== s.take.id) return; // 分析途中換了 take
      history.clear();
      roll.selected.clear();
      store.set({ session: next });
    } finally {
      analyzing = false;
      busy.hidden = true;
    }
  }

  // ---------- 畫面 ----------

  let shownId: string | null = null;
  function render() {
    const s = store.get().session;
    toolbar.hidden = !s;
    editor.hidden = !s;
    empty.hidden = !!s;
    if (!s) return;
    const { take, analysis } = s;
    const newTake = take.id !== shownId;
    if (newTake) {
      shownId = take.id;
      history.clear();
      roll.selected.clear();
      cursor = 0;
      roll.cursor = null;
      transport.stop();
    }
    const duration = s.samples.length / take.sampleRate;
    title.textContent = take.name;
    info.textContent = `${take.notes.length} 個音符 · ${formatClock(duration)} · ${take.bpm ? `${take.bpm} BPM` : '無 BPM'}`;
    const c = Math.round(analysis.tuningCents);
    const cents = `${c > 0 ? '+' : ''}${c} cents`;
    tuning.textContent = c === 0 ? '音準剛好對齊 A440' : take.settings.tuningCorrection ? `你這段整體偏 ${cents}，已校正` : `整體偏 ${cents}（未校正）`;
    undoBtn.disabled = !history.canUndo;
    redoBtn.disabled = !history.canRedo;

    const ids = new Set(take.notes.map((n) => n.id));
    roll.selected = new Set([...roll.selected].filter((id) => ids.has(id)));
    const g = gridStep(s);
    const origin = take.gridOffset ?? 0;
    roll.snapTime = g ? (t) => origin + Math.round((t - origin) / g) * g : null;
    roll.minDur = g ?? 0.03;
    roll.gridOffset = take.bpm ? origin : 0;
    roll.setData({ notes: take.notes, curve: { t: analysis.frames.map((f) => f.t), midi: analysis.curve }, duration, bpm: take.bpm }, newTake);
    settings.render(s);
  }

  store.subscribe((s, prev) => {
    if (s.session !== prev.session) render();
  });
  render();

  // ---------- 快捷鍵 ----------

  function selectedIds(): Set<string> {
    return new Set(roll.selected);
  }

  return {
    el,
    show() {
      el.classList.add('active');
      roll.render();
    },
    hide() {
      el.classList.remove('active');
      transport.stop();
    },
    onKey(e) {
      const s = store.get().session;
      if (!s) return false;
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) redo();
        else undo();
        return true;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        redo();
        return true;
      }
      if (mod || e.altKey) return false;
      switch (e.key) {
        case ' ':
          if (!e.repeat) transport.toggle();
          return true;
        case 'Enter':
          exportMidi(s);
          return true;
        case 'Delete':
        case 'Backspace':
          if (!roll.selected.size) return false;
          commit(deleteNotes(s.take.notes, selectedIds()));
          roll.selected.clear();
          return true;
        case 'ArrowUp':
        case 'ArrowDown':
          if (!roll.selected.size) return false;
          commit(transpose(s.take.notes, selectedIds(), e.key === 'ArrowUp' ? 1 : -1));
          announceSelection(store.get().session!.take.notes);
          return true;
        case 'ArrowLeft':
        case 'ArrowRight': {
          const current = [...roll.selected].pop() ?? null;
          const id = neighborId(s.take.notes, current, e.key === 'ArrowRight' ? 1 : -1);
          roll.selected = new Set(id ? [id] : []);
          const n = s.take.notes.find((x) => x.id === id);
          if (n) roll.follow(n.start);
          roll.render();
          announceSelection(s.take.notes);
          return true;
        }
        case 'Escape':
          roll.selected.clear();
          roll.render();
          return true;
      }
      return false;
    },
  };
}
