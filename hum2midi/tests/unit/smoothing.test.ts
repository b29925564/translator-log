import { describe, expect, it } from 'vitest';
import { fixOctaveErrors, hzToMidi, medianFilterRuns, midiToHz, smoothPitch, voicedRuns } from '../../src/analysis/smoothing';

const N = NaN;
const arr = (xs: number[]) => Float64Array.from(xs);

describe('smoothing', () => {
  it('Hz ↔ midiFloat', () => {
    expect(hzToMidi(440)).toBe(69);
    expect(hzToMidi(261.6255653)).toBeCloseTo(60, 6);
    expect(midiToHz(81)).toBeCloseTo(880, 6);
  });

  it('連續有聲區間', () => {
    expect(voicedRuns(arr([N, 1, 2, N, N, 3]))).toEqual([[1, 3], [5, 6]]);
    expect(voicedRuns(arr([]))).toEqual([]);
  });

  it('5 幀中位數濾波只在有聲區間內，不跨越無聲幀', () => {
    const out = medianFilterRuns(arr([60, 60, 72, 60, 60, N, 50, 50]));
    expect(Array.from(out.slice(0, 5))).toEqual([60, 60, 60, 60, 60]);
    expect(Number.isNaN(out[5])).toBe(true);
    expect(Array.from(out.slice(6))).toEqual([50, 50]);
  });

  it('八度錯誤：≤ 60 ms 的 +12 段落被平移回來', () => {
    const x = arr([57, 57, 57, 57, 69.1, 69, 68.9, 57, 57, 57]);
    expect(Array.from(fixOctaveErrors(x)).map((v) => Math.round(v))).toEqual(Array(10).fill(57));
  });

  it('八度錯誤：−12 方向、而且跨過偵測器掉掉的幾幀', () => {
    const x = arr([64, 64, 64, N, 52, 52, N, 64, 64]);
    const out = fixOctaveErrors(x);
    expect(out[4]).toBe(64);
    expect(out[5]).toBe(64);
    expect(Number.isNaN(out[3])).toBe(true);
  });

  it('超過 60 ms 的八度跳動是真的換音，不動', () => {
    const x = arr([57, 57, 57, ...Array(8).fill(69), 57, 57]);
    expect(Array.from(fixOctaveErrors(x))).toEqual(Array.from(x));
  });

  it('只有一側相差 12（例如真的往上跳八度後就停在那裡）不動', () => {
    const x = arr([57, 57, 57, 69, 69, 69, 64, 64]);
    expect(Array.from(fixOctaveErrors(x))).toEqual(Array.from(x));
  });

  it('不是 12 半音的大跳（例如 11 半音）不動', () => {
    const x = arr([57, 57, 68, 68, 57, 57]);
    expect(Array.from(fixOctaveErrors(x))).toEqual(Array.from(x));
  });

  it('smoothPitch：先濾波再修八度，長段八度錯誤（中位數濾不掉）也會被修正', () => {
    const hz = [220, 220, 220, 220, 440, 440, 440, 440, 220, 220, 220, 220].map((f, i) => ({ t: i * 0.01, hz: f, clarity: 1, rms: 0.1 }));
    const out = smoothPitch(hz);
    expect(Array.from(out).map((v) => Math.round(v))).toEqual(Array(12).fill(57));
  });
});
