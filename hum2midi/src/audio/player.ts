// 播放：原音（錄音本身）、合成音（音符）、和弦、鼓組，各自有音量；可以從任意位置開始、可以循環。

import { outputLatency } from './context';
import { createSynthBus, playDrum, playNote, type DrumHit, type SynthNote } from './synth';

export type PlaySource = {
  /** 原始錄音；沒有就只播合成音。 */
  samples?: Float32Array;
  sampleRate: number;
  notes: SynthNote[];
  chords?: SynthNote[];
  drums?: { hit: DrumHit; time: number; velocity?: number }[];
  /** 播放的總長度（秒）；預設取錄音長度與最後一個音符的終點中較大者。 */
  duration?: number;
};

export type Mix = { original: number; synth: number; chords?: number; drums?: number }; // 0–1

/** 播放總長度：指定的 duration，或錄音長度與最後一個音符終點中較大者。 */
export function playLength(src: PlaySource): number {
  if (src.duration !== undefined) return src.duration;
  const audioDur = src.samples ? src.samples.length / src.sampleRate : 0;
  let end = audioDur;
  for (const n of src.notes) end = Math.max(end, n.start + n.dur);
  for (const n of src.chords ?? []) end = Math.max(end, n.start + n.dur);
  return end;
}

export class Player {
  private master: GainNode | null = null;
  private sources: AudioScheduledSourceNode[] = [];
  private startedAt = 0; // 第一輪開始的 AudioContext 時間
  private from = 0;
  private length = 0;
  private looping = false;
  private timer = 0;
  private bufferCache = new WeakMap<Float32Array, AudioBuffer>();
  onEnd: (() => void) | null = null;

  constructor(private ctx: AudioContext) {}

  get playing(): boolean {
    return this.master !== null;
  }

  /** 目前聽到的位置（秒，扣掉輸出延遲）；沒在播放時是 null。循環播放時會繞回起點。 */
  get position(): number | null {
    if (!this.master) return null;
    const t = Math.max(0, this.ctx.currentTime - outputLatency(this.ctx) - this.startedAt);
    return this.from + (this.looping && this.length > 0 ? t % this.length : Math.min(t, this.length));
  }

  play(src: PlaySource, mix: Mix, from = 0, loop = false) {
    this.stop();
    const ctx = this.ctx;
    const master = ctx.createGain();
    master.connect(ctx.destination);
    this.master = master;
    this.looping = loop;
    this.from = from;

    const total = playLength(src);
    this.length = Math.max(0, total - from);
    this.startedAt = ctx.currentTime + 0.06;

    // 循環：每一輪都是完全相同的排程，緊接在上一輪結束的那一刻（用 AudioContext 時間，不靠計時器對齊）
    let next = this.startedAt;
    const round = () => {
      this.scheduleRound(src, mix, master, from, total, next);
      next += this.length;
      const msUntilEnd = (next - ctx.currentTime) * 1000;
      if (loop && this.length > 0.05) this.timer = window.setTimeout(round, Math.max(0, msUntilEnd - 300));
      else
        this.timer = window.setTimeout(() => {
          this.stop();
          this.onEnd?.();
        }, msUntilEnd + outputLatency(ctx) * 1000);
    };
    round();
  }

  private scheduleRound(src: PlaySource, mix: Mix, master: GainNode, from: number, total: number, when: number) {
    const ctx = this.ctx;
    const audioDur = src.samples ? src.samples.length / src.sampleRate : 0;
    if (src.samples && mix.original > 0 && from < audioDur) {
      const node = ctx.createBufferSource();
      node.buffer = this.buffer(src.samples, src.sampleRate);
      const g = ctx.createGain();
      g.gain.value = mix.original;
      node.connect(g).connect(master);
      node.start(when, from, Math.min(audioDur, total) - from);
      this.sources.push(node);
    }

    const schedule = (notes: SynthNote[], vol: number) => {
      if (vol <= 0 || !notes.length) return;
      const g = ctx.createGain();
      g.gain.value = vol;
      g.connect(master);
      const bus = createSynthBus(ctx, g);
      for (const n of notes) {
        const end = Math.min(n.start + n.dur, total);
        if (end <= from || n.start >= total) continue;
        const start = Math.max(n.start, from);
        this.sources.push(playNote(ctx, bus, n.midi, when + start - from, end - start, n.velocity));
      }
    };
    schedule(src.notes, mix.synth);
    if (src.chords) schedule(src.chords, mix.chords ?? mix.synth);

    if (src.drums && (mix.drums ?? 0) > 0) {
      const g = ctx.createGain();
      g.gain.value = mix.drums ?? 0;
      g.connect(master);
      for (const d of src.drums) {
        if (d.time < from || d.time >= total) continue;
        this.sources.push(...playDrum(ctx, g, d.hit, when + d.time - from, d.velocity));
      }
    }
  }

  stop() {
    window.clearTimeout(this.timer);
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        // 還沒開始或已經停了
      }
    }
    this.sources = [];
    if (this.master) {
      const m = this.master;
      m.gain.setTargetAtTime(0, this.ctx.currentTime, 0.01);
      window.setTimeout(() => m.disconnect(), 100);
    }
    this.master = null;
  }

  private buffer(samples: Float32Array, sampleRate: number): AudioBuffer {
    let buf = this.bufferCache.get(samples);
    if (!buf || buf.sampleRate !== sampleRate) {
      buf = this.ctx.createBuffer(1, samples.length, sampleRate);
      buf.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
      this.bufferCache.set(samples, buf);
    }
    return buf;
  }
}
