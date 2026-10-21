// 鋼琴捲軸（Canvas）。縱軸音高、左側琴鍵（標出每個 C）；橫軸有 BPM 時顯示小節／拍，沒有時顯示秒。
// 原始音高曲線半透明畫在音符後面，讓人一眼看出切分是否合理。

import { MIN_DUR, moveNotes } from '../app/edit-ops';
import { isBlackKey, midiName } from '../music';
import type { Note } from '../types';
import { cssVar, fitCanvas, h } from './dom';

export const KEY_W = 54;
export const RULER_H = 24;
const MIN_RANGE = 24; // 至少顯示兩個八度
const BEATS_PER_BAR = 4;

export type RollCurve = { t: ArrayLike<number>; midi: ArrayLike<number> };

export type RollData = {
  notes: Note[];
  curve: RollCurve | null;
  duration: number; // 秒
  bpm: number | null;
};

export type RollView = {
  t0: number; // 左緣的時間（秒）
  pxPerSec: number;
  low: number; // 最下面一列的 midi
  high: number; // 最上面一列的 midi（含）
};

type Drag =
  | { kind: 'move'; x0: number; y0: number; orig: Note[]; anchor: Note; moved: boolean }
  | { kind: 'resize'; x0: number; orig: Note[]; note: Note; moved: boolean }
  | { kind: 'seek' };

const EDGE_PX = 7; // 音符右緣多寬的範圍可以拖曳改長度

export class PianoRoll {
  readonly el: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  data: RollData = { notes: [], curve: null, duration: 0, bpm: null };
  view: RollView = { t0: 0, pxPerSec: 100, low: 48, high: 72 };
  selected = new Set<string>();
  playhead: number | null = null;
  /** 播放起點（點時間尺設定）。 */
  cursor: number | null = null;
  /** 第 1 小節第 1 拍的位置（秒），小節線從這裡畫起。 */
  gridOffset = 0;

  // ---- 編輯 ----
  editable = false;
  /** 拖曳、新增時把時間吸到格線；null = 不吸附。 */
  snapTime: ((t: number) => number) | null = null;
  minDur = MIN_DUR;
  /** 拖曳中（commit = false，只是預覽）與放開時（commit = true）呼叫。 */
  onEdit: ((notes: Note[], commit: boolean) => void) | null = null;
  onSelect: (() => void) | null = null;
  onSeek: ((t: number) => void) | null = null;
  onAdd: ((midi: number, t: number) => void) | null = null;
  /** 有東西改了視圖（捲動、縮放）時呼叫。 */
  onViewChange: (() => void) | null = null;

  private frame = 0;
  private size = { w: 1, h: 1 };
  private drag: Drag | null = null;

  constructor(label = '鋼琴捲軸') {
    this.canvas = h('canvas', { role: 'img', 'aria-label': label });
    this.el = h('div', { class: 'roll panel' }, this.canvas);
    new ResizeObserver(() => this.render()).observe(this.el);
    this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
    this.canvas.addEventListener('pointercancel', () => this.cancelDrag());
    this.canvas.addEventListener('dblclick', (e) => this.onDoubleClick(e));
  }

  // ---------- 滑鼠編輯 ----------

  private local(e: MouseEvent) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onEdge(n: Note, x: number) {
    const right = this.timeToX(n.start + n.dur);
    return x >= right - Math.min(EDGE_PX, (n.dur * this.view.pxPerSec) / 3) && x <= right + 2;
  }

