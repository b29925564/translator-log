// 播放用的小合成器：三角波＋ADSR（A 10 ms、D 80 ms、S 0.7、R 120 ms），經過低通讓聲音不刺耳。
// 另有簡單鼓組（kick／snare／hi-hat），全部用 Web Audio 合成。

import { midiToHz } from '../analysis/smoothing';

export const ADSR = { a: 0.01, d: 0.08, s: 0.7, r: 0.12 };

export type SynthNote = { midi: number; start: number; dur: number; velocity: number };

/** 一條合成器匯流排：所有音符 → 低通 → out。 */
export function createSynthBus(ctx: BaseAudioContext, out: AudioNode): AudioNode {
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2800;
  lp.Q.value = 0.5;
  lp.connect(out);
  return lp;
}

/** 在 when（AudioContext 時間）彈一個音，長度 dur 秒。回傳振盪器（停止時用）。 */
export function playNote(ctx: BaseAudioContext, bus: AudioNode, midi: number, when: number, dur: number, velocity: number): OscillatorNode {
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = midiToHz(midi);
  const env = ctx.createGain();
  const peak = 0.32 * (Math.max(1, Math.min(127, velocity)) / 127) ** 1.5;
  const g = env.gain;
  const end = when + Math.max(dur, ADSR.a);
  g.setValueAtTime(0, when);
  g.linearRampToValueAtTime(peak, when + ADSR.a);
  g.linearRampToValueAtTime(peak * ADSR.s, Math.min(end, when + ADSR.a + ADSR.d));
  g.setValueAtTime(peak * ADSR.s, end);
  g.linearRampToValueAtTime(0, end + ADSR.r);
  osc.connect(env).connect(bus);
  osc.start(when);
  osc.stop(end + ADSR.r + 0.01);
  return osc;
}

export type DrumHit = 'kick' | 'snare' | 'hihat';

let noiseBuffer: AudioBuffer | null = null;
function noise(ctx: BaseAudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let seed = 12345;
  for (let i = 0; i < d.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    d[i] = (seed / 0x7fffffff) * 2 - 1;
  }
  return (noiseBuffer = buf);
}

/** 打一下鼓。回傳要能被停止的音源。 */
export function playDrum(ctx: BaseAudioContext, out: AudioNode, hit: DrumHit, when: number, velocity = 100): AudioScheduledSourceNode[] {
  const v = Math.max(1, Math.min(127, velocity)) / 127;
  if (hit === 'kick') {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(140, when);
    osc.frequency.exponentialRampToValueAtTime(45, when + 0.12);
    g.gain.setValueAtTime(0.9 * v, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.3);
    osc.connect(g).connect(out);
    osc.start(when);
    osc.stop(when + 0.32);
    return [osc];
  }
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const filter = ctx.createBiquadFilter();
  const g = ctx.createGain();
  if (hit === 'snare') {
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    filter.Q.value = 0.7;
    g.gain.setValueAtTime(0.5 * v, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.18);
    const body = ctx.createOscillator();
    const bg = ctx.createGain();
    body.frequency.value = 190;
    bg.gain.setValueAtTime(0.35 * v, when);
    bg.gain.exponentialRampToValueAtTime(0.001, when + 0.1);
    body.connect(bg).connect(out);
    body.start(when);
    body.stop(when + 0.12);
    src.connect(filter).connect(g).connect(out);
    src.start(when, 0.1);
    src.stop(when + 0.2);
    return [src, body];
  }
  filter.type = 'highpass';
  filter.frequency.value = 7000;
  g.gain.setValueAtTime(0.22 * v, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
  src.connect(filter).connect(g).connect(out);
  src.start(when, 0.3);
  src.stop(when + 0.06);
  return [src];
}
