import { expect, test } from '@playwright/test';

test('頁面可以開啟', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('hum2midi');
});

test('假麥克風有聲音（Chromium 讀測試音檔）', async ({ page }) => {
  await page.goto('/');
  const rms = await page.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
    });
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let best = 0;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 50));
      analyser.getFloatTimeDomainData(buf);
      let sq = 0;
      for (const x of buf) sq += x * x;
      best = Math.max(best, Math.sqrt(sq / buf.length));
    }
    stream.getTracks().forEach((t) => t.stop());
    await ctx.close();
    return best;
  });
  expect(rms).toBeGreaterThan(0.01);
});
