import { expect, test } from '@playwright/test';

// M1：離線分析真的在 Web Worker 裡跑（開發伺服器直接提供 src/ 與 tests/fixtures/ 底下的檔案）
test('Worker 分析 scale_c_major → 8 個音符；改設定後用快取重新分析', async ({ page }) => {
  await page.goto('/');
  const out = await page.evaluate(async () => {
    // 路徑是瀏覽器端的 URL；型別借用專案裡的同一個模組
    const { AnalysisClient } = (await import('/src/analysis/client.ts' as string)) as typeof import('../../src/analysis/client');
    const { decodeWav } = (await import('/src/audio/wav.ts' as string)) as typeof import('../../src/audio/wav');
    const { DEFAULT_SETTINGS } = (await import('/src/types.ts' as string)) as typeof import('../../src/types');
    const wav = await (await fetch('/tests/fixtures/scale_c_major_48k.wav')).arrayBuffer();
    const { samples, sampleRate } = decodeWav(wav);
    const client = new AnalysisClient();
    const first = await client.analyze('t1', DEFAULT_SETTINGS, samples, sampleRate);
    const t0 = performance.now();
    const second = await client.analyze('t1', { ...DEFAULT_SETTINGS, splitSensitivity: 0.2 }, samples, sampleRate);
    return { first: first.notes.map((n) => n.midi), second: second.notes.map((n) => n.midi), ms: performance.now() - t0 };
  });
  expect(out.first).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
  expect(out.second).toEqual(out.first);
  expect(out.ms).toBeLessThan(200);
});
