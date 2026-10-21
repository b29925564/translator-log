// 編輯頁右側的設定：改任何一項都會立即重新分析（覆蓋手動編輯前會先確認）。

import { keyName } from '../analysis/key';
import type { Session } from '../app/state';
import { BPM_MAX, BPM_MIN } from '../audio/metronome';
import type { AnalysisSettings, Key, QuantizeGrid, Take } from '../types';
import { h } from './dom';

export type TakePatch = Partial<Pick<Take, 'settings' | 'bpm' | 'gridOffset' | 'key'>>;

const GRIDS: { id: QuantizeGrid; label: string }[] = [
  { id: '1/4', label: '1/4' },
  { id: '1/8', label: '1/8' },
  { id: '1/16', label: '1/16' },
  { id: '1/8T', label: '1/8 三連音' },
];

export function createEditSettings(onChange: (patch: TakePatch) => void) {
  let session: Session | null = null;
  const settings = (): AnalysisSettings => session!.take.settings;
  const patchSettings = (p: Partial<AnalysisSettings>) => onChange({ settings: { ...settings(), ...p } });

  const pct = (v: number) => `${Math.round(v * 100)}%`;

  const sensValue = h('span', { class: 'num small' });
  const sens = h('input', {
    type: 'range',
    min: 0,
    max: 1,
    step: 0.05,
    'aria-label': '靈敏度',
    oninput: () => (sensValue.textContent = pct(Number(sens.value))),
    onchange: () => patchSettings({ sensitivity: Number(sens.value) }),
  });
  const splitValue = h('span', { class: 'num small' });
  const split = h('input', {
    type: 'range',
    min: 0,
    max: 1,
    step: 0.05,
    'aria-label': '切分敏感度',
    oninput: () => (splitValue.textContent = pct(Number(split.value))),
    onchange: () => patchSettings({ splitSensitivity: Number(split.value) }),
  });
  const tuning = h('input', { type: 'checkbox', 'aria-label': '調音校正', onchange: () => patchSettings({ tuningCorrection: tuning.checked }) });
  const tuningInfo = h('span', { class: 'num small muted' });

  const bpm = h('input', {
    type: 'number',
    min: BPM_MIN,
    max: BPM_MAX,
    step: 1,
    placeholder: '無',
    class: 'num',
    'aria-label': 'BPM（留空＝不量化）',
    onchange: () => {
      const raw = bpm.value.trim();
      if (!raw) return onChange({ bpm: null, gridOffset: 0 });
      const v = Math.round(Number(raw));
      if (!Number.isFinite(v)) return render(session);
      const next = Math.min(BPM_MAX, Math.max(BPM_MIN, v));
      const take = session!.take;
      // 原本沒有 BPM：把第一個音當成第 1 小節第 1 拍
      const gridOffset = take.bpm === null ? (take.notes[0]?.start ?? 0) : (take.gridOffset ?? 0);
      onChange({ bpm: next, gridOffset });
    },
  });
  const clearBpm = h('button', { class: 'btn icon small', 'aria-label': '清除 BPM', onclick: () => onChange({ bpm: null, gridOffset: 0 }) }, '×');

  const q = h('input', { type: 'checkbox', 'aria-label': '量化', onchange: () => patchSettings({ quantize: { ...settings().quantize, enabled: q.checked } }) });
  const grid = h(
    'select',
    { 'aria-label': '量化格線', onchange: () => patchSettings({ quantize: { ...settings().quantize, grid: grid.value as QuantizeGrid } }) },
    ...GRIDS.map((g) => h('option', { value: g.id }, g.label)),
  );
  const strengthValue = h('span', { class: 'num small' });
  const strength = h('input', {
    type: 'range',
    min: 0,
    max: 1,
    step: 0.05,
    'aria-label': '量化強度',
    oninput: () => (strengthValue.textContent = pct(Number(strength.value))),
    onchange: () => patchSettings({ quantize: { ...settings().quantize, strength: Number(strength.value) } }),
  });
  const qNote = h('div', { class: 'small muted' }, '設定 BPM（或錄音時開節拍器）才會量化。');

  const keyList = h('div', { class: 'key-list', role: 'radiogroup', 'aria-label': '調性（偵測到的前 2 名）' });
  const snap = h('input', { type: 'checkbox', 'aria-label': '吸附到音階', onchange: () => patchSettings({ snapToScale: snap.checked }) });

  const row = (...c: (Node | string)[]) => h('div', { class: 'set-row' }, ...c);
  const el = h(
    'aside',
    { class: 'settings panel', 'aria-label': '分析設定' },
    h('h2', {}, '分析'),
    row(h('label', { class: 'field grow' }, '靈敏度', sens), sensValue),
    row(h('label', { class: 'field grow' }, '切分敏感度', split), splitValue),
    row(h('label', { class: 'field' }, tuning, '調音校正'), tuningInfo),
    h('h2', {}, '節奏'),
    row(h('label', { class: 'field' }, 'BPM', bpm), clearBpm),
    row(h('label', { class: 'field' }, q, '量化'), h('label', { class: 'field' }, grid)),
    row(h('label', { class: 'field grow' }, '強度', strength), strengthValue),
    qNote,
    h('h2', {}, '調性'),
    keyList,
    row(h('label', { class: 'field' }, snap, '吸附到音階（調外音移到最近的調內音）')),
    h('p', { class: 'small muted' }, '改任何設定都會重新分析；手動改過的音符會被覆蓋（會先問你）。'),
  );

  function keyOption(k: Key, score: number | null, selected: boolean) {
    return h(
      'label',
      { class: 'field key-option' },
      h('input', {
        type: 'radio',
        name: 'key',
        checked: selected,
        onchange: () => onChange({ key: { tonic: k.tonic, mode: k.mode } }),
      }),
      keyName(k),
      score === null ? '' : h('span', { class: 'num small muted' }, `r=${score.toFixed(2)}`),
    );
  }

  function render(s: Session | null) {
    session = s;
    if (!s) return;
    const st = s.take.settings;
    sens.value = String(st.sensitivity);
    sensValue.textContent = pct(st.sensitivity);
    split.value = String(st.splitSensitivity);
    splitValue.textContent = pct(st.splitSensitivity);
    tuning.checked = st.tuningCorrection;
    const c = Math.round(s.analysis.tuningCents);
    tuningInfo.textContent = `${c > 0 ? '+' : ''}${c}¢`;
    bpm.value = s.take.bpm === null ? '' : String(s.take.bpm);
    clearBpm.disabled = s.take.bpm === null;
    const hasBpm = s.take.bpm !== null;
    q.checked = st.quantize.enabled;
    q.disabled = !hasBpm;
    grid.value = st.quantize.grid;
    grid.disabled = !hasBpm || !st.quantize.enabled;
    strength.value = String(st.quantize.strength);
    strength.disabled = grid.disabled;
    strengthValue.textContent = pct(st.quantize.strength);
    qNote.hidden = hasBpm;
    snap.checked = st.snapToScale;

    const used = s.analysis.key;
    const options = s.analysis.keys.map((k) => keyOption(k, k.score, !!used && used.tonic === k.tonic && used.mode === k.mode));
    // 使用者選了第 3 名以後的調（例如從庫裡重新開啟）也要列出來
    if (used && !s.analysis.keys.some((k) => k.tonic === used.tonic && k.mode === used.mode)) options.unshift(keyOption(used, null, true));
    keyList.replaceChildren(...(options.length ? options : [h('span', { class: 'small muted' }, '沒有音符，無法判斷調性')]));
  }

  return { el, render };
}
