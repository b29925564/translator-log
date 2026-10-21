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
  /** 第 1 小節第 1 拍在錄音裡的位置（秒）。用節拍器錄的是 0；事後手動設 BPM 時是第一個音的起點。 */
  gridOffset?: number;
  /** 使用者選的調；沒有就用偵測到的第 1 名。 */
  key?: Key;
  settings: AnalysisSettings;
  /** 說話變唱歌模式的設定與自評（mode = 'speech-song' 時才有）。 */
  speech?: SpeechSettings;
};

export type SpeechSettings = {
  /** 誇張化 1.0–2.0 */
  exaggeration: number;
  /** 伴奏型：長音／分解和弦 */
  pattern: 'pad' | 'arpeggio';
  drums: boolean;
  /** 循環次數（5–20）與每次之間的停頓（0.3–2 秒） */
  repeats: number;
  gap: number;
  /** 第 1…N 次播完後的自評（1 = 完全像說話 … 5 = 完全像唱歌），沒點就是 null */
  ratings: (number | null)[];
};

export const DEFAULT_SPEECH: SpeechSettings = { exaggeration: 1.4, pattern: 'pad', drums: false, repeats: 10, gap: 0.8, ratings: [] };

export const DEFAULT_SETTINGS: AnalysisSettings = {
  sensitivity: 0.5,
  splitSensitivity: 0.6,
  tuningCorrection: true,
  quantize: { enabled: true, grid: '1/16', strength: 0.75 },
  snapToScale: false,
};
