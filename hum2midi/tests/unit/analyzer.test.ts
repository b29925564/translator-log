import { describe, expect, it } from 'vitest';
import { renderFixture, type FixtureCase } from '../../scripts/gen-test-audio';
import { createAnalyzer } from '../../src/analysis/analyzer';
import { DEFAULT_SETTINGS } from '../../src/types';

// 30 秒、48 kHz 的哼唱：一直重複的旋律，音與音之間有短停頓
function thirtySeconds(): Float32Array {
  const melody = [60, 60, 67, 67, 69, 69, 67, 65, 65, 64, 64, 62, 62, 60];
  const voices: FixtureCase['voices'] = [];
  for (let i = 0; 0.3 + i * 0.45 + 0.4 < 30; i++) {
    const m = melody[i % melody.length];
    voices.push({ start: 0.3 + i * 0.45, dur: 0.38, pitch: (t) => m + 0.3 * Math.sin(2 * Math.PI * 5 * t) });
  }
  const fx: FixtureCase = { name: 'thirty', description: '', duration: 30, voices, noise: [{ kind: 'white', rmsDb: -60 }], truth: [] };
  return renderFixture(fx, 48000);
}

describe('分析服務（Worker 內部）', () => {
  it('第一次附音訊；之後只改設定就用快取，30 秒錄音重新分析 < 200 ms', () => {
    const analyzer = createAnalyzer();
    const samples = thirtySeconds();
    const first = analyzer.handle({ type: 'analyze', jobId: 1, takeId: 'a', audio: { samples, sampleRate: 48000 }, settings: DEFAULT_SETTINGS });
    expect(first.type).toBe('result');
    if (first.type !== 'result') return;
    console.log(`30 秒錄音首次分析 ${first.ms.toFixed(0)} ms`);
    expect(first.result.notes.length).toBeGreaterThan(50);

    const settings = { ...DEFAULT_SETTINGS, sensitivity: 0.8, splitSensitivity: 0.3, tuningCorrection: false };
    const again = analyzer.handle({ type: 'analyze', jobId: 2, takeId: 'a', settings });
    expect(again.type).toBe('result');
    if (again.type !== 'result') return;
    console.log(`改設定後重新分析 ${again.ms.toFixed(0)} ms`);
    expect(again.ms).toBeLessThan(200);
  });

  it('沒有快取又沒附音訊 → 回傳錯誤，不會丟例外', () => {
    const res = createAnalyzer().handle({ type: 'analyze', jobId: 7, takeId: 'missing', settings: DEFAULT_SETTINGS });
    expect(res).toMatchObject({ type: 'error', jobId: 7, takeId: 'missing' });
  });

  it('快取最多 4 段，最久沒用的先丟', () => {
    const analyzer = createAnalyzer();
    const samples = new Float32Array(48000);
    for (const id of ['a', 'b', 'c', 'd']) analyzer.handle({ type: 'analyze', jobId: 1, takeId: id, audio: { samples, sampleRate: 48000 }, settings: DEFAULT_SETTINGS });
    analyzer.handle({ type: 'analyze', jobId: 2, takeId: 'a', settings: DEFAULT_SETTINGS }); // a 變成最近用過
    analyzer.handle({ type: 'analyze', jobId: 3, takeId: 'e', audio: { samples, sampleRate: 48000 }, settings: DEFAULT_SETTINGS });
    expect(['a', 'b', 'c', 'd', 'e'].map((id) => analyzer.has(id))).toEqual([true, false, true, true, true]);
  });
});
