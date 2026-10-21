import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeWav } from '../../src/audio/wav';
import { FIXTURES, FIXTURES_DIR, SAMPLE_RATES, fixtureFileName } from '../../scripts/gen-test-audio';

describe('gen-test-audio', () => {
  it('產生規劃書 13.1 表中的全部 8 種測試音檔', () => {
    expect(FIXTURES.map((f) => f.name)).toEqual([
      'scale_c_major',
      'repeated_notes',
      'vibrato',
      'glide',
      'detuned_scale',
      'octave_glitch',
      'noise_only',
      'speech_like',
    ]);
  });

  for (const fx of FIXTURES) {
    for (const sr of SAMPLE_RATES) {
      const file = join(FIXTURES_DIR, fixtureFileName(fx.name, sr));
      it(`${fixtureFileName(fx.name, sr)} 存在、可解碼、長度與取樣率正確、沒有削波`, () => {
        expect(existsSync(file)).toBe(true);
        const { samples, sampleRate } = decodeWav(readFileSync(file));
        expect(sampleRate).toBe(sr);
        expect(samples.length / sr).toBeCloseTo(fx.duration, 2);
        let peak = 0;
        for (const s of samples) peak = Math.max(peak, Math.abs(s));
        expect(peak).toBeGreaterThan(0.01);
        expect(peak).toBeLessThan(0.99);
      });
    }
  }
});
