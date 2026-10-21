// 整個 App 共用一個 AudioContext（要在使用者動作裡第一次建立，瀏覽器才允許出聲）。

let ctx: AudioContext | null = null;

export function audioContext(): AudioContext {
  if (!ctx) ctx = new AudioContext({ latencyHint: 'interactive' });
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** 喇叭到耳朵的延遲（秒）：outputLatency，不支援時用 baseLatency。 */
export function outputLatency(c: AudioContext): number {
  const out = (c as AudioContext & { outputLatency?: number }).outputLatency;
  return typeof out === 'number' && out > 0 ? out : c.baseLatency || 0;
}
