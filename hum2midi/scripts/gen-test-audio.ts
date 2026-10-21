// 產生合成測試音檔（規劃書 13.1）。輸出到 tests/fixtures/，44.1 kHz 與 48 kHz 各一份。
// 聲音 = 基頻正弦＋幾個衰減諧波＋少量雜訊，模擬閉口哼聲。亂數有固定種子，每次產生的檔案位元完全相同。
//
//   npm run fixtures            產生全部
//   npm run fixtures -- <dir>   輸出到別的資料夾

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { encodeWav } from '../src/audio/wav';

export const SAMPLE_RATES = [44100, 48000] as const;
export const FIXTURES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../tests/fixtures');

/** 每個檔案開頭與結尾的「房間底噪」長度（秒）。真實錄音按下空白鍵後也總有一小段安靜。 */
export const LEAD = 0.3;
export const TAIL = 0.3;

/** 正確答案：合成時實際放進去的音符（秒，從檔案開頭算）。 */
export type TruthNote = { midi: number; start: number; dur: number };

type Voice = {
  start: number; // 秒
  dur: number;
  pitch: (t: number) => number; // 局部時間 → midiFloat
  amp?: (t: number) => number; // 局部時間 → 0–1 的額外包絡
  level?: number; // 峰值振幅
  harmonics?: number[];
  attack?: number;
  release?: number;
};

type Noise = { kind: 'white' | 'pink'; rmsDb: number; start?: number; dur?: number };

export type FixtureCase = {
  name: string;
  description: string;
  duration: number; // 秒（含頭尾底噪）
  voices: Voice[];
  noise: Noise[];
  truth: TruthNote[];
};

const HUM_HARMONICS = [1, 0.5, 0.3, 0.18, 0.1, 0.06];
const SPEECH_HARMONICS = [1, 0.8, 0.6, 0.45, 0.35, 0.25, 0.18, 0.12];
const FLOOR: Noise = { kind: 'white', rmsDb: -60 };

const steady = (m: number) => () => m;

function scale(offset: number): Pick<FixtureCase, 'voices' | 'truth' | 'duration'> {
  const midis = [60, 62, 64, 65, 67, 69, 71, 72];
  const truth = midis.map((midi, i) => ({ midi, start: LEAD + i * 0.5, dur: 0.4 }));
  return {
    truth,
    voices: truth.map((n) => ({ start: n.start, dur: n.dur, pitch: steady(n.midi + offset) })),
    duration: LEAD + midis.length * 0.5 - 0.1 + TAIL,
  };
}

/** 平滑的 0→1 過渡（升餘弦）。 */
function ramp(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return 0.5 - 0.5 * Math.cos(Math.PI * x);
}

function repeatedNotes(): FixtureCase {
  // 同一個 E4 連續不斷地唱，音量在四下之間掉到 30%（不是靜音）。
  const noteLen = 0.4;
  const dipLen = 0.1;
  const fade = 0.03;
  const period = noteLen + dipLen;
  const total = 4 * noteLen + 3 * dipLen;
  const amp = (t: number) => {
    const k = Math.floor(t / period);
    const u = t - k * period;
    if (k >= 3 || u < noteLen - fade) {
      return u < fade && k > 0 ? 0.3 + 0.7 * ramp(u / fade) : 1;
    }
    if (u < noteLen) return 0.3 + 0.7 * (1 - ramp((u - (noteLen - fade)) / fade));
    return 0.3;
  };
  return {
    name: 'repeated_notes',
    description: 'E4 ×4，每個之間 RMS 降到 30%，不完全靜音',
    duration: LEAD + total + TAIL,
    voices: [{ start: LEAD, dur: total, pitch: steady(64), amp }],
    noise: [FLOOR],
    truth: [0, 1, 2, 3].map((k) => ({ midi: 64, start: LEAD + k * period, dur: noteLen })),
  };
}

function speechLike(): FixtureCase {
  // 5 個「音節」：能量隆起＋音高下滑 3 個半音，音節前有一小段子音（氣音）。
  const ioi = 0.26;
  const syl = 0.2;
  const centers = [58, 60, 57, 59, 54];
  const voices: Voice[] = [];
  const noise: Noise[] = [FLOOR];
  const truth: TruthNote[] = [];
  centers.forEach((c, i) => {
    const start = LEAD + i * ioi;
    voices.push({
      start,
      dur: syl,
      pitch: (t) => c + 1.5 - 3 * (t / syl),
      amp: (t) => Math.sin(Math.PI * Math.min(1, t / syl)) ** 0.7,
      level: 0.3,
      harmonics: SPEECH_HARMONICS,
      attack: 0.01,
      release: 0.02,
    });
    noise.push({ kind: 'white', rmsDb: -42, start: start - 0.035, dur: 0.035 });
    truth.push({ midi: c, start, dur: syl });
  });
  return {
    name: 'speech_like',
    description: '5 個「音節」：每個有能量包絡隆起＋音高下滑',
    duration: LEAD + 4 * ioi + syl + TAIL,
    voices,
    noise,
    truth,
  };
}

