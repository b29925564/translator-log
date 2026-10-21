// 波形顯示（可選擇框選一段）。說話變唱歌第 1 步用來顯示那句話、從長錄音裡框選片段。

import { cssVar, fitCanvas, h } from './dom';

export class Waveform {
  readonly el: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  private samples: Float32Array | null = null;
  private sampleRate = 48000;
  selection: [number, number] | null = null;
  selectable = false;
  playhead: number | null = null;
  onSelect: ((sel: [number, number]) => void) | null = null;
  private anchor: number | null = null;
  private frame = 0;

  constructor(label: string) {
    this.canvas = h('canvas', { role: 'img', 'aria-label': label });
    this.el = h('div', { class: 'wave' }, this.canvas);
    new ResizeObserver(() => this.render()).observe(this.el);
    this.canvas.addEventListener('pointerdown', (e) => {
      if (!this.selectable || !this.samples) return;
      this.canvas.setPointerCapture(e.pointerId);
      this.anchor = this.timeAt(e);
      this.selection = [this.anchor, this.anchor];
      this.render();
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (this.anchor === null) return;
      const t = this.timeAt(e);
      this.selection = [Math.min(this.anchor, t), Math.max(this.anchor, t)];
      this.render();
    });
    this.canvas.addEventListener('pointerup', () => {
      if (this.anchor === null) return;
      this.anchor = null;
      if (this.selection) this.onSelect?.(this.selection);
    });
  }

  get duration() {
    return this.samples ? this.samples.length / this.sampleRate : 0;
  }

  setAudio(samples: Float32Array | null, sampleRate = this.sampleRate) {
    this.samples = samples;
    this.sampleRate = sampleRate;
    this.render();
  }

  private timeAt(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    return Math.max(0, Math.min(this.duration, ((e.clientX - r.left) / r.width) * this.duration));
  }

  render() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  private draw() {
    if (!this.canvas.isConnected || !this.canvas.getClientRects().length) return;
    const { w, h: H, ctx } = fitCanvas(this.canvas);
    ctx.fillStyle = cssVar('--bg');
    ctx.fillRect(0, 0, w, H);
    const s = this.samples;
    if (!s || !s.length) return;
    const x = (t: number) => (t / this.duration) * w;
    if (this.selection) {
      ctx.fillStyle = cssVar('--accent');
      ctx.globalAlpha = 0.25;
      ctx.fillRect(x(this.selection[0]), 0, Math.max(2, x(this.selection[1]) - x(this.selection[0])), H);
      ctx.globalAlpha = 1;
    }
    let peak = 1e-4;
    for (let i = 0; i < s.length; i += 7) peak = Math.max(peak, Math.abs(s[i]));
    const per = s.length / w;
    ctx.fillStyle = cssVar('--curve');
    for (let px = 0; px < w; px++) {
      let lo = 0;
      let hi = 0;
      const a = Math.floor(px * per);
      const b = Math.min(s.length, Math.floor((px + 1) * per));
      for (let i = a; i < b; i++) {
        if (s[i] < lo) lo = s[i];
        if (s[i] > hi) hi = s[i];
      }
      const y0 = H / 2 - (hi / peak) * (H / 2 - 4);
      const y1 = H / 2 - (lo / peak) * (H / 2 - 4);
      ctx.fillRect(px, y0, 1, Math.max(1, y1 - y0));
    }
    if (this.playhead !== null) {
      ctx.fillStyle = cssVar('--rec');
      ctx.fillRect(Math.round(x(this.playhead)) - 1, 0, 2, H);
    }
  }
}
