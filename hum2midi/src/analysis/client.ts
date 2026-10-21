// 主執行緒這一側：把分析工作丟給 Worker，用 Promise 拿結果。

import type { AnalysisSettings } from '../types';
import type { AnalyzeRequest, AnalyzeResponse } from './analyzer';
import type { AnalysisContext, HumAnalysis } from './pipeline';

export class AnalysisClient {
  private worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  private nextJob = 1;
  private pending = new Map<number, (res: AnalyzeResponse) => void>();
  private sent = new Set<string>();

  constructor() {
    this.worker.onmessage = (e: MessageEvent<AnalyzeResponse>) => {
      const done = this.pending.get(e.data.jobId);
      this.pending.delete(e.data.jobId);
      done?.(e.data);
    };
  }

  /**
   * 分析一段錄音。samples 會被複製一份送進 Worker（原本的陣列還能繼續用來播放）。
   * 同一個 takeId 第二次之後只送設定，Worker 用快取的音高追蹤結果；快取被擠掉時自動重送音訊。
   */
  async analyze(takeId: string, settings: AnalysisSettings, samples: Float32Array, sampleRate: number, context?: AnalysisContext): Promise<HumAnalysis> {
    const withAudio = !this.sent.has(takeId);
    let res = await this.send(takeId, settings, context, withAudio ? { samples, sampleRate } : undefined);
    if (res.type === 'error' && !withAudio) res = await this.send(takeId, settings, context, { samples, sampleRate });
    if (res.type === 'error') throw new Error(res.message);
    this.sent.add(takeId);
    return res.result;
  }

  private send(takeId: string, settings: AnalysisSettings, context: AnalysisContext | undefined, audio?: { samples: Float32Array; sampleRate: number }) {
    const jobId = this.nextJob++;
    const req: AnalyzeRequest = { type: 'analyze', jobId, takeId, settings, context };
    const transfer: Transferable[] = [];
    if (audio) {
      const copy = audio.samples.slice();
      req.audio = { samples: copy, sampleRate: audio.sampleRate };
      transfer.push(copy.buffer);
    }
    return new Promise<AnalyzeResponse>((resolve) => {
      this.pending.set(jobId, resolve);
      this.worker.postMessage(req, transfer);
    });
  }
}
