// 5. 錄音：getUserMedia（關掉降噪、自動增益、回音消除）＋ AudioWorklet 收原始 PCM。

import workletUrl from './recorder.worklet.ts?worker&url';
import type { RecorderCommand, RecorderEvent } from './recorder.worklet';

export const MAX_SECONDS = 180;

export const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
};

const loaded = new WeakSet<BaseAudioContext>();

export class MicError extends Error {
  constructor(
    message: string,
    readonly reason: 'insecure' | 'denied' | 'missing' | 'other',
  ) {
    super(message);
  }
}

export class Recorder {
  readonly analyser: AnalyserNode;
  private chunks: Float32Array[] = [];
  private length = 0;
  private onStopped: (() => void) | null = null;

  private constructor(
    readonly ctx: AudioContext,
    private stream: MediaStream,
    private source: MediaStreamAudioSourceNode,
    private node: AudioWorkletNode,
    private sink: GainNode,
  ) {
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    source.connect(this.analyser);
    node.port.onmessage = (e: MessageEvent<RecorderEvent>) => {
      const ev = e.data;
      if (ev.type === 'chunk') {
        this.chunks.push(ev.data);
        this.length += ev.data.length;
      } else if (ev.type === 'stopped') this.onStopped?.();
    };
  }

  static async open(ctx: AudioContext): Promise<Recorder> {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new MicError('麥克風只能在 https 或 localhost 使用（請用 npm run dev 開啟，不要直接開 html 檔）', 'insecure');
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') throw new MicError('沒有麥克風權限。請在網址列左邊的設定裡允許使用麥克風。', 'denied');
      if (name === 'NotFoundError' || name === 'OverconstrainedError') throw new MicError('找不到麥克風。', 'missing');
      throw new MicError(`無法開啟麥克風：${err instanceof Error ? err.message : String(err)}`, 'other');
    }
    if (!loaded.has(ctx)) {
      await ctx.audioWorklet.addModule(workletUrl);
      loaded.add(ctx);
    }
    const source = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, 'hum2midi-recorder', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit' });
    // 接到一個靜音的 GainNode 再到 destination，確保每個瀏覽器都會持續呼叫 process()
    const sink = ctx.createGain();
    sink.gain.value = 0;
    source.connect(node).connect(sink).connect(ctx.destination);
    return new Recorder(ctx, stream, source, node, sink);
  }

  get open(): boolean {
    return this.stream.getAudioTracks().some((t) => t.readyState === 'live');
  }

  get sampleRate(): number {
    return this.ctx.sampleRate;
  }

  /** 目前已收到的秒數。 */
  get seconds(): number {
    return this.length / this.ctx.sampleRate;
  }

  /** 從 AudioContext 時間 atTime（預設：現在）開始收音。 */
  start(atTime = this.ctx.currentTime) {
    this.chunks = [];
    this.length = 0;
    this.post({ type: 'start', atFrame: Math.round(atTime * this.ctx.sampleRate) });
  }

  /** 停止收音，回傳整段錄音。 */
  stop(): Promise<Float32Array> {
    return new Promise((resolve) => {
      this.onStopped = () => {
        this.onStopped = null;
        const out = new Float32Array(this.length);
        let o = 0;
        for (const c of this.chunks) {
          out.set(c, o);
          o += c.length;
        }
        this.chunks = [];
        this.length = 0;
        resolve(out);
      };
      this.post({ type: 'stop' });
    });
  }

  close() {
    this.stream.getTracks().forEach((t) => t.stop());
    this.source.disconnect();
    this.node.disconnect();
    this.sink.disconnect();
    this.analyser.disconnect();
  }

  private post(cmd: RecorderCommand) {
    this.node.port.postMessage(cmd);
  }
}
