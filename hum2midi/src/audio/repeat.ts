// 說話變唱歌第 2 步：把同一句話原封不動地重複播放 N 次。
// 錯覺的前提是每一次都是「完全相同」的音訊：同一個 AudioBuffer、直接接到輸出，
// 不移調、不加效果、不做時間伸縮，循環途中也不改任何處理。全部用 AudioContext 時間一次排好。

import { outputLatency } from './context';

export type RepeatState = { index: number; phase: 'playing' | 'gap' } | { index: number; phase: 'done' };

export class RepeatPlayer {
  private sources: AudioBufferSourceNode[] = [];
  private t0 = 0;
  private len = 0;
  private gap = 0;
  private count = 0;
  private timer = 0;
  onDone: (() => void) | null = null;

  constructor(private ctx: AudioContext) {}

  get running() {
    return this.sources.length > 0;
  }

  start(samples: Float32Array, sampleRate: number, repeats: number, gap: number) {
    this.stop();
    const buf = this.ctx.createBuffer(1, samples.length, sampleRate);
    buf.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
    this.len = buf.duration;
    this.gap = gap;
    this.count = repeats;
    this.t0 = this.ctx.currentTime + 0.15;
    for (let i = 0; i < repeats; i++) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.ctx.destination);
      src.start(this.t0 + i * (this.len + gap));
      this.sources.push(src);
    }
    const total = repeats * (this.len + gap) - gap;
    this.timer = window.setTimeout(() => {
      this.sources = [];
      this.onDone?.();
    }, (total + 0.15 + outputLatency(this.ctx)) * 1000);
  }

  /** 現在聽到的是第幾次（0 起算）、在播放還是停頓中。 */
  state(): RepeatState | null {
    if (!this.running) return null;
    const t = this.ctx.currentTime - outputLatency(this.ctx) - this.t0;
    const period = this.len + this.gap;
    if (t < 0) return { index: 0, phase: 'gap' };
    const index = Math.floor(t / period);
    if (index >= this.count) return { index: this.count - 1, phase: 'done' };
    return { index, phase: t - index * period < this.len ? 'playing' : 'gap' };
  }

  stop() {
    window.clearTimeout(this.timer);
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        // 已經停了
      }
      s.disconnect();
    }
    this.sources = [];
  }
}
