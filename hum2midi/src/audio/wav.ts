// 16-bit PCM WAV 編碼與解碼。純函式，瀏覽器、Worker、Node 都能用。

export type DecodedWav = { samples: Float32Array; sampleRate: number };

/** 單聲道 Float32（−1…1）→ 16-bit PCM WAV。超出範圍的樣本會被夾住。 */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const dataBytes = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buf);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk 大小
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // 單聲道
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(o, s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), true);
  }
  return buf;
}

/**
 * WAV → 單聲道 Float32。支援 PCM 8/16/24/32-bit 與 IEEE float 32-bit；多聲道會平均成單聲道。
 * 錄音與 Takes 庫只會產生 16-bit 單聲道，其他格式是為了讓使用者丟進來的檔案也能讀。
 */
export function decodeWav(input: ArrayBuffer | Uint8Array): DecodedWav {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (readAscii(view, 0) !== 'RIFF' || readAscii(view, 8) !== 'WAVE') throw new Error('不是 WAV 檔');

  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  let dataOffset = -1;
  let dataLength = 0;
  for (let p = 12; p + 8 <= view.byteLength; ) {
    const id = readAscii(view, p);
    const size = view.getUint32(p + 4, true);
    const body = p + 8;
    if (id === 'fmt ') {
      format = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bits = view.getUint16(body + 14, true);
      if (format === 0xfffe && size >= 26) format = view.getUint16(body + 24, true); // WAVE_FORMAT_EXTENSIBLE
    } else if (id === 'data') {
      dataOffset = body;
      dataLength = Math.min(size, view.byteLength - body);
      break;
    }
    p = body + size + (size & 1);
  }
  if (!channels || dataOffset < 0) throw new Error('WAV 缺少 fmt 或 data 區塊');
  if (!(format === 1 && [8, 16, 24, 32].includes(bits)) && !(format === 3 && bits === 32)) {
    throw new Error(`不支援的 WAV 格式（format ${format}、${bits}-bit）`);
  }

  const bytesPer = bits / 8;
  const frames = Math.floor(dataLength / (bytesPer * channels));
  const samples = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) {
      const o = dataOffset + (i * channels + c) * bytesPer;
      sum += readSample(view, o, format, bits);
    }
    samples[i] = sum / channels;
  }
  return { samples, sampleRate };
}

function readSample(view: DataView, o: number, format: number, bits: number): number {
  if (format === 3) return view.getFloat32(o, true);
  switch (bits) {
    case 8:
      return (view.getUint8(o) - 128) / 128;
    case 16: {
      const v = view.getInt16(o, true);
      return v < 0 ? v / 0x8000 : v / 0x7fff;
    }
    case 24:
      // 最高位元組用 getInt8 讀，左移後自然帶正負號
      return (view.getUint8(o) | (view.getUint8(o + 1) << 8) | (view.getInt8(o + 2) << 16)) / 0x800000;
    default:
      return view.getInt32(o, true) / 0x80000000;
  }
}

function writeAscii(view: DataView, o: number, s: string) {
  for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
}

function readAscii(view: DataView, o: number): string {
  return String.fromCharCode(view.getUint8(o), view.getUint8(o + 1), view.getUint8(o + 2), view.getUint8(o + 3));
}
