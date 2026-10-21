// 合成器：用 OfflineAudioContext 算出聲音，確認音高、包絡、鼓組真的有出聲。
import { expect, test } from '@playwright/test';

test('三角波合成器：A4 彈 0.5 秒 → 440 Hz、0.5＋釋音後歸零', async ({ page }) => {
  await page.goto('/');
  const r = await page.evaluate(async () => {
    const { playNote, createSynthBus, playDrum } = (await import('/src/audio/synth.ts' as string)) as typeof import('../../src/audio/synth');
    const { trackRaw } = (await import('/src/analysis/pitch-track.ts' as string)) as typeof import('../../src/analysis/pitch-track');
    const sr = 48000;
    const ctx = new OfflineAudioContext(1, sr, sr);
    playNote(ctx, createSynthBus(ctx, ctx.destination), 69, 0.1, 0.5, 100);
    const out = (await ctx.startRendering()).getChannelData(0);
    const rms = (a: number, b: number) => {
      let s = 0;
      for (let i = Math.round(a * sr); i < Math.round(b * sr); i++) s += out[i] * out[i];
      return Math.sqrt(s / ((b - a) * sr));
    };
    const raw = trackRaw(out, sr);
    const mid = raw.t.findIndex((t) => t >= 0.35);
    const [hz, clarity] = [raw.hz[mid], raw.clarity[mid]];

    const dctx = new OfflineAudioContext(1, sr / 2, sr);
    playDrum(dctx, dctx.destination, 'kick', 0);
    playDrum(dctx, dctx.destination, 'snare', 0.15);
    playDrum(dctx, dctx.destination, 'hihat', 0.3);
    const drums = (await dctx.startRendering()).getChannelData(0);
    let peak = 0;
    for (const x of drums) peak = Math.max(peak, Math.abs(x));
    return { hz, clarity, before: rms(0, 0.09), during: rms(0.2, 0.55), after: rms(0.8, 1), drumPeak: peak };
  });
  expect(r.hz).toBeCloseTo(440, 0);
  expect(r.clarity).toBeGreaterThan(0.9);
  expect(r.before).toBe(0);
  expect(r.during).toBeGreaterThan(0.02);
  expect(r.after).toBe(0);
  expect(r.drumPeak).toBeGreaterThan(0.1);
});
