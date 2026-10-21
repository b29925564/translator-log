// 錄音頁：中央大圓鍵、狀態（待命／預備拍／錄音中／分析中）、即時音高曲線＋調音器、節拍器設定。

import { recording } from '../app/recording';
import { setPrefs, store, type AppState, type RecStatus } from '../app/state';
import { outputLatency } from '../audio/context';
import { BPM_MAX, BPM_MIN } from '../audio/metronome';
import { MAX_SECONDS } from '../audio/recorder';
import { formatClock, isBlackKey, midiName } from '../music';
import { cssVar, fitCanvas, h } from './dom';
import type { Page } from './page';

const HISTORY_SEC = 8;
const LABEL: Record<RecStatus, string> = {
  idle: '待命',
  opening: '開啟麥克風…',
  countin: '預備拍',
  recording: '錄音中',
  analyzing: '分析中…',
};
const BUTTON: Record<RecStatus, string> = {
  idle: '開始錄音',
  opening: '請稍候',
  countin: '取消',
  recording: '停止',
  analyzing: '分析中',
};

export function createRecordPage(): Page {
  const canvas = h('canvas', { role: 'img', 'aria-label': '即時音高曲線' });
  const tunerNote = h('div', { class: 'tuner-note num' }, '–');
  const tunerCents = h('div', { class: 'tuner-cents num' }, ' ');
  const needle = h('div', { class: 'tuner-needle' });
  const live = h(
    'div',
    { class: 'live panel' },
    canvas,
    h('div', { class: 'tuner', 'aria-hidden': 'true' }, tunerNote, h('div', { class: 'tuner-meter' }, needle), tunerCents),
  );

  const dot = h('span', { class: 'dot' });
  const statusText = h('span', {}, LABEL.idle);
  const clock = h('span', { class: 'clock num' });
  const statusLine = h('div', { class: 'status-line', 'data-status': 'idle' }, dot, statusText, clock);
  const countBig = h('div', { class: 'count-big num', hidden: true });
  const sub = h('div', { class: 'muted' }, '按空白鍵開始錄音，再按一次停止。');
  const error = h('div', { class: 'error', role: 'alert' });
  const status = h('div', { class: 'status', 'aria-live': 'polite' }, statusLine, countBig, sub, error);

  const btnLabel = h('span', {}, BUTTON.idle);
  const button = h(
    'button',
    { class: 'rec-button', 'data-status': 'idle', 'aria-label': '開始錄音（空白鍵）', onclick: () => recording.toggle() },
    h('span', {}, h('span', { class: 'glyph', style: 'display:block;margin:0 auto 6px' }), btnLabel),
  );

  const prefs = store.get().prefs;
  const metroBox = h('input', {
    type: 'checkbox',
    checked: prefs.metronome,
    'aria-label': '節拍器',
    onchange: () => setPrefs({ metronome: metroBox.checked }),
  });
  const bpmInput = h('input', {
    type: 'number',
    min: BPM_MIN,
    max: BPM_MAX,
    step: 1,
    value: prefs.bpm,
    class: 'num',
    'aria-label': 'BPM',
    onchange: () => {
      const v = Math.round(Number(bpmInput.value));
      const bpm = Number.isFinite(v) ? Math.min(BPM_MAX, Math.max(BPM_MIN, v)) : store.get().prefs.bpm;
      bpmInput.value = String(bpm);
      setPrefs({ bpm });
    },
  });
  const latencyValue = h('span', { class: 'num small' });
  const latency = h('input', {
    type: 'range',
    min: -150,
    max: 150,
    step: 5,
    value: prefs.latencyOffsetMs,
    'aria-label': '延遲補償（毫秒）',
    oninput: () => setPrefs({ latencyOffsetMs: Number(latency.value) }),
  });
  const sysLatency = h('span', { class: 'muted small num' });
  const controls = h(
    'div',
    { class: 'controls' },
    h('div', { class: 'row' }, h('label', { class: 'field' }, metroBox, '節拍器（1 小節預備拍）'), h('label', { class: 'field' }, 'BPM', bpmInput)),
    h('div', { class: 'row' }, h('label', { class: 'field' }, '延遲補償', latency, latencyValue), sysLatency),
    h('div', { class: 'muted small' }, '藍牙耳機的麥克風收音品質通常較差，建議用內建或有線麥克風。'),
    h('div', { class: 'muted small', 'data-metronome-hint': true }, '開節拍器時建議戴耳機，免得拍子聲被錄進去。'),
  );

  const metroHint = controls.querySelector<HTMLElement>('[data-metronome-hint]')!;
  const el = h('section', { class: 'page', 'aria-label': '錄音' }, live, h('div', { class: 'deck' }, status, button, controls));

  // ---------- 狀態 → 畫面 ----------

  function renderStatus(s: AppState) {
    const st = s.rec.status;
    statusLine.dataset.status = st;
    button.dataset.status = st;
    statusText.textContent = LABEL[st];
    btnLabel.textContent = BUTTON[st];
    button.setAttribute('aria-label', st === 'recording' ? '停止錄音（空白鍵）' : st === 'countin' ? '取消預備拍（空白鍵）' : '開始錄音（空白鍵）');
    button.disabled = st === 'opening' || st === 'analyzing';
    countBig.hidden = st !== 'countin';
    countBig.textContent = String(s.rec.count || '');
    sub.textContent =
      st === 'recording'
        ? `再按一次空白鍵停止（最長 ${MAX_SECONDS / 60} 分鐘）`
        : st === 'countin'
          ? '跟著拍子，第 1 小節開始唱。再按一次空白鍵取消。'
          : st === 'analyzing'
            ? '正在把音高轉成音符…'
            : '按空白鍵開始錄音，再按一次停止。';
    error.textContent = s.rec.error ?? '';
    if (st !== 'recording') clock.textContent = '';
    const busy = st !== 'idle';
    metroBox.disabled = busy;
    bpmInput.disabled = busy;
    latency.disabled = busy;
    latencyValue.textContent = `${s.prefs.latencyOffsetMs > 0 ? '+' : ''}${s.prefs.latencyOffsetMs} ms`;
    metroHint.hidden = !s.prefs.metronome;
  }

  store.subscribe((s, prev) => {
    if (s.rec !== prev.rec || s.prefs !== prev.prefs) renderStatus(s);
  });
  renderStatus(store.get());

  // ---------- 即時音高 ----------

  const history: { t: number; m: number | null }[] = [];
  let raf = 0;
  let center = 60;

  function loop() {
    raf = requestAnimationFrame(loop);
    const now = performance.now() / 1000;
    const reading = recording.live?.read();
    history.push({ t: now, m: reading?.midi ?? null });
    while (history.length && history[0].t < now - HISTORY_SEC) history.shift();

    if (store.get().rec.status === 'recording') clock.textContent = formatClock((performance.now() - recording.startedAt) / 1000);

    if (reading?.midi != null) {
      const cents = Math.round((reading.midi - Math.round(reading.midi)) * 100);
      tunerNote.textContent = midiName(reading.midi);
      tunerCents.textContent = `${cents > 0 ? '+' : ''}${cents}¢`;
      needle.style.left = `${50 + cents}%`;
      center += (reading.midi - center) * 0.05;
    }
    draw(now);
  }

  function draw(now: number) {
    const { w, h: H, ctx } = fitCanvas(canvas);
    ctx.fillStyle = cssVar('--panel');
    ctx.fillRect(0, 0, w, H);
    const span = 24;
    const high = Math.round(center) + span / 2;
    const rowH = H / span;
    const y = (m: number) => (high + 0.5 - m) * rowH;
    ctx.font = `11px ${cssVar('--mono')}`;
    ctx.textBaseline = 'middle';
    for (let m = high - span + 1; m <= high; m++) {
      const top = y(m) - rowH / 2;
      if (isBlackKey(m)) {
        ctx.fillStyle = cssVar('--bg');
        ctx.globalAlpha = 0.45;
        ctx.fillRect(0, top, w, rowH);
        ctx.globalAlpha = 1;
      }
      if (m % 12 === 0) {
        ctx.fillStyle = cssVar('--grid-strong');
        ctx.fillRect(0, Math.round(top + rowH) - 1, w, 2);
        ctx.fillStyle = cssVar('--muted');
        ctx.fillText(midiName(m), 8, y(m));
      }
    }
    if (!recording.live) {
      ctx.fillStyle = cssVar('--muted');
      ctx.font = `14px ${cssVar('--sans')}`;
      ctx.textAlign = 'center';
      ctx.fillText('麥克風還沒開啟：按空白鍵或中間的按鈕開始錄音', w / 2, H / 2);
      ctx.textAlign = 'start';
      return;
    }
    // 往左捲動：右緣是現在
    const pxPerSec = w / HISTORY_SEC;
    ctx.strokeStyle = cssVar(store.get().rec.status === 'recording' ? '--rec' : '--curve');
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    let pen = false;
    for (const p of history) {
      if (p.m === null) {
        pen = false;
        continue;
      }
      const x = w - (now - p.t) * pxPerSec;
      if (pen) ctx.lineTo(x, y(p.m));
      else ctx.moveTo(x, y(p.m));
      pen = true;
    }
    ctx.stroke();
  }

  function showLatency() {
    const ctx = recording.recorder?.ctx;
    const ms = ctx ? Math.round(outputLatency(ctx) * 1000) : 0;
    sysLatency.textContent = ms ? `系統輸出延遲 ${ms} ms（已自動補償）` : '';
  }
  store.subscribe((s, prev) => {
    if (s.rec.status === 'recording' && prev.rec.status !== 'recording') showLatency();
  });

  return {
    el,
    show() {
      el.classList.add('active');
      if (!raf) raf = requestAnimationFrame(loop);
      void recording.warmUp().then(showLatency);
    },
    hide() {
      el.classList.remove('active');
      cancelAnimationFrame(raf);
      raf = 0;
      recording.release();
    },
    onKey(e) {
      if (e.code === 'Space') {
        if (!e.repeat) recording.toggle();
        return true;
      }
      if (e.key === 'Escape' && store.get().rec.status === 'countin') {
        recording.cancel();
        return true;
      }
      return false;
    },
  };
}