export const FIXTURES: FixtureCase[] = [
  {
    name: 'scale_c_major',
    description: 'C4 D4 E4 F4 G4 A4 B4 C5，各 400 ms，間隔 100 ms',
    noise: [FLOOR],
    ...scale(0),
  },
  repeatedNotes(),
  {
    name: 'vibrato',
    description: 'A4 持續 1.5 秒，5.5 Hz、±50 cents 顫音',
    duration: LEAD + 1.5 + TAIL,
    voices: [{ start: LEAD, dur: 1.5, pitch: (t) => 69 + 0.5 * Math.sin(2 * Math.PI * 5.5 * t) }],
    noise: [FLOOR],
    truth: [{ midi: 69, start: LEAD, dur: 1.5 }],
  },
  {
    name: 'glide',
    description: 'C4 用 200 ms 滑到 G4，停留 600 ms',
    duration: LEAD + 0.8 + TAIL,
    voices: [{ start: LEAD, dur: 0.8, pitch: (t) => (t < 0.2 ? 60 + 7 * (t / 0.2) : 67) }],
    noise: [FLOOR],
    truth: [{ midi: 67, start: LEAD + 0.2, dur: 0.6 }],
  },
  {
    name: 'detuned_scale',
    description: '同 scale_c_major，但整體偏 +30 cents',
    noise: [FLOOR],
    ...scale(0.3),
  },
  {
    name: 'octave_glitch',
    description: 'A3 長音中插入 30 ms 的 A4',
    duration: LEAD + 1.2 + TAIL,
    voices: [{ start: LEAD, dur: 1.2, pitch: (t) => (t >= 0.6 && t < 0.63 ? 69 : 57) }],
    noise: [FLOOR],
    truth: [{ midi: 57, start: LEAD, dur: 1.2 }],
  },
  {
    name: 'noise_only',
    description: '粉紅雜訊',
    duration: 2.5,
    voices: [],
    noise: [{ kind: 'pink', rmsDb: -30 }],
    truth: [],
  },
  speechLike(),
];

export function midiToHz(m: number): number {
  return 440 * 2 ** ((m - 69) / 12);
}

/** 固定種子的 PRNG（mulberry32），讓雜訊每次都一樣。 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedOf(name: string, sr: number): number {
  let h = 2166136261 ^ sr;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return h >>> 0;
}

function addVoice(out: Float32Array, sr: number, v: Voice) {
  const harmonics = v.harmonics ?? HUM_HARMONICS;
  const norm = harmonics.reduce((a, b) => a + b, 0);
  const level = v.level ?? 0.35;
  const attack = v.attack ?? 0.015;
  const release = v.release ?? 0.03;
  const i0 = Math.round(v.start * sr);
  const n = Math.round(v.dur * sr);
  let phase = 0;
  for (let i = 0; i < n && i0 + i < out.length; i++) {
    const t = i / sr;
    const f0 = midiToHz(v.pitch(t));
    phase += (2 * Math.PI * f0) / sr;
    if (phase > 2 * Math.PI * 1000) phase -= 2 * Math.PI * 1000;
    let s = 0;
    for (let h = 0; h < harmonics.length; h++) {
      if (f0 * (h + 1) >= sr / 2) break;
      s += harmonics[h] * Math.sin((h + 1) * phase);
    }
    const env = Math.min(ramp(t / attack), ramp((v.dur - t) / release)) * (v.amp ? v.amp(t) : 1);
    out[i0 + i] += (level * env * s) / norm;
  }
}

function addNoise(out: Float32Array, sr: number, nz: Noise, rand: () => number) {
  const i0 = Math.round((nz.start ?? 0) * sr);
  const i1 = nz.dur === undefined ? out.length : Math.min(out.length, i0 + Math.round(nz.dur * sr));
  const buf = new Float32Array(Math.max(0, i1 - i0));
  // Paul Kellet 的粉紅雜訊濾波器
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < buf.length; i++) {
    const w = rand() * 2 - 1;
    if (nz.kind === 'white') {
      buf[i] = w;
      continue;
    }
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    buf[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
  }
  let sq = 0;
  for (const x of buf) sq += x * x;
  const rms = Math.sqrt(sq / Math.max(1, buf.length));
  const gain = rms > 0 ? 10 ** (nz.rmsDb / 20) / rms : 0;
  for (let i = 0; i < buf.length; i++) out[i0 + i] += buf[i] * gain;
}

export function renderFixture(fx: FixtureCase, sampleRate: number): Float32Array {
  const out = new Float32Array(Math.round(fx.duration * sampleRate));
  for (const v of fx.voices) addVoice(out, sampleRate, v);
  const rand = mulberry32(seedOf(fx.name, sampleRate));
  for (const nz of fx.noise) addNoise(out, sampleRate, nz, rand);
  return out;
}

export function fixtureFileName(name: string, sampleRate: number): string {
  return `${name}_${Math.round(sampleRate / 1000)}k.wav`;
}

/** 產生全部 fixtures，回傳寫出的檔案路徑。 */
export function generateFixtures(dir = FIXTURES_DIR): string[] {
  mkdirSync(dir, { recursive: true });
  const written: string[] = [];
  for (const fx of FIXTURES) {
    for (const sr of SAMPLE_RATES) {
      const file = join(dir, fixtureFileName(fx.name, sr));
      writeFileSync(file, new Uint8Array(encodeWav(renderFixture(fx, sr), sr)));
      written.push(file);
    }
  }
  return written;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const files = generateFixtures(process.argv[2] ? resolve(process.argv[2]) : FIXTURES_DIR);
  for (const f of files) console.log(f);
}
