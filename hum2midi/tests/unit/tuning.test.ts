import { describe, expect, it } from 'vitest';
import { LEAD, renderFixture } from '../../scripts/gen-test-audio';
import { trackPitch } from '../../src/analysis/pitch-track';
import { smoothPitch } from '../../src/analysis/smoothing';
import { applyTuning, estimateTuningOffset } from '../../src/analysis/tuning';
import { fixture, loadFixture } from './helpers';

function offsetCents(samples: Float32Array, sr: number) {
  return estimateTuningOffset(smoothPitch(trackPitch(samples, sr, 0.5))) * 100;
}

describe('調音偏移', () => {
  it('detuned_scale：已知 +30 cents，±5 cents 內還原', () => {
    for (const sr of [44100, 48000]) {
      const { samples, sampleRate } = loadFixture('detuned_scale', sr);
      expect(Math.abs(offsetCents(samples, sampleRate) - 30)).toBeLessThanOrEqual(5);
    }
  });

  it.each([-45, -30, -12, 0, 8, 22, 41])('合成的整體偏移 %i cents，±5 cents 內還原', (cents) => {
    const base = fixture('scale_c_major');
    const midis = [57, 60, 62, 64, 65, 67];
    const fx = {
      ...base,
      name: `tuning_${cents}`,
      voices: midis.map((m, i) => ({ start: LEAD + i * 0.5, dur: 0.4, pitch: () => m + cents / 100 })),
      duration: LEAD + midis.length * 0.5 + 0.3,
    };
    expect(Math.abs(offsetCents(renderFixture(fx, 48000), 48000) - cents)).toBeLessThanOrEqual(5);
  });

  it('±50 cents 顫音不會把偏移帶到 ±50', () => {
    const { samples, sampleRate } = loadFixture('vibrato', 48000);
    expect(Math.abs(offsetCents(samples, sampleRate))).toBeLessThan(5);
  });

  it('沒有有聲幀 → 0；偏差均勻分散 → 0', () => {
    expect(estimateTuningOffset([NaN, NaN])).toBe(0);
    const spread = Float64Array.from({ length: 400 }, (_, i) => 60 + i / 400);
    expect(estimateTuningOffset(spread)).toBe(0);
  });

  it('applyTuning 減去偏移，NaN 保持 NaN', () => {
    const out = applyTuning(Float64Array.from([60.3, NaN]), 0.3);
    expect(out[0]).toBeCloseTo(60, 10);
    expect(Number.isNaN(out[1])).toBe(true);
  });
});
