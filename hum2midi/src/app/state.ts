// 整個 App 的狀態。

import type { HumAnalysis } from '../analysis/pipeline';
import type { Take } from '../types';
import { loadPrefs, savePrefs, type Prefs } from './prefs';
import { createStore } from './store';

export type Page = 'record' | 'edit' | 'library' | 'speech';

export type RecStatus = 'idle' | 'opening' | 'countin' | 'recording' | 'analyzing';

/** 正在編輯的 take：原始樣本（播放、重新分析用）＋最近一次的分析結果。 */
export type Session = {
  take: Take;
  samples: Float32Array;
  analysis: HumAnalysis;
  /** 分析之後有沒有手動改過音符（重新分析會覆蓋，要先確認）。 */
  edited: boolean;
};

export type AppState = {
  page: Page;
  rec: { status: RecStatus; count: number; error: string | null };
  session: Session | null;
  prefs: Prefs;
};

export const store = createStore<AppState>({
  page: 'record',
  rec: { status: 'idle', count: 0, error: null },
  session: null,
  prefs: loadPrefs(),
});

export function setPrefs(patch: Partial<Prefs>) {
  store.set((s) => ({ prefs: { ...s.prefs, ...patch } }));
  savePrefs(store.get().prefs);
}

export function setRec(patch: Partial<AppState['rec']>) {
  store.set((s) => ({ rec: { ...s.rec, ...patch } }));
}
