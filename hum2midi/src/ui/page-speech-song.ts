// 隱藏模式「說話變唱歌」：4 張左右翻的卡片（不往下捲）。
//   1 錄一句話（或從庫裡框選一段） → 2 原封不動循環播放＋自評 → 3 揭曉旋律 → 4 配和弦、播放、匯出多軌 MIDI

import { chordSymbol } from '../analysis/harmonize';
import { keyName } from '../analysis/key';
import { recording } from '../app/recording';
import { analyzeSpeechSession, exportSpeechMidi, playSource, speechSessionFromSamples } from '../app/speech-session';
import { store, type SpeechSession } from '../app/state';
import { audioContext } from '../audio/context';
import { Player } from '../audio/player';
import { RepeatPlayer } from '../audio/repeat';
import { decodeWav } from '../audio/wav';
import { formatClock } from '../music';
import { getTake, listTakes, type TakeMeta } from '../store/takes';
import { DEFAULT_SPEECH, type Key, type SpeechSettings } from '../types';
import { cssVar, fitCanvas, h } from './dom';
import type { Page } from './page';
import { PianoRoll } from './pianoroll';
import { toast } from './toast';
import { Waveform } from './waveform';

const STEPS = ['錄一句話', '循環', '揭曉', '配和弦'];
const SCALE = ['完全像說話', '像說話', '都可以', '像唱歌', '完全像唱歌'];

