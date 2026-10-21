// 修剪頭尾靜音（保留 30 ms 緩衝）。

export type TrimResult = { samples: Float32Array; start: number; end: number }; // start／end：原始樣本索引

export function trimSilence(samples: Float32Array, sampleRate: number, padSec = 0.03): TrimResult {
  const hop = Math.round(sampleRate * 0.01);
  const win = hop * 2;
  const rms: number[] = [];
  for (let i = 0; i + win <= samples.length; i += hop) {
    let s = 0;
    for (let j = i; j < i + win; j++) s += samples[j] * samples[j];
    rms.push(Math.sqrt(s / win));
  }
  if (!rms.length) return { samples, start: 0, end: samples.length };
  const sorted = [...rms].sort((a, b) => a - b);
  const floor = sorted[Math.floor((Math.max(1, Math.round(sorted.length * 0.1)) - 1) / 2)];
  const threshold = Math.max(floor * 3, sorted[sorted.length - 1] * 0.02, 1e-4);
  const first = rms.findIndex((r) => r > threshold);
  if (first < 0) return { samples, start: 0, end: samples.length };
  let last = rms.length - 1;
  while (last > first && rms[last] <= threshold) last--;
  const pad = Math.round(padSec * sampleRate);
  const start = Math.max(0, first * hop - pad);
  const end = Math.min(samples.length, last * hop + win + pad);
  return { samples: samples.slice(start, end), start, end };
}
