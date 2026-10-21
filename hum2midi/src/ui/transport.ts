// 編輯頁的播放控制：▶／■、原音／合成音／兩者、各自的音量；播放頭跟著走。

import { setPrefs, store } from '../app/state';
import type { PlayMode } from '../app/prefs';
import { audioContext } from '../audio/context';
import { Player, playLength, type Mix, type PlaySource } from '../audio/player';
import { formatClock } from '../music';
import { h } from './dom';

const MODES: { id: PlayMode; label: string }[] = [
  { id: 'original', label: '原音' },
  { id: 'synth', label: '合成音' },
  { id: 'both', label: '兩者' },
];

export type Transport = {
  el: HTMLElement;
  toggle(): void;
  stop(): void;
  /** 播放中改變起點：從新的位置重播。 */
  restart(): void;
  readonly playing: boolean;
};

export function createTransport(opts: {
  source: () => PlaySource | null;
  from: () => number;
  onPosition: (t: number | null) => void;
}): Transport {
  let player: Player | null = null;
  let raf = 0;

  const playBtn = h('button', { class: 'btn primary icon', 'aria-label': '播放（空白鍵）', onclick: () => toggle() }, '▶');
  const clock = h('span', { class: 'num small muted', 'aria-hidden': 'true' }, '00:00.0');
  const prefs = store.get().prefs;

  const modeButtons = MODES.map((m) =>
    h(
      'button',
      {
        class: 'seg',
        role: 'radio',
        'aria-checked': String(prefs.playMode === m.id),
        onclick: () => {
          setPrefs({ playMode: m.id });
          renderModes();
          if (player?.playing) restart();
        },
      },
      m.label,
    ),
  );
  const volume = (label: string, key: 'volOriginal' | 'volSynth') => {
    const input = h('input', {
      type: 'range',
      min: 0,
      max: 1,
      step: 0.05,
      value: prefs[key],
      'aria-label': `${label}音量`,
      oninput: () => setPrefs({ [key]: Number(input.value) }),
      onchange: () => {
        if (player?.playing) restart();
      },
    });
    return h('label', { class: 'field small' }, label, input);
  };

  function renderModes() {
    const mode = store.get().prefs.playMode;
    MODES.forEach((m, i) => modeButtons[i].setAttribute('aria-checked', String(m.id === mode)));
  }

  function mix(): Mix {
    const p = store.get().prefs;
    return {
      original: p.playMode === 'synth' ? 0 : p.volOriginal,
      synth: p.playMode === 'original' ? 0 : p.volSynth,
    };
  }

  function tick() {
    const pos = player?.position ?? null;
    opts.onPosition(pos);
    if (pos !== null) clock.textContent = formatClock(pos);
    raf = pos === null ? 0 : requestAnimationFrame(tick);
  }

  function play() {
    const src = opts.source();
    if (!src) return;
    player ??= new Player(audioContext());
    player.onEnd = () => {
      render();
      opts.onPosition(null);
    };
    let from = opts.from();
    if (from >= playLength(src) - 0.05) from = 0;
    player.play(src, mix(), from);
    render();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    player?.stop();
    cancelAnimationFrame(raf);
    raf = 0;
    opts.onPosition(null);
    render();
  }

  function toggle() {
    if (player?.playing) stop();
    else play();
  }

  function restart() {
    if (player?.playing) play();
  }

  function render() {
    const on = !!player?.playing;
    playBtn.textContent = on ? '■' : '▶';
    playBtn.setAttribute('aria-label', on ? '停止（空白鍵）' : '播放（空白鍵）');
  }

  const el = h(
    'div',
    { class: 'transport' },
    playBtn,
    clock,
    h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': '播放內容' }, ...modeButtons),
    volume('原音', 'volOriginal'),
    volume('合成', 'volSynth'),
  );

  return {
    el,
    toggle,
    stop,
    restart,
    get playing() {
      return !!player?.playing;
    },
  };
}
