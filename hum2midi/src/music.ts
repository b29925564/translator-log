// 音名與小工具，畫面顯示用。

const SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

/** 60 → "C4" */
export function midiName(midi: number): string {
  const m = Math.round(midi);
  return `${SHARP[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}

export function pitchClassName(pc: number): string {
  return SHARP[((pc % 12) + 12) % 12];
}

export function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
}

/** 秒 → "01:23.4" */
export function formatClock(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
}
