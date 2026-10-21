// 6. 即時顯示用的音高（只做顯示，不產生最終結果）：AnalyserNode 取時域資料丟給 pitchy。

import { PitchDetector } from 'pitchy';
import { hzToMidi } from '../analysis/smoothing';

export const LIVE_CLARITY = 0.8;

export type LiveReading = { midi: number | null; clarity: number; rms: number };

export class LivePitch {
  private buf: Float32Array<ArrayBuffer>;
  private detector: PitchDetector<Float32Array>;

  constructor(
    private analyser: AnalyserNode,
    private sampleRate: number,
  ) {
    this.buf = new Float32Array(analyser.fftSize);
    this.detector = PitchDetector.forFloat32Array(analyser.fftSize);
  }

  read(): LiveReading {
    this.analyser.getFloatTimeDomainData(this.buf);
    let sq = 0;
    for (const x of this.buf) sq += x * x;
    const rms = Math.sqrt(sq / this.buf.length);
    if (rms < 1e-4) return { midi: null, clarity: 0, rms };
    const [hz, clarity] = this.detector.findPitch(this.buf, this.sampleRate);
    const ok = clarity >= LIVE_CLARITY && hz >= 70 && hz <= 1100;
    return { midi: ok ? hzToMidi(hz) : null, clarity, rms };
  }
}
