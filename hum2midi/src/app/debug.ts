// 開發模式給 e2e 測試用的掛勾（正式版不會用到）。

import type { PianoRoll } from '../ui/pianoroll';

export const debugHooks: { roll: PianoRoll | null } = { roll: null };
