// Worker 裡的分析服務：快取每段錄音的原始音高追蹤，調整設定後只重跑後段（目標 < 200 ms）。
// 跟 Worker API 無關，單元測試可以直接用。

import type { AnalysisSettings } from '../types';
import { trackRaw, type RawTrack } from './pitch-track';
import { analyzeTrack, NO_CONTEXT, type AnalysisContext, type HumAnalysis } from './pipeline';

export type AnalyzeRequest = {
  type: 'analyze';
  jobId: number;
  takeId: string;
  /** 第一次分析這段錄音時要附上；之後只改設定時可以省略，直接用快取。 */
  audio?: { samples: Float32Array; sampleRate: number };
  settings: AnalysisSettings;
  context?: AnalysisContext;
};

export type AnalyzeResponse =
  | { type: 'result'; jobId: number; takeId: string; result: HumAnalysis; ms: number }
  | { type: 'error'; jobId: number; takeId: string; message: string };

const CACHE_SIZE = 4;

export function createAnalyzer() {
  const cache = new Map<string, RawTrack>();

  function rawFor(req: AnalyzeRequest): RawTrack {
    if (req.audio) {
      const raw = trackRaw(req.audio.samples, req.audio.sampleRate);
      cache.delete(req.takeId);
      cache.set(req.takeId, raw);
      while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
      return raw;
    }
    const raw = cache.get(req.takeId);
    if (!raw) throw new Error(`沒有 ${req.takeId} 的音訊快取，請附上 audio`);
    // 重新放到最後面，維持 LRU 順序
    cache.delete(req.takeId);
    cache.set(req.takeId, raw);
    return raw;
  }

  return {
    has: (takeId: string) => cache.has(takeId),
    handle(req: AnalyzeRequest): AnalyzeResponse {
      const t0 = performance.now();
      try {
        const result = analyzeTrack(rawFor(req), req.settings, req.context ?? NO_CONTEXT);
        return { type: 'result', jobId: req.jobId, takeId: req.takeId, result, ms: performance.now() - t0 };
      } catch (err) {
        return { type: 'error', jobId: req.jobId, takeId: req.takeId, message: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}
