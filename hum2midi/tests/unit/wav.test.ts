import { describe, expect, it } from 'vitest';
import { decodeWav, encodeWav } from '../../src/audio/wav';

describe('WAV', () => {
  it('來回：編碼 → 解碼 → 樣本差 < 1/32768', () => {
    const n = 48000;
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = 0.8 * Math.sin((2 * Math.PI * 441 * i) / 48000) + 0.1 * Math.sin(i * 0.37);
    x[0] = 1;
    x[1] = -1;
    x[2] = 0;
    const { samples, sampleRate } = decodeWav(encodeWav(x, 48000));
    expect(sampleRate).toBe(48000);
    expect(samples.length).toBe(n);
    let maxErr = 0;
    for (let i = 0; i < n; i++) maxErr = Math.max(maxErr, Math.abs(samples[i] - x[i]));
    expect(maxErr).toBeLessThan(1 / 32768);
  });

  it('超出 ±1 的樣本被夾住', () => {
    const { samples } = decodeWav(encodeWav(Float32Array.from([1.5, -2]), 44100));
    expect(Array.from(samples)).toEqual([1, -1]);
  });

  it('檔頭：RIFF/WAVE、PCM、單聲道、16-bit', () => {
    const v = new DataView(encodeWav(new Float32Array(10), 44100));
    expect(v.getUint16(20, true)).toBe(1);
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getUint32(24, true)).toBe(44100);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(20);
    expect(v.byteLength).toBe(64);
  });

  it('讀得懂別的格式：立體聲 float32（平均成單聲道）、24-bit PCM，並跳過不認得的區塊', () => {
    // 手工做一個 WAV：LIST 區塊（要跳過）＋ float32 立體聲兩幀
    const floatWav = makeWav({ format: 3, channels: 2, bits: 32, extra: true }, (v, o) => {
      v.setFloat32(o, 0.5, true);
      v.setFloat32(o + 4, -0.25, true);
      v.setFloat32(o + 8, 1, true);
      v.setFloat32(o + 12, 1, true);
    }, 16);
    expect(Array.from(decodeWav(floatWav).samples)).toEqual([0.125, 1]);

    const pcm24 = makeWav({ format: 1, channels: 1, bits: 24 }, (v, o) => {
      // −0.5 = 0xC00000、+0.25 = 0x200000
      v.setUint8(o, 0x00); v.setUint8(o + 1, 0x00); v.setUint8(o + 2, 0xc0);
      v.setUint8(o + 3, 0x00); v.setUint8(o + 4, 0x00); v.setUint8(o + 5, 0x20);
    }, 6);
    expect(Array.from(decodeWav(pcm24).samples)).toEqual([-0.5, 0.25]);
  });

  it('不是 WAV、或格式不支援 → 丟出看得懂的錯誤', () => {
    expect(() => decodeWav(new Uint8Array(44))).toThrow('不是 WAV 檔');
    expect(() => decodeWav(makeWav({ format: 2, channels: 1, bits: 4 }, () => {}, 4))).toThrow('不支援');
  });
});

function makeWav(fmt: { format: number; channels: number; bits: number; extra?: boolean }, fill: (v: DataView, o: number) => void, dataBytes: number) {
  const list = fmt.extra ? 12 : 0;
  const buf = new ArrayBuffer(44 + list + dataBytes);
  const v = new DataView(buf);
  const ascii = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  ascii(0, 'RIFF');
  v.setUint32(4, buf.byteLength - 8, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, fmt.format, true);
  v.setUint16(22, fmt.channels, true);
  v.setUint32(24, 48000, true);
  v.setUint16(34, fmt.bits, true);
  let o = 36;
  if (fmt.extra) {
    ascii(o, 'LIST');
    v.setUint32(o + 4, 4, true);
    ascii(o + 8, 'INFO');
    o += 12;
  }
  ascii(o, 'data');
  v.setUint32(o + 4, dataBytes, true);
  fill(v, o + 8);
  return buf;
}
