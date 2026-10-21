// 錄音流程：待命 →（預備拍）→ 錄音中 → 分析中 → 切到編輯頁。

import { audioContext, outputLatency } from '../audio/context';
import { LivePitch } from '../audio/live-pitch';
import { BEATS_PER_BAR, Metronome } from '../audio/metronome';
import { MAX_SECONDS, MicError, Recorder } from '../audio/recorder';
import { sessionFromRecording } from './session';
import { setRec, store } from './state';

/** 短於這個長度的錄音當作誤觸，直接丟掉。 */
const MIN_SECONDS = 0.3;

class RecordingController {
  recorder: Recorder | null = null;
  live: LivePitch | null = null;
  private metronome: Metronome | null = null;
  private timers: number[] = [];
  private watchdog = 0;
  /** 開始錄音那一刻的 performance.now()（預備拍結束的時候），給畫面上的計時器用。 */
  startedAt = 0;

  /** 打開麥克風（重複呼叫沒關係）。 */
  async openMic(): Promise<Recorder> {
    if (this.recorder?.open) return this.recorder;
    const ctx = audioContext();
    this.recorder = await Recorder.open(ctx);
    this.live = new LivePitch(this.recorder.analyser, ctx.sampleRate);
    return this.recorder;
  }

  /** 已經允許過麥克風的話，一進錄音頁就先打開，按下空白鍵立刻開始錄、即時音高也先動起來。 */
  async warmUp() {
    try {
      const perm = await navigator.permissions?.query({ name: 'microphone' as PermissionName });
      if (perm?.state === 'granted' && store.get().page === 'record') {
        const rec = await this.openMic();
        // 還沒有任何使用者動作時 AudioContext 會是暫停狀態；第一次按鍵或點擊時恢復，即時音高才會動
        if (rec.ctx.state === 'suspended') {
          const resume = () => void rec.ctx.resume();
          window.addEventListener('pointerdown', resume, { once: true, capture: true });
          window.addEventListener('keydown', resume, { once: true, capture: true });
        }
      }
    } catch {
      // 不支援 permissions.query（例如舊版 Safari）：等第一次按下錄音再要權限
    }
  }

  /** 離開錄音頁時關掉麥克風（瀏覽器的錄音指示燈也會熄掉）。 */
  release() {
    if (store.get().rec.status !== 'idle') return;
    this.recorder?.close();
    this.recorder = null;
    this.live = null;
  }

  toggle() {
    const { status } = store.get().rec;
    if (status === 'idle') void this.start();
    else if (status === 'countin') this.cancel();
    else if (status === 'recording') void this.stop();
  }

  async start() {
    if (store.get().rec.status !== 'idle') return;
    setRec({ status: 'opening', error: null });
    let rec: Recorder;
    try {
      rec = await this.openMic();
    } catch (err) {
      setRec({ status: 'idle', error: err instanceof MicError ? err.message : String(err) });
      return;
    }
    const ctx = rec.ctx;
    const { metronome, bpm, latencyOffsetMs } = store.get().prefs;
    if (!metronome) {
      rec.start();
      this.beginRecording();
      return;
    }
    // 一小節預備拍；第 1 小節第 1 拍（T0）開始收音。
    // 唱的人是跟著「聽到的」拍子唱：聽到的時間比排程晚 outputLatency，麥克風收進來又晚一點（手動偏移補）。
    this.metronome ??= new Metronome(ctx);
    const beat = 60 / bpm;
    const t = ctx.currentTime + 0.1;
    const t0 = t + BEATS_PER_BAR * beat;
    this.metronome.onBeat = (n, when) => {
      if (n >= BEATS_PER_BAR) return;
      this.at(when, () => setRec({ count: BEATS_PER_BAR - n }));
    };
    this.metronome.start(t, bpm);
    rec.start(t0 + outputLatency(ctx) + latencyOffsetMs / 1000);
    setRec({ status: 'countin', count: BEATS_PER_BAR });
    this.at(t0, () => this.beginRecording());
  }

  private beginRecording() {
    this.startedAt = performance.now();
    setRec({ status: 'recording', count: 0 });
    this.watchdog = window.setInterval(() => {
      if (this.recorder && this.recorder.seconds >= MAX_SECONDS) void this.stop();
    }, 250);
  }

  /** 在 AudioContext 時間 when 執行（用來讓畫面跟拍子對齊）。 */
  private at(when: number, fn: () => void) {
    const ctx = this.recorder?.ctx;
    const delay = ctx ? Math.max(0, (when - ctx.currentTime) * 1000) : 0;
    this.timers.push(window.setTimeout(fn, delay));
  }

  private clearTimers() {
    this.timers.forEach((t) => window.clearTimeout(t));
    this.timers = [];
    window.clearInterval(this.watchdog);
    this.watchdog = 0;
  }

  /** 預備拍時再按一次：取消，不留任何東西。 */
  cancel() {
    this.clearTimers();
    this.metronome?.stop();
    void this.recorder?.stop();
    setRec({ status: 'idle', count: 0 });
  }

  async stop() {
    const rec = this.recorder;
    if (store.get().rec.status !== 'recording' || !rec) return;
    this.clearTimers();
    this.metronome?.stop();
    setRec({ status: 'analyzing' });
    const samples = await rec.stop();
    if (samples.length < MIN_SECONDS * rec.sampleRate) {
      setRec({ status: 'idle', error: '錄音太短了，再試一次。' });
      return;
    }
    const { metronome, bpm } = store.get().prefs;
    try {
      const session = await sessionFromRecording(samples, rec.sampleRate, metronome ? bpm : null);
      setRec({ status: 'idle' });
      store.set({ session, page: 'edit' });
    } catch (err) {
      setRec({ status: 'idle', error: `分析失敗：${err instanceof Error ? err.message : String(err)}` });
    }
  }
}

export const recording = new RecordingController();
