// 節拍器：用 AudioContext 時間排程（每 25 ms 往前排 120 ms），不受主執行緒卡頓影響。

export const BPM_MIN = 50;
export const BPM_MAX = 180;
export const BEATS_PER_BAR = 4;

export class Metronome {
  private timer = 0;
  private beat = 0;
  private nextTime = 0;
  private bpm = 90;
  private out: GainNode;
  /** 每一拍排進去的時候呼叫：beat 從 0 起算（0–3 是預備拍），when 是 AudioContext 時間。 */
  onBeat: ((beat: number, when: number) => void) | null = null;

  constructor(private ctx: AudioContext) {
    this.out = ctx.createGain();
    this.out.gain.value = 0.5;
    this.out.connect(ctx.destination);
  }

  get running() {
    return this.timer !== 0;
  }

  start(at: number, bpm: number) {
    this.stop();
    this.bpm = bpm;
    this.beat = 0;
    this.nextTime = at;
    this.timer = window.setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  stop() {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = 0;
  }

  private schedule() {
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      this.click(this.nextTime, this.beat % BEATS_PER_BAR === 0);
      this.onBeat?.(this.beat, this.nextTime);
      this.beat++;
      this.nextTime += 60 / this.bpm;
    }
  }

  private click(when: number, accent: boolean) {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.frequency.value = accent ? 1760 : 1175;
    env.gain.setValueAtTime(0.0001, when);
    env.gain.exponentialRampToValueAtTime(accent ? 0.9 : 0.55, when + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    osc.connect(env).connect(this.out);
    osc.start(when);
    osc.stop(when + 0.06);
  }
}
