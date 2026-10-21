// 編輯頁：鋼琴捲軸＋匯出。

import { store, type Session } from '../app/state';
import { encodeWav } from '../audio/wav';
import { buildMidi, exportFileName } from '../midi/export';
import { formatClock } from '../music';
import { download, h } from './dom';
import type { Page } from './page';
import { PianoRoll } from './pianoroll';

export function exportMidi(session: Session) {
  const { take } = session;
  const bytes = buildMidi({ bpm: take.bpm, tracks: [{ name: 'Hum', notes: take.notes }], title: take.name });
  download(bytes, exportFileName(new Date(), 'mid'), 'audio/midi');
}

export function exportWav(session: Session) {
  download(encodeWav(session.samples, session.take.sampleRate), exportFileName(new Date(), 'wav'), 'audio/wav');
}

export function createEditPage(): Page {
  const roll = new PianoRoll('鋼琴捲軸：音符與原始音高曲線');
  const title = h('span', { class: 'title' });
  const info = h('span', { class: 'muted small num' });
  const tuning = h('span', { class: 'badge' });
  const midiBtn = h('button', { class: 'btn primary', 'aria-label': '匯出 MIDI（Enter）', onclick: () => withSession(exportMidi) }, '⬇ 匯出 MIDI', h('kbd', { class: 'small' }, '⏎'));
  const wavBtn = h('button', { class: 'btn', 'aria-label': '匯出 WAV', onclick: () => withSession(exportWav) }, '⬇ WAV');
  const toolbar = h('div', { class: 'toolbar panel' }, title, info, tuning, h('span', { class: 'spacer' }), wavBtn, midiBtn);
  const editor = h('div', { class: 'editor' }, roll.el);
  const empty = h('div', { class: 'empty' }, h('div', {}, h('p', {}, '還沒有錄音。'), h('p', { class: 'small' }, '到「錄音」頁按空白鍵開始，停止後會自動轉成音符出現在這裡。')));
  const el = h('section', { class: 'page', 'aria-label': '編輯' }, toolbar, editor, empty);

  function withSession(fn: (s: Session) => void) {
    const s = store.get().session;
    if (s) fn(s);
  }

  let shown: Session | null = null;
  function render(fit: boolean) {
    const s = store.get().session;
    toolbar.hidden = !s;
    editor.hidden = !s;
    empty.hidden = !!s;
    if (!s) return;
    const { take, analysis } = s;
    const duration = s.samples.length / take.sampleRate;
    title.textContent = take.name;
    info.textContent = `${take.notes.length} 個音符 · ${formatClock(duration)} · ${take.bpm ? `${take.bpm} BPM` : '無 BPM'}`;
    const c = Math.round(analysis.tuningCents);
    const cents = `${c > 0 ? '+' : ''}${c} cents`;
    tuning.textContent = c === 0 ? '音準剛好對齊 A440' : take.settings.tuningCorrection ? `你這段整體偏 ${cents}，已校正` : `整體偏 ${cents}（未校正）`;
    roll.setData(
      { notes: take.notes, curve: { t: analysis.frames.map((f) => f.t), midi: analysis.curve }, duration, bpm: take.bpm },
      fit,
    );
  }

  store.subscribe((s, prev) => {
    if (s.session !== prev.session) {
      const fit = s.session?.take.id !== shown?.take.id;
      shown = s.session;
      render(fit);
    }
  });
  render(true);

  return {
    el,
    show() {
      el.classList.add('active');
      roll.render();
    },
    hide() {
      el.classList.remove('active');
    },
    onKey(e) {
      if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
        withSession(exportMidi);
        return true;
      }
      return false;
    },
  };
}