export function createSpeechPage(): Page {
  let step = 0;
  let active = false;
  const speech = () => store.get().speech;
  const settings = (): SpeechSettings => speech()?.take.speech ?? DEFAULT_SPEECH;

  /** 改 take（設定、評分…）並寫回 store（自動儲存會接手）。 */
  function patchTake(patch: Partial<SpeechSession['take']>) {
    const s = speech();
    if (s) store.set({ speech: { ...s, take: { ...s.take, ...patch } } });
  }
  function patchSpeech(patch: Partial<SpeechSettings>) {
    patchTake({ speech: { ...settings(), ...patch } });
  }

  // ---------- 頂部：步驟 ----------

  const stepButtons = STEPS.map((label, i) =>
    h('button', { class: 'step', role: 'tab', 'aria-selected': 'false', onclick: () => go(i) }, h('span', { class: 'step-no num' }, String(i + 1)), label),
  );
  const prevBtn = h('button', { class: 'btn icon', 'aria-label': '上一步（←）', onclick: () => go(step - 1) }, '←');
  const nextBtn = h('button', { class: 'btn primary', 'aria-label': '下一步（→）', onclick: () => go(step + 1) }, '下一步 →');
  const head = h('div', { class: 'toolbar-row speech-head' }, h('div', { class: 'steps', role: 'tablist', 'aria-label': '步驟' }, ...stepButtons), h('span', { class: 'spacer' }), prevBtn, nextBtn);

  // ---------- 1 錄一句話 ----------

  const recBtnLabel = h('span', {}, '開始錄音');
  const recBtn = h(
    'button',
    { class: 'rec-button', 'data-status': 'idle', 'aria-label': '錄一句話（空白鍵）', onclick: () => recording.toggle({ metronome: false }) },
    h('span', {}, h('span', { class: 'glyph', style: 'display:block;margin:0 auto 6px' }), recBtnLabel),
  );
  const recStatus = h('div', { class: 'muted', 'aria-live': 'polite' }, '按空白鍵錄一句話，再按一次停止。建議 1–3 秒，例如「今天晚上不想加班」。');
  const phraseWave = new Waveform('這句話的波形');
  const phraseInfo = h('div', { class: 'small muted num' });
  const phrasePlay = h('button', { class: 'btn', 'aria-label': '聽一次這句話', onclick: () => playOnce() }, '▶ 聽一次');
  const pickSelect = h('select', { 'aria-label': '從 Takes 庫選一段錄音', class: 'pick-select', onchange: () => void loadSource() }, h('option', { value: '' }, '從 Takes 庫選一段錄音…'));
  const sourceWave = new Waveform('選一段：在波形上拖曳框選');
  sourceWave.selectable = true;
  const selStart = h('input', { type: 'number', min: 0, step: 0.05, class: 'num', 'aria-label': '片段開始（秒）', onchange: () => setSelection() });
  const selEnd = h('input', { type: 'number', min: 0, step: 0.05, class: 'num', 'aria-label': '片段結束（秒）', onchange: () => setSelection() });
  const useSel = h('button', { class: 'btn', 'aria-label': '用框選的這一段', onclick: () => void useSelection() }, '用這一段');
  const sourceBox = h(
    'div',
    { class: 'pick panel' },
    h('div', { class: 'small muted' }, '或從 Takes 庫裡的一段長錄音框選片段：'),
    pickSelect,
    sourceWave.el,
    h('div', { class: 'toolbar-row' }, h('label', { class: 'field small' }, '從', selStart, '秒'), h('label', { class: 'field small' }, '到', selEnd, '秒'), h('span', { class: 'spacer' }), useSel),
  );
  const card1 = h(
    'div',
    { class: 'speech-card' },
    h(
      'div',
      { class: 'speech-cols' },
      h('div', { class: 'speech-rec' }, recBtn, recStatus),
      sourceBox,
    ),
    h('div', { class: 'phrase panel' }, phraseWave.el, h('div', { class: 'toolbar-row' }, phrasePlay, phraseInfo)),
  );

  let sourceSamples: Float32Array | null = null;
  let sourceRate = 48000;
  sourceWave.onSelect = ([a, b]) => {
    selStart.value = a.toFixed(2);
    selEnd.value = b.toFixed(2);
  };

  async function refreshPicker() {
    let takes: TakeMeta[];
    try {
      takes = (await listTakes()).filter((t) => t.mode === 'hum');
    } catch {
      takes = [];
    }
    pickSelect.replaceChildren(
      h('option', { value: '' }, takes.length ? '從 Takes 庫選一段錄音…' : '（庫裡還沒有哼唱錄音）'),
      ...takes.map((t) => h('option', { value: t.id }, `${t.name}（${formatClock(t.duration)}）`)),
    );
  }

  async function loadSource() {
    const id = pickSelect.value;
    if (!id) return;
    const take = await getTake(id);
    if (!take) return;
    const { samples, sampleRate } = decodeWav(await take.audio.arrayBuffer());
    sourceSamples = samples;
    sourceRate = sampleRate;
    const dur = samples.length / sampleRate;
    sourceWave.selection = [0, Math.min(3, dur)];
    sourceWave.setAudio(samples, sampleRate);
    selStart.value = '0';
    selEnd.value = Math.min(3, dur).toFixed(2);
  }

  function setSelection() {
    const a = Math.max(0, Number(selStart.value) || 0);
    const b = Math.max(a, Number(selEnd.value) || 0);
    sourceWave.selection = [a, Math.min(b, sourceWave.duration)];
    sourceWave.render();
  }

  async function useSelection() {
    if (!sourceSamples || !sourceWave.selection) return toast('先選一段錄音');
    const [a, b] = sourceWave.selection;
    if (b - a < 0.3) return toast('框選的片段太短了（至少 0.3 秒）');
    const part = sourceSamples.slice(Math.round(a * sourceRate), Math.round(b * sourceRate));
    await usePhrase(part, sourceRate);
  }

  async function usePhrase(samples: Float32Array, sampleRate: number) {
    try {
      const s = await speechSessionFromSamples(samples, sampleRate);
      store.set({ speech: s });
      if (s.samples.length / sampleRate > 5) toast('這句話有點長：錯覺通常在短句（1–3 秒）比較明顯。');
    } catch (err) {
      toast(`分析失敗：${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  }

  // 錄音：這一頁顯示時，錄完的音訊交給說話變唱歌（不跑哼唱流程）
  const onRecorded = (samples: Float32Array, sampleRate: number) => usePhrase(samples, sampleRate);

  // ---------- 2 循環 ----------

  const repeats = h('input', { type: 'number', min: 5, max: 20, step: 1, class: 'num', 'aria-label': '循環次數（5–20）', onchange: () => patchSpeech({ repeats: clamp(Math.round(Number(repeats.value)), 5, 20) }) });
  const gap = h('input', { type: 'number', min: 0.3, max: 2, step: 0.1, class: 'num', 'aria-label': '每次之間停頓（秒）', onchange: () => patchSpeech({ gap: clamp(Number(gap.value), 0.3, 2) }) });
  const loopBtn = h('button', { class: 'btn primary', 'aria-label': '開始循環（空白鍵）', onclick: () => toggleLoop() }, '▶ 開始循環');
  const counter = h('div', { class: 'counter num', 'aria-live': 'polite' }, '– / –');
  const ratingButtons = SCALE.map((label, i) =>
    h('button', { class: 'rate', 'aria-label': `第 ${i + 1} 級：${label}（按 ${i + 1}）`, 'aria-pressed': 'false', onclick: () => rate(i + 1) }, h('span', { class: 'num' }, String(i + 1)), label),
  );
  const chart = h('canvas', { class: 'rating-chart', role: 'img', 'aria-label': '評分曲線' });
  const card2 = h(
    'div',
    { class: 'speech-card' },
    h('div', { class: 'toolbar-row' }, h('label', { class: 'field' }, '循環', repeats, '次'), h('label', { class: 'field' }, '每次之間停頓', gap, '秒'), h('span', { class: 'spacer' }), loopBtn),
    h('div', { class: 'loop-stage' }, counter, h('div', { class: 'rates', role: 'group', 'aria-label': '這一次聽起來像…（可略過）' }, ...ratingButtons)),
    h('div', { class: 'rating-wrap panel' }, chart),
    h('p', { class: 'small muted' }, '同一句話會原封不動地重複播放。聽著聽著，有些人會開始覺得它在「唱」。每次播完可以點一下感覺（可略過）。並非每一句話都會產生這種錯覺——聽起來一直像說話也很正常。'),
  );

  let repeater: RepeatPlayer | null = null;
  let loopRaf = 0;
  let ratingIndex = -1; // 目前評分會記到第幾次

  function toggleLoop() {
    if (repeater?.running) stopLoop();
    else startLoop();
  }

  function startLoop() {
    const s = speech();
    if (!s) return;
    stopPlayback();
    repeater ??= new RepeatPlayer(audioContext());
    const sp = settings();
    patchSpeech({ ratings: new Array<number | null>(sp.repeats).fill(null) });
    repeater.onDone = () => {
      renderLoop();
      drawChart();
    };
    repeater.start(s.samples, s.take.sampleRate, sp.repeats, sp.gap);
    cancelAnimationFrame(loopRaf);
    loopRaf = requestAnimationFrame(loopTick);
    renderLoop();
  }

  function stopLoop() {
    repeater?.stop();
    cancelAnimationFrame(loopRaf);
    renderLoop();
  }

  function loopTick() {
    const st = repeater?.state();
    if (st) {
      ratingIndex = st.index;
      counter.textContent = `${st.index + 1} / ${settings().repeats}`;
      loopRaf = requestAnimationFrame(loopTick);
    }
    renderRatings();
  }

  function rate(value: number) {
    const sp = settings();
    if (ratingIndex < 0 || !sp.ratings.length) return;
    const ratings = [...sp.ratings];
    ratings[Math.min(ratingIndex, ratings.length - 1)] = value;
    patchSpeech({ ratings });
    renderRatings();
    drawChart();
  }

  function renderLoop() {
    const running = !!repeater?.running;
    loopBtn.textContent = running ? '■ 停止' : settings().ratings.length ? '↻ 再聽一輪' : '▶ 開始循環';
    loopBtn.setAttribute('aria-label', running ? '停止循環（空白鍵）' : '開始循環（空白鍵）');
    repeats.disabled = running;
    gap.disabled = running;
    if (!running && ratingIndex < 0) counter.textContent = `– / ${settings().repeats}`;
  }

  function renderRatings() {
    const r = settings().ratings[ratingIndex];
    ratingButtons.forEach((b, i) => {
      b.setAttribute('aria-pressed', String(r === i + 1));
      b.disabled = ratingIndex < 0;
    });
  }

  function drawChart() {
    const { w, h: H, ctx } = fitCanvas(chart);
    ctx.fillStyle = cssVar('--panel');
    ctx.fillRect(0, 0, w, H);
    const ratings = settings().ratings;
    const n = Math.max(ratings.length, settings().repeats);
    const padL = 92;
    const padR = 16;
    const padT = 14;
    const padB = 26;
    const x = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * (w - padL - padR));
    const y = (v: number) => padT + ((5 - v) / 4) * (H - padT - padB);
    ctx.font = `11px ${cssVar('--sans')}`;
    ctx.textBaseline = 'middle';
    for (let v = 1; v <= 5; v++) {
      ctx.fillStyle = cssVar('--grid-strong');
      ctx.fillRect(padL, Math.round(y(v)), w - padL - padR, 1);
      ctx.fillStyle = cssVar('--muted');
      ctx.fillText(SCALE[v - 1], 6, y(v));
    }
    ctx.font = `11px ${cssVar('--mono')}`;
    for (let i = 0; i < n; i++) ctx.fillText(String(i + 1), x(i) - 3, H - 10);
    const pts = ratings.map((v, i) => (v === null ? null : { x: x(i), y: y(v) })).filter((p): p is { x: number; y: number } => p !== null);
    if (!pts.length) {
      ctx.fillStyle = cssVar('--muted');
      ctx.font = `13px ${cssVar('--sans')}`;
      ctx.textAlign = 'center';
      ctx.fillText('循環時點選感覺，這裡會畫出你的評分曲線（第 1 次到最後一次）', padL + (w - padL - padR) / 2, H / 2);
      ctx.textAlign = 'start';
      return;
    }
    ctx.strokeStyle = cssVar('--accent');
    ctx.lineWidth = 3;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
    ctx.fillStyle = cssVar('--accent');
    for (const p of pts) ctx.fillRect(p.x - 4, p.y - 4, 8, 8);
  }

  // ---------- 3 揭曉 ----------

  const roll = new PianoRoll('從這句話抽出的旋律與原始音高曲線');
  const exagValue = h('span', { class: 'num small' });
  const exag = h('input', {
    type: 'range',
    min: 1,
    max: 2,
    step: 0.05,
    'aria-label': '誇張化',
    oninput: () => (exagValue.textContent = `×${Number(exag.value).toFixed(2)}`),
    onchange: () => void reanalyze({ speech: { ...settings(), exaggeration: Number(exag.value) } }),
  });
  const revealInfo = h('span', { class: 'small muted num' });
  const playVoice = h('button', { class: 'btn', 'aria-label': '播放原聲', onclick: () => togglePlay('voice-only') }, '▶ 原聲');
  const playMelody = h('button', { class: 'btn primary', 'aria-label': '播放旋律（空白鍵）', onclick: () => togglePlay('melody-only') }, '▶ 旋律');
  const card3 = h(
    'div',
    { class: 'speech-card' },
    h('div', { class: 'toolbar-row' }, playMelody, playVoice, h('label', { class: 'field' }, '誇張化', exag, exagValue), h('span', { class: 'spacer' }), revealInfo),
    h('div', { class: 'reveal' }, roll.el),
  );

  // ---------- 4 配和弦 ----------

  const keyList = h('div', { class: 'toolbar-row', role: 'radiogroup', 'aria-label': '調性' });
  const chordChart = h('div', { class: 'chord-chart num', 'aria-label': '和弦進行' });
  const patternSeg = (['pad', 'arpeggio'] as const).map((p) =>
    h('button', { class: 'seg', role: 'radio', 'aria-checked': 'false', onclick: () => patchSpeech({ pattern: p }) }, p === 'pad' ? '長音' : '分解和弦'),
  );
  const drumsBox = h('input', { type: 'checkbox', 'aria-label': '鼓組', onchange: () => patchSpeech({ drums: drumsBox.checked }) });
  const loopBox = h('input', { type: 'checkbox', checked: true, 'aria-label': '循環播放' });
  const playVoiceChords = h('button', { class: 'btn primary', 'aria-label': '原聲＋和弦（空白鍵）', onclick: () => togglePlay('voice') }, '▶ 原聲＋和弦');
  const playMelodyChords = h('button', { class: 'btn', 'aria-label': '旋律合成音＋和弦', onclick: () => togglePlay('melody') }, '▶ 旋律＋和弦');
  const exportBtn = h('button', { class: 'btn', 'aria-label': '匯出多軌 MIDI', onclick: () => withSpeech(exportSpeechMidi) }, '⬇ 匯出 MIDI');
  const card4 = h(
    'div',
    { class: 'speech-card' },
    h('div', { class: 'toolbar-row' }, h('strong', {}, '調性'), keyList),
    chordChart,
    h(
      'div',
      { class: 'toolbar-row' },
      h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': '伴奏型' }, ...patternSeg),
      h('label', { class: 'field' }, drumsBox, '鼓組'),
      h('label', { class: 'field' }, loopBox, '循環播放'),
    ),
    h('div', { class: 'toolbar-row big-play' }, playVoiceChords, playMelodyChords, h('span', { class: 'spacer' }), exportBtn),
    h('p', { class: 'small muted' }, '「原聲＋和弦」是重頭戲：原本的說話聲配上和弦。匯出的 MIDI 有 Melody、Chords（勾了鼓組還有 Drums）三軌，可以直接拖進 GarageBand。'),
  );

  // ---------- 播放 ----------

  let player: Player | null = null;
  let playing: 'voice' | 'melody' | 'voice-only' | 'melody-only' | 'once' | null = null;
  let playRaf = 0;

  function togglePlay(what: NonNullable<typeof playing>) {
    if (playing === what) return stopPlayback();
    const s = speech();
    if (!s) return;
    stopLoop();
    player ??= new Player(audioContext());
    player.onEnd = () => {
      playing = null;
      renderPlay();
    };
    const drums = settings().drums;
    if (what === 'voice-only') player.play({ samples: s.samples, sampleRate: s.take.sampleRate, notes: [] }, { original: 1, synth: 0 });
    else if (what === 'melody-only') player.play({ sampleRate: s.take.sampleRate, notes: s.take.notes }, { original: 0, synth: 0.8 });
    else if (what === 'voice') player.play(playSource(s, 'voice', drums), { original: 1, synth: 0, chords: 0.45, drums: 0.7 }, 0, loopBox.checked);
    else player.play(playSource(s, 'melody', drums), { original: 0, synth: 0.7, chords: 0.45, drums: 0.7 }, 0, loopBox.checked);
    playing = what;
    renderPlay();
    cancelAnimationFrame(playRaf);
    playRaf = requestAnimationFrame(playTick);
  }

  function playOnce() {
    if (playing === 'once') return stopPlayback();
    const s = speech();
    if (!s) return;
    stopLoop();
    player ??= new Player(audioContext());
    player.onEnd = () => {
      playing = null;
      renderPlay();
    };
    player.play({ samples: s.samples, sampleRate: s.take.sampleRate, notes: [] }, { original: 1, synth: 0 });
    playing = 'once';
    renderPlay();
    cancelAnimationFrame(playRaf);
    playRaf = requestAnimationFrame(playTick);
  }

  function playTick() {
    const pos = player?.position ?? null;
    roll.playhead = pos;
    roll.render();
    phraseWave.playhead = playing === 'once' ? pos : null;
    phraseWave.render();
    if (pos !== null) playRaf = requestAnimationFrame(playTick);
  }

  function stopPlayback() {
    player?.stop();
    playing = null;
    cancelAnimationFrame(playRaf);
    roll.playhead = null;
    roll.render();
    phraseWave.playhead = null;
    phraseWave.render();
    renderPlay();
  }

  function renderPlay() {
    const label = (b: HTMLButtonElement, on: boolean, text: string) => (b.textContent = `${on ? '■' : '▶'} ${text}`);
    label(playVoice, playing === 'voice-only', '原聲');
    label(playMelody, playing === 'melody-only', '旋律');
    label(playVoiceChords, playing === 'voice', '原聲＋和弦');
    label(playMelodyChords, playing === 'melody', '旋律＋和弦');
    label(phrasePlay, playing === 'once', '聽一次');
  }

  // ---------- 重新分析（誇張化、調性） ----------

  let busy = false;
  async function reanalyze(patch: Partial<SpeechSession['take']>) {
    const s = speech();
    if (!s || busy) return;
    busy = true;
    try {
      const next = await analyzeSpeechSession({ ...s.take, ...patch }, s.samples);
      if (speech()?.take.id === s.take.id) store.set({ speech: next });
    } finally {
      busy = false;
    }
  }

  function withSpeech(fn: (s: SpeechSession) => void) {
    const s = speech();
    if (s) fn(s);
  }

  // ---------- 畫面 ----------

  const cards = [card1, card2, card3, card4];
  const deck = h('div', { class: 'speech-deck' }, ...cards);
  const el = h('section', { class: 'page speech', 'aria-label': '說話變唱歌' }, head, deck);

  function go(i: number) {
    const s = speech();
    const max = s ? 3 : 0;
    const next = clamp(i, 0, max);
    if (next === step) return;
    if (step === 1) stopLoop();
    stopPlayback();
    step = next;
    render();
  }

  let shownId: string | null = null;
  function render() {
    const s = speech();
    if (s?.take.id !== shownId) {
      shownId = s?.take.id ?? null;
      ratingIndex = s?.take.speech?.ratings.length ? s.take.speech.ratings.length - 1 : -1;
    }
    cards.forEach((c, i) => (c.hidden = i !== step));
    stepButtons.forEach((b, i) => {
      b.setAttribute('aria-selected', String(i === step));
      b.disabled = i > 0 && !s;
    });
    prevBtn.disabled = step === 0;
    nextBtn.disabled = !s;
    nextBtn.hidden = step === 3;
    nextBtn.textContent = step < 3 ? `下一步：${STEPS[step + 1]} →` : '';

    const sp = settings();
    phraseWave.setAudio(s?.samples ?? null, s?.take.sampleRate);
    phraseInfo.textContent = s ? `${s.take.name} · ${(s.samples.length / s.take.sampleRate).toFixed(2)} 秒（已修剪頭尾靜音）` : '還沒有一句話。';
    phrasePlay.disabled = !s;

    repeats.value = String(sp.repeats);
    gap.value = String(sp.gap);
    renderLoop();
    renderRatings();
    if (step === 1) requestAnimationFrame(drawChart);

    exag.value = String(sp.exaggeration);
    exagValue.textContent = `×${sp.exaggeration.toFixed(2)}`;
    if (s) {
      const a = s.analysis;
      revealInfo.textContent = `${s.take.notes.length} 個音 · ${s.take.bpm} BPM · ${a.key ? keyName(a.key) : '–'}`;
      roll.gridOffset = s.take.gridOffset ?? 0;
      roll.setData({ notes: s.take.notes, curve: { t: a.frames.map((f) => f.t), midi: a.curve }, duration: s.samples.length / s.take.sampleRate, bpm: s.take.bpm }, true);
      renderKeys(s);
      renderChords(s);
    }
    patternSeg.forEach((b, i) => b.setAttribute('aria-checked', String((i === 0 ? 'pad' : 'arpeggio') === sp.pattern)));
    drumsBox.checked = sp.drums;
    renderPlay();
  }

  function renderKeys(s: SpeechSession) {
    const used = s.analysis.key;
    const opt = (k: Key, score: number | null) =>
      h(
        'label',
        { class: 'field' },
        h('input', { type: 'radio', name: 'speech-key', checked: !!used && used.tonic === k.tonic && used.mode === k.mode, onchange: () => void reanalyze({ key: { tonic: k.tonic, mode: k.mode } }) }),
        keyName(k),
        score === null ? '' : h('span', { class: 'num small muted' }, `r=${score.toFixed(2)}`),
      );
    const items = s.analysis.keys.map((k) => opt(k, k.score));
    if (used && !s.analysis.keys.some((k) => k.tonic === used.tonic && k.mode === used.mode)) items.unshift(opt(used, null));
    keyList.replaceChildren(...items);
  }

  function renderChords(s: SpeechSession) {
    const chords = s.analysis.chords;
    if (!chords.length) {
      chordChart.replaceChildren(h('span', { class: 'muted' }, '沒有抽到旋律，無法配和弦。'));
      return;
    }
    chordChart.replaceChildren(
      ...chords.map((c) => h('div', { class: 'chord' }, h('span', { class: 'chord-sym' }, chordSymbol(c)), h('span', { class: 'chord-roman small muted' }, c.name))),
    );
  }

  store.subscribe((s, prev) => {
    if (s.speech !== prev.speech) {
      // 不在這一頁時重新開啟了一句話（從庫裡開啟會重新分析）：直接到「揭曉」
      if (!active && s.speech && s.speech.analysis !== prev.speech?.analysis) step = 2;
      render();
    }
    if (s.rec !== prev.rec) {
      const st = s.rec.status;
      recBtn.dataset.status = st;
      recBtnLabel.textContent = st === 'recording' ? '停止' : st === 'analyzing' ? '分析中' : st === 'opening' ? '請稍候' : '開始錄音';
      recBtn.disabled = st === 'opening' || st === 'analyzing';
      if (s.rec.error) recStatus.textContent = s.rec.error;
      else recStatus.textContent = st === 'recording' ? '錄音中…再按一次空白鍵停止。' : '按空白鍵錄一句話，再按一次停止。建議 1–3 秒，例如「今天晚上不想加班」。';
    }
  });
  render();

  return {
    el,
    show() {
      active = true;
      el.classList.add('active');
      recording.onRecorded = onRecorded;
      void refreshPicker();
      render();
    },
    hide() {
      active = false;
      el.classList.remove('active');
      recording.onRecorded = null;
      stopLoop();
      stopPlayback();
      recording.release();
    },
    onKey(e) {
      if (e.key === 'ArrowRight') {
        go(step + 1);
        return true;
      }
      if (e.key === 'ArrowLeft') {
        go(step - 1);
        return true;
      }
      if (e.code === 'Space') {
        if (e.repeat) return true;
        if (step === 0) recording.toggle({ metronome: false });
        else if (step === 1) toggleLoop();
        else if (step === 2) togglePlay('melody-only');
        else togglePlay('voice');
        return true;
      }
      if (step === 1 && /^[1-5]$/.test(e.key)) {
        rate(Number(e.key));
        return true;
      }
      return false;
    },
  };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));
}