  private onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    const { x, y } = this.local(e);
    if (x < KEY_W) return;
    this.canvas.setPointerCapture(e.pointerId);
    if (y < RULER_H) {
      this.drag = { kind: 'seek' };
      this.onSeek?.(Math.max(0, this.xToTime(x)));
      return;
    }
    if (!this.editable) return;
    const n = this.noteAt(x, y) ?? this.noteAt(x - 3, y);
    if (!n) {
      if (!e.shiftKey && this.selected.size) {
        this.selected.clear();
        this.onSelect?.();
        this.render();
      }
      return;
    }
    if (e.shiftKey) {
      if (this.selected.has(n.id)) this.selected.delete(n.id);
      else this.selected.add(n.id);
    } else if (!this.selected.has(n.id)) {
      this.selected = new Set([n.id]);
    }
    this.onSelect?.();
    const orig = this.data.notes;
    this.drag = this.onEdge(n, x) ? { kind: 'resize', x0: x, orig, note: n, moved: false } : { kind: 'move', x0: x, y0: y, orig, anchor: n, moved: false };
    this.render();
  }

  private onPointerMove(e: PointerEvent) {
    const { x, y } = this.local(e);
    const d = this.drag;
    if (!d) {
      this.updateCursor(x, y);
      return;
    }
    if (d.kind === 'seek') {
      this.onSeek?.(Math.max(0, this.xToTime(x)));
      return;
    }
    const dtRaw = (x - d.x0) / this.view.pxPerSec;
    if (d.kind === 'move') {
      if (!d.moved && Math.abs(x - d.x0) < 3 && Math.abs(y - d.y0) < 3) return;
      d.moved = true;
      const dMidi = this.yToMidi(y) - this.yToMidi(d.y0);
      let dt = dtRaw;
      if (this.snapTime) dt = this.snapTime(d.anchor.start + dtRaw) - d.anchor.start;
      this.data = { ...this.data, notes: moveNotes(d.orig, this.selected, dMidi, dt) };
    } else {
      if (!d.moved && Math.abs(x - d.x0) < 2) return;
      d.moved = true;
      let end = d.note.start + d.note.dur + dtRaw;
      if (this.snapTime) end = this.snapTime(end);
      const dur = Math.max(this.minDur, end - d.note.start);
      this.data = { ...this.data, notes: d.orig.map((n) => (n.id === d.note.id ? { ...n, dur } : n)) };
    }
    this.onEdit?.(this.data.notes, false);
    this.render();
  }

  private onPointerUp(e: PointerEvent) {
    const d = this.drag;
    this.drag = null;
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    if (d && d.kind !== 'seek' && d.moved) this.onEdit?.(this.data.notes, true);
  }

  private cancelDrag() {
    const d = this.drag;
    this.drag = null;
    if (d && d.kind !== 'seek' && d.moved) {
      this.data = { ...this.data, notes: d.orig };
      this.onEdit?.(d.orig, false);
      this.render();
    }
  }

  private onDoubleClick(e: MouseEvent) {
    if (!this.editable) return;
    const { x, y } = this.local(e);
    if (x < KEY_W || y < RULER_H || this.noteAt(x, y)) return;
    this.onAdd?.(this.yToMidi(y), Math.max(0, this.xToTime(x)));
  }

  private updateCursor(x: number, y: number) {
    let cursor = 'default';
    if (x >= KEY_W && y < RULER_H) cursor = 'col-resize';
    else if (this.editable && x >= KEY_W) {
      const n = this.noteAt(x, y) ?? this.noteAt(x - 3, y);
      cursor = n ? (this.onEdge(n, x) ? 'ew-resize' : 'grab') : 'crosshair';
    }
    this.canvas.style.cursor = cursor;
  }

  private pendingFit = false;

  /** fit = true：下次畫的時候（看得到、量得到大小時）自動捲到音符所在的範圍。 */
  setData(data: RollData, fit = false) {
    this.data = data;
    if (fit) this.pendingFit = true;
    this.render();
  }

  /** 自動捲到有音符的音域，橫向整段放進畫面。 */
  fit() {
    const { w } = this.size;
    const pitches: number[] = this.data.notes.map((n) => n.midi);
    const c = this.data.curve;
    if (c) for (let i = 0; i < c.midi.length; i++) if (!Number.isNaN(c.midi[i])) pitches.push(c.midi[i]);
    let low = 48;
    let high = 72;
    if (pitches.length) {
      low = Math.floor(Math.min(...pitches)) - 3;
      high = Math.ceil(Math.max(...pitches)) + 3;
    }
    if (high - low + 1 < MIN_RANGE) {
      const extra = MIN_RANGE - (high - low + 1);
      low -= Math.floor(extra / 2);
      high += Math.ceil(extra / 2);
    }
    const dur = Math.max(1, this.data.duration);
    this.view = { t0: 0, pxPerSec: Math.max(30, (w - KEY_W - 16) / dur), low: Math.max(0, low), high: Math.min(127, high) };
  }

  // ---------- 座標換算 ----------

  timeToX(t: number) {
    return KEY_W + (t - this.view.t0) * this.view.pxPerSec;
  }

  xToTime(x: number) {
    return this.view.t0 + (x - KEY_W) / this.view.pxPerSec;
  }

  get rowH() {
    return (this.size.h - RULER_H) / (this.view.high - this.view.low + 1);
  }

  /** 該音高那一列的上緣 y。 */
  midiToY(m: number) {
    return RULER_H + (this.view.high - m) * this.rowH;
  }

  /** 連續音高（列中心）→ y */
  pitchToY(m: number) {
    return RULER_H + (this.view.high + 0.5 - m) * this.rowH;
  }

  yToMidi(y: number) {
    return Math.floor(this.view.high + 1 - (y - RULER_H) / this.rowH);
  }

  noteAt(x: number, y: number): Note | null {
    const t = this.xToTime(x);
    const m = this.yToMidi(y);
    for (let i = this.data.notes.length - 1; i >= 0; i--) {
      const n = this.data.notes[i];
      if (n.midi === m && t >= n.start && t <= n.start + n.dur) return n;
    }
    return null;
  }

  // ---------- 捲動、縮放 ----------

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) {
      // 以游標位置為中心縮放時間軸（觸控板捏合也是 ctrl+wheel）
      const t = this.xToTime(e.clientX - rect.left);
      const factor = Math.exp(-e.deltaY * 0.01);
      this.view.pxPerSec = Math.min(2000, Math.max(10, this.view.pxPerSec * factor));
      this.view.t0 = t - (e.clientX - rect.left - KEY_W) / this.view.pxPerSec;
    } else {
      const dx = e.shiftKey ? e.deltaY : e.deltaX;
      const dy = e.shiftKey ? 0 : e.deltaY;
      this.view.t0 += dx / this.view.pxPerSec;
      const rows = dy / Math.max(4, this.rowH);
      if (Math.abs(rows) > 0) this.scrollPitch(rows);
    }
    this.clampView();
    this.render();
    this.onViewChange?.();
  }

  private pitchScroll = 0;
  private scrollPitch(rows: number) {
    this.pitchScroll += rows;
    const step = Math.trunc(this.pitchScroll);
    if (!step) return;
    this.pitchScroll -= step;
    const span = this.view.high - this.view.low;
    const high = Math.min(127, Math.max(span, this.view.high - step));
    this.view.high = high;
    this.view.low = high - span;
  }

  clampView() {
    const visible = (this.size.w - KEY_W) / this.view.pxPerSec;
    const maxT0 = Math.max(0, this.data.duration - visible * 0.5);
    this.view.t0 = Math.min(maxT0, Math.max(-0.5, this.view.t0));
  }

  /** 播放頭超出畫面時跟著捲。 */
  follow(t: number) {
    const visible = (this.size.w - KEY_W) / this.view.pxPerSec;
    if (t < this.view.t0 || t > this.view.t0 + visible * 0.9) {
      this.view.t0 = Math.max(0, t - visible * 0.1);
      this.onViewChange?.();
    }
  }

  // ---------- 繪製 ----------

  render() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  private draw() {
    if (!this.canvas.isConnected || this.canvas.getClientRects().length === 0) return;
    const { w, h: H, ctx } = fitCanvas(this.canvas);
    this.size = { w, h: H };
    if (this.pendingFit) {
      this.pendingFit = false;
      this.fit();
    }
    const v = this.view;
    const rowH = this.rowH;
    const colors = {
      bg: cssVar('--panel'),
      black: cssVar('--bg'),
      grid: cssVar('--grid'),
      gridStrong: cssVar('--grid-strong'),
      ink: cssVar('--ink'),
      muted: cssVar('--muted'),
      curve: cssVar('--curve'),
      note: cssVar('--note'),
      sel: cssVar('--note-sel'),
      noteInk: cssVar('--accent-ink'),
      keyW: cssVar('--key-white'),
      keyB: cssVar('--key-black'),
      rec: cssVar('--rec'),
    };

    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, w, H);

    // 列：黑鍵那一列稍暗；每個 C 畫粗線
    for (let m = v.low; m <= v.high; m++) {
      const y = this.midiToY(m);
      if (isBlackKey(m)) {
        ctx.fillStyle = colors.black;
        ctx.globalAlpha = 0.45;
        ctx.fillRect(KEY_W, y, w - KEY_W, rowH);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = m % 12 === 0 ? colors.gridStrong : colors.grid;
      ctx.fillRect(KEY_W, Math.round(y + rowH) - (m % 12 === 0 ? 1 : 0), w - KEY_W, m % 12 === 0 ? 2 : 1);
    }

    this.drawTimeGrid(ctx, w, H, colors);

    ctx.save();
    ctx.beginPath();
    ctx.rect(KEY_W, RULER_H, w - KEY_W, H - RULER_H);
    ctx.clip();

    // 原始音高曲線（半透明，在音符後面）
    const c = this.data.curve;
    if (c) {
      ctx.strokeStyle = colors.curve;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let pen = false;
      const tMin = v.t0 - 0.1;
      const tMax = this.xToTime(w) + 0.1;
      for (let i = 0; i < c.midi.length; i++) {
        const t = c.t[i];
        const m = c.midi[i];
        if (t < tMin || t > tMax || Number.isNaN(m)) {
          pen = false;
          continue;
        }
        const x = this.timeToX(t);
        const y = this.pitchToY(m);
        if (pen) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
        pen = true;
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // 音符
    ctx.font = `600 ${Math.min(12, Math.max(9, rowH - 4))}px ${cssVar('--mono')}`;
    ctx.textBaseline = 'middle';
    for (const n of this.data.notes) {
      if (n.midi < v.low || n.midi > v.high) continue;
      const x = this.timeToX(n.start);
      const nw = Math.max(3, n.dur * v.pxPerSec);
      if (x > w || x + nw < KEY_W) continue;
      const y = this.midiToY(n.midi);
      const sel = this.selected.has(n.id);
      ctx.fillStyle = sel ? colors.sel : colors.note;
      // 稍微透明：音符底下的原始音高曲線看得到
      ctx.globalAlpha = 0.82;
      ctx.fillRect(x, y + 1, nw, rowH - 2);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = colors.noteInk;
      ctx.lineWidth = sel ? 2.5 : 1.5;
      ctx.strokeRect(x + 0.75, y + 1.75, nw - 1.5, rowH - 3.5);
      if (nw > 30 && rowH >= 11) {
        ctx.fillStyle = colors.noteInk;
        ctx.fillText(midiName(n.midi), x + 5, y + rowH / 2 + 0.5);
      }
    }

    // 播放起點
    if (this.cursor !== null && this.playhead === null) {
      const x = Math.round(this.timeToX(this.cursor));
      ctx.fillStyle = colors.ink;
      for (let yy = RULER_H; yy < H; yy += 8) ctx.fillRect(x - 1, yy, 2, 4);
    }

    // 播放頭
    if (this.playhead !== null) {
      const x = this.timeToX(this.playhead);
      ctx.fillStyle = colors.rec;
      ctx.fillRect(Math.round(x) - 1, RULER_H, 2, H - RULER_H);
    }
    ctx.restore();

    this.drawKeys(ctx, H, colors);
  }

  private drawTimeGrid(ctx: CanvasRenderingContext2D, w: number, H: number, colors: Record<string, string>) {
    const v = this.view;
    const tEnd = this.xToTime(w);
    ctx.fillStyle = colors.bg;
    ctx.fillRect(KEY_W, 0, w - KEY_W, RULER_H);
    ctx.fillStyle = colors.ink;
    ctx.fillRect(KEY_W, RULER_H - 2, w - KEY_W, 2);
    ctx.font = `11px ${cssVar('--mono')}`;
    ctx.textBaseline = 'middle';

    const lines: { t: number; strong: boolean; label?: string }[] = [];
    if (this.data.bpm) {
      const beat = 60 / this.data.bpm;
      const o = this.gridOffset;
      // 拍子太密就只畫小節線
      const showBeats = beat * v.pxPerSec >= 12;
      const first = Math.floor((Math.max(0, v.t0) - o) / beat);
      for (let b = first; o + b * beat <= tEnd; b++) {
        const bar = ((b % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR === 0;
        if (!bar && !showBeats) continue;
        const barNo = Math.floor(b / BEATS_PER_BAR) + 1;
        const labelEvery = Math.max(1, Math.ceil(40 / (beat * BEATS_PER_BAR * v.pxPerSec)));
        const label = bar && barNo >= 1 && (barNo - 1) % labelEvery === 0 ? String(barNo) : undefined;
        lines.push({ t: o + b * beat, strong: bar, label });
      }
    } else {
      const step = niceStep(70 / v.pxPerSec);
      const first = Math.floor(Math.max(0, v.t0) / step);
      for (let k = first; k * step <= tEnd; k++) {
        const t = k * step;
        const whole = Math.abs(t - Math.round(t)) < 1e-6;
        lines.push({ t, strong: whole, label: `${Number(t.toFixed(2))}s` });
      }
    }
    for (const ln of lines) {
      const x = Math.round(this.timeToX(ln.t));
      if (x < KEY_W) continue;
      ctx.fillStyle = ln.strong ? colors.gridStrong : colors.grid;
      ctx.fillRect(x, RULER_H, ln.strong ? 2 : 1, H - RULER_H);
      if (ln.label) {
        ctx.fillStyle = colors.muted;
        ctx.fillText(ln.label, x + 4, RULER_H / 2);
      }
    }
    const marker = this.playhead ?? this.cursor;
    if (marker !== null) {
      const x = this.timeToX(marker);
      if (x >= KEY_W) {
        ctx.fillStyle = this.playhead !== null ? colors.rec : colors.ink;
        ctx.beginPath();
        ctx.moveTo(x - 6, 2);
        ctx.lineTo(x + 6, 2);
        ctx.lineTo(x, RULER_H - 4);
        ctx.fill();
      }
    }
  }

  private drawKeys(ctx: CanvasRenderingContext2D, H: number, colors: Record<string, string>) {
    const v = this.view;
    const rowH = this.rowH;
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, KEY_W, H);
    for (let m = v.low; m <= v.high; m++) {
      const y = this.midiToY(m);
      const black = isBlackKey(m);
      ctx.fillStyle = black ? colors.keyB : colors.keyW;
      ctx.fillRect(0, y, black ? KEY_W * 0.62 : KEY_W - 2, rowH);
      ctx.fillStyle = colors.bg;
      ctx.fillRect(0, Math.round(y + rowH) - 1, KEY_W - 2, 1);
      if (m % 12 === 0 && rowH >= 7) {
        ctx.fillStyle = colors.noteInk;
        ctx.font = `700 ${Math.min(11, rowH)}px ${cssVar('--mono')}`;
        ctx.textBaseline = 'middle';
        ctx.fillText(midiName(m), KEY_W - 26, y + rowH / 2);
      }
    }
    ctx.fillStyle = colors.ink;
    ctx.fillRect(KEY_W - 2, RULER_H, 2, H - RULER_H);
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, KEY_W, RULER_H);
    ctx.fillStyle = colors.ink;
    ctx.fillRect(0, RULER_H - 2, KEY_W, 2);
    ctx.fillStyle = colors.muted;
    ctx.font = `11px ${cssVar('--mono')}`;
    ctx.fillText(this.data.bpm ? 'bar' : 'sec', 8, RULER_H / 2);
  }
}

/** 0.1、0.25、0.5、1、2、5、10… 中不小於 x 的最小值。 */
function niceStep(x: number): number {
  const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60];
  return steps.find((s) => s >= x) ?? 60;
}
