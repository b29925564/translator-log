// 存在 localStorage 的使用者偏好（每台電腦各自一份）。讀寫失敗（私密模式等）時用預設值，不影響功能。

export type Prefs = {
  metronome: boolean;
  bpm: number;
  /** 手動延遲補償（毫秒，±150）。 */
  latencyOffsetMs: number;
  /** 隱藏模式「說話變唱歌」已解鎖。 */
  speechUnlocked: boolean;
  /** 看過說明卡了。 */
  onboarded: boolean;
  /** 編輯頁播放：原音／合成音／兩者，各自的音量 0–1。 */
  playMode: PlayMode;
  volOriginal: number;
  volSynth: number;
};

export type PlayMode = 'original' | 'synth' | 'both';

const KEY = 'hum2midi.prefs';

export const DEFAULT_PREFS: Prefs = {
  metronome: false,
  bpm: 90,
  latencyOffsetMs: 0,
  speechUnlocked: false,
  onboarded: false,
  playMode: 'both',
  volOriginal: 0.8,
  volSynth: 0.6,
};

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) } : { ...DEFAULT_PREFS };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // 存不了就算了：下次開啟用預設值
  }
}
