// 規劃書第 4 節的資料模型。全部是可序列化的純資料，能在主執行緒、Worker 與 IndexedDB 之間傳遞。

export type PitchFrame = {
  t: number; // 秒（分析窗中心）
  hz: number | null; // 無聲或不可信時為 null
  clarity: number; // 0–1
  rms: number;
};

export type Note = {
  id: string;
  midi: number; // 整數，60 = C4
  start: number; // 秒
  dur: number; // 秒
  velocity: number; // 1–127
};

export type QuantizeGrid = '1/4' | '1/8' | '1/16' | '1/8T';

export type AnalysisSettings = {
  sensitivity: number; // 0–1，影響有聲判定門檻
  splitSensitivity: number; // 0–1，影響切分 hysteresis
  tuningCorrection: boolean;
  quantize: { enabled: boolean; grid: QuantizeGrid; strength: number }; // strength 0–1
  snapToScale: boolean;
};

export type ChordQuality = 'maj' | 'min' | 'dim';

export type Chord = { root: number; quality: ChordQuality; start: number; dur: number };

export type Key = { tonic: number; mode: 'major' | 'minor' };

export type Take = {
  id: string;
  name: string;
  createdAt: number;
  mode: 'hum' | 'speech-song';
  sampleRate: number;
  audio: Blob; // WAV
  notes: Note[];
  chords?: Chord[];
  /** null = 沒開節拍器、也沒手動設定 BPM（不量化，匯出時 tempo 寫 120）。 */
  bpm: number | null;
  key?: Key;
  settings: AnalysisSettings;
};

export const DEFAULT_SETTINGS: AnalysisSettings = {
  sensitivity: 0.5,
  splitSensitivity: 0.6,
  tuningCorrection: true,
  quantize: { enabled: true, grid: '1/16', strength: 0.75 },
  snapToScale: false,
};
