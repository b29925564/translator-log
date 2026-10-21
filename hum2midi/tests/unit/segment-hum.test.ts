import { describe, expect, it } from 'vitest';
import { segmentHum, splitThreshold, velocityFromRms } from '../../src/analysis/segment-hum';

const HOP = 0.01;

/** 用分段描述做一條音高曲線：[音高或 NaN, 幀數]… */
function curve(parts: [number, number][], rms = 0.1) {
  const x: number[] = [];
  for (const [v, n] of parts) for (let i = 0; i < n; i++) x.push(v);
  return {
    x: Float64Array.from(x),
    rms: Float64Array.from(x, (v) => (Number.isNaN(v) ? 0.001 : rms)),
    t: Float64Array.from(x, (_, i) => i * HOP),
  };
}

function seg(c: ReturnType<typeof curve>, splitSensitivity = 0.6) {
  return segmentHum(c.x, c.rms, c.t, { hop: HOP, splitSensitivity });
}

describe('哼唱切分', () => {
  it('切分敏感度 → θ：0 → 1.0、預設 0.6 → 0.7、1 → 0.5 半音', () => {
    expect(splitThreshold(0)).toBe(1);
    expect(splitThreshold(0.6)).toBeCloseTo(0.7, 10);
    expect(splitThreshold(1)).toBe(0.5);
  });

  it('偏離只持續 5 幀（50 ms）不切；持續 6 幀以上才切', () => {
    expect(seg(curve([[60, 30], [62, 5], [60, 30]])).map((n) => n.midi)).toEqual([60]);
    expect(seg(curve([[60, 30], [62, 30]])).map((n) => n.midi)).toEqual([60, 62]);
  });

  it('切點在第一個偏離的幀', () => {
    const notes = seg(curve([[60, 30], [62, 30]]));
    expect(notes[1].start).toBeCloseTo(0.3, 10);
    expect(notes[0].dur).toBeCloseTo(0.3, 10);
  });

  it('切分敏感度：0.6 半音的變化在 θ=0.5 會切開，在 θ=0.7 不會', () => {
    const c = curve([[60, 30], [60.6, 30]]);
    expect(seg(c, 1).length).toBe(2);
    expect(seg(c, 0.6).length).toBe(1);
  });

  it('連續有聲區間之間的停頓會切開', () => {
    expect(seg(curve([[60, 20], [NaN, 10], [60, 20]])).length).toBe(2);
  });

  it('偵測器短暫掉幀（< 40 ms、音量沒有掉）會被補起來，不切開', () => {
    const c = curve([[60, 20], [NaN, 3], [60, 20]]);
    c.rms.fill(0.1);
    expect(seg(c).length).toBe(1);
  });

  it('短於 80 ms 的音併入相鄰、音高較接近的那個', () => {
    // 62 只有 7 幀：前後都相鄰，61 比 67 接近 62，併到前面
    const notes = seg(curve([[61, 20], [62, 7], [67, 20]]), 1);
    expect(notes.map((n) => n.midi)).toEqual([61, 67]);
    expect(notes[0].start + notes[0].dur).toBeCloseTo(notes[1].start, 10);
  });

  it('孤立的短音（前後都是停頓）直接刪除', () => {
    expect(seg(curve([[NaN, 10], [60, 5], [NaN, 10], [64, 20]])).map((n) => n.midi)).toEqual([64]);
  });

  it('音符間隙 < 40 ms 就補連；≥ 40 ms 的不補', () => {
    // 同音重複起音，中間音量只掉 3 幀（30 ms）→ 前一個音延長到下一個音的起點
    const c = curve([[64, 60]]);
    for (let i = 30; i < 33; i++) c.rms[i] = 0.03;
    const notes = seg(c);
    expect(notes.length).toBe(2);
    expect(notes[0].start + notes[0].dur).toBeCloseTo(notes[1].start, 10);
    // 停頓 50 ms
    const apart = seg(curve([[60, 20], [NaN, 5], [64, 20]]));
    expect(apart[0].start + apart[0].dur).toBeCloseTo(0.2, 10);
    expect(apart[1].start).toBeCloseTo(0.25, 10);
  });

  it('同音重複起音：RMS 降到 55% 以下再回到 80% 以上就切開', () => {
    const c = curve([[64, 90]]);
    for (let i = 30; i < 40; i++) c.rms[i] = 0.04; // 掉到 40%
    for (let i = 60; i < 70; i++) c.rms[i] = 0.06; // 只掉到 60%，不算
    const notes = seg(c);
    expect(notes.map((n) => n.midi)).toEqual([64, 64]);
    expect(notes[0].dur).toBeCloseTo(0.3, 10);
    expect(notes[1].start).toBeCloseTo(0.4, 10);
  });

  it('音高取中間 60% 幀的中位數（頭尾的滑音不算）', () => {
    // 前 10 幀從 55 滑上來、最後 8 幀往下掉，中間是 62.2
    const x = [...Array.from({ length: 10 }, (_, i) => 55 + i * 0.7), ...Array(40).fill(62.2), ...Array.from({ length: 8 }, (_, i) => 62 - i * 0.2)];
    const c = { x: Float64Array.from(x), rms: Float64Array.from(x, () => 0.1), t: Float64Array.from(x, (_, i) => i * HOP) };
    const notes = segmentHum(c.x, c.rms, c.t, { hop: HOP, splitSensitivity: 0.6 });
    expect(notes.map((n) => n.midi)).toEqual([62]);
  });

  it('力度：−50 dB → 40、−10 dB → 110，超出範圍外推後夾在 1–127', () => {
    expect(velocityFromRms(10 ** (-50 / 20))).toBe(40);
    expect(velocityFromRms(10 ** (-10 / 20))).toBe(110);
    expect(velocityFromRms(10 ** (-30 / 20))).toBe(75);
    expect(velocityFromRms(1)).toBe(127);
    expect(velocityFromRms(0)).toBe(1);
  });
});
