// 主執行緒這一側：把分析工作丟給 Worker，用 Promise 拿結果。

import type { AnalysisSettings } from '../types';
import type { AnalyzeRequest, AnalyzeResponse } from './analyzer';
import type { AnalysisContext, HumAnalysis } from './pipeline';
import type { SpeechAnalysis, SpeechOptions } from './speech';

type Audio = { samples: Float32Array; sampleRate: number };

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
   * 分析一段錄音（哼唱模式）。samples 會被複製一份送進 Worker（原本的陣列還能繼續用來播放）。
   * 同一個 takeId 第二次之後只送設定，Worker 用快取的音高追蹤結果；快取被擠掉時自動重送音訊。
   */
  async analyze(takeId: string, settings: AnalysisSettings, samples: Float32Array, sampleRate: number, context?: AnalysisContext): Promise<HumAnalysis> {
    const res = await this.run({ takeId, settings, context }, { samples, sampleRate });
    if (res.type !== 'result') throw new Error('unexpected response');
    return res.result;
  }

  /** 說話變唱歌的分析。 */
  async analyzeSpeech(takeId: string, settings: AnalysisSettings, samples: Float32Array, sampleRate: number, speech: SpeechOptions): Promise<SpeechAnalysis> {
    const res = await this.run({ takeId, settings, speech }, { samples, sampleRate });
    if (res.type !== 'speech-result') throw new Error('unexpected response');
    return res.result;
  }

  private async run(req: Pick<AnalyzeRequest, 'takeId' | 'settings' | 'context' | 'speech'>, audio: Audio): Promise<AnalyzeResponse> {
    const withAudio = !this.sent.has(req.takeId);
    let res = await this.send(req, withAudio ? audio : undefined);
    if (res.type === 'error' && !withAudio) res = await this.send(req, audio);
    if (res.type === 'error') throw new Error(res.message);
    this.sent.add(req.takeId);
    return res;
  }

  private send(partial: Pick<AnalyzeRequest, 'takeId' | 'settings' | 'context' | 'speech'>, audio?: Audio) {
    const jobId = this.nextJob++;
    const req: AnalyzeRequest = { type: 'analyze', jobId, ...partial };
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

let shared: AnalysisClient | null = null;

/** App 共用的一個 Worker。 */
export function analysisClient(): AnalysisClient {
  return (shared ??= new AnalysisClient());
}
