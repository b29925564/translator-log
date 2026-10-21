// AudioWorklet：從指定的 frame 開始收麥克風的原始 PCM（多聲道平均成單聲道），
// 累積成 4096 樣本的區塊再送回主執行緒（每 128 樣本送一次訊息太頻繁）。
// 這個檔案在 AudioWorkletGlobalScope 執行，不能 import 任何東西。

declare const currentFrame: number;
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
}

export type RecorderCommand = { type: 'start'; atFrame: number } | { type: 'stop' };
export type RecorderEvent = { type: 'started'; frame: number } | { type: 'chunk'; data: Float32Array } | { type: 'stopped' };

const CHUNK = 4096;

class RecorderProcessor extends AudioWorkletProcessor {
  private startAt = Infinity;
  private started = false;
  private buf = new Float32Array(CHUNK);
  private n = 0;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<RecorderCommand>) => {
      if (e.data.type === 'start') {
        this.startAt = e.data.atFrame;
        this.started = false;
        this.n = 0;
      } else {
        this.flush();
        this.startAt = Infinity;
        this.port.postMessage({ type: 'stopped' } satisfies RecorderEvent);
      }
    };
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0];
    if (this.startAt === Infinity || !input || input.length === 0) return true;
    const len = input[0].length;
    for (let i = 0; i < len; i++) {
      if (currentFrame + i < this.startAt) continue;
      if (!this.started) {
        this.started = true;
        this.port.postMessage({ type: 'started', frame: currentFrame + i } satisfies RecorderEvent);
      }
      let s = 0;
      for (let c = 0; c < input.length; c++) s += input[c][i];
      this.buf[this.n++] = s / input.length;
      if (this.n === CHUNK) this.flush();
    }
    return true;
  }

  private flush() {
    if (this.n === 0) return;
    const data = this.buf.slice(0, this.n);
    this.port.postMessage({ type: 'chunk', data } satisfies RecorderEvent, [data.buffer]);
    this.n = 0;
  }
}

registerProcessor('hum2midi-recorder', RecorderProcessor);
