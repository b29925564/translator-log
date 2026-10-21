import { describe, expect, it } from 'vitest';
import { inKey, keyName, pitchClassHistogram, rankKeys, snapToKey } from '../../src/analysis/key';

const seq = (midis: number[], dur = 0.5) => midis.map((midi) => ({ midi, dur }));

describe('調性偵測', () => {
  it('C 大調音階 → C major', () => {
    const [best] = rankKeys(seq([60, 62, 64, 65, 67, 69, 71, 72]));
    expect(best).toMatchObject({ tonic: 0, mode: 'major' });
  });

  it('強調 A／C／E 的小調旋律 → A minor', () => {
    // A–C–E 落在長拍上，其餘是經過音
    const melody = [
      { midi: 69, dur: 1 }, { midi: 71, dur: 0.25 }, { midi: 72, dur: 0.75 }, { midi: 74, dur: 0.25 },
      { midi: 76, dur: 1 }, { midi: 74, dur: 0.25 }, { midi: 72, dur: 0.75 }, { midi: 71, dur: 0.25 },
      { midi: 69, dur: 1.5 }, { midi: 64, dur: 0.5 }, { midi: 69, dur: 1 },
    ];
    const [best] = rankKeys(melody);
    expect(best).toMatchObject({ tonic: 9, mode: 'minor' });
  });

  it('小星星第一句（C C G G A A G）→ C major；前兩名包含 C major', () => {
    const ranked = rankKeys(seq([60, 60, 67, 67, 69, 69, 67]));
    expect(ranked.slice(0, 2).some((k) => k.tonic === 0 && k.mode === 'major')).toBe(true);
  });

  it('移調不影響：G 大調音階 → G major；D 小調和弦音 → D minor', () => {
    expect(rankKeys(seq([67, 69, 71, 72, 74, 76, 78, 79]))[0]).toMatchObject({ tonic: 7, mode: 'major' });
    expect(rankKeys([{ midi: 62, dur: 2 }, { midi: 65, dur: 1 }, { midi: 69, dur: 1.5 }, { midi: 64, dur: 0.3 }, { midi: 67, dur: 0.3 }, { midi: 70, dur: 0.5 }, { midi: 62, dur: 1 }])[0]).toMatchObject({ tonic: 2, mode: 'minor' });
  });

  it('直方圖用時值加權；沒有音符 → 沒有候選', () => {
    expect(pitchClassHistogram([{ midi: 60, dur: 1 }, { midi: 72, dur: 0.5 }, { midi: 61, dur: 0.25 }]).slice(0, 2)).toEqual([1.5, 0.25]);
    expect(rankKeys([])).toEqual([]);
    expect(rankKeys(seq([60, 64, 67])).length).toBe(24);
  });

  it('調名', () => {
    expect(keyName({ tonic: 0, mode: 'major' })).toBe('C 大調');
    expect(keyName({ tonic: 9, mode: 'minor' })).toBe('A 小調');
  });
});

describe('吸附到音階', () => {
  const C = { tonic: 0, mode: 'major' as const };
  const Am = { tonic: 9, mode: 'minor' as const };

  it('調內音不動', () => {
    for (const m of [60, 62, 64, 65, 67, 69, 71]) expect(snapToKey(m, C)).toBe(m);
  });

  it('調外音移到最近的調內音；距離相同時往原始音高偏移的方向', () => {
    // C♯ 在 C 與 D 中間：原本唱得偏高（61.3）→ D；偏低（60.8）→ C
    expect(snapToKey(61, C, 61.3)).toBe(62);
    expect(snapToKey(61, C, 60.8)).toBe(60);
    // F♯ 在 F 與 G 中間
    expect(snapToKey(66, C, 66.2)).toBe(67);
    expect(snapToKey(66, C, 65.6)).toBe(65);
    // 沒有原始音高（手動新增）→ 往下
    expect(snapToKey(61, C)).toBe(60);
  });

  it('自然小調：G♯ 在 A 小調是調外音', () => {
    expect(inKey(68, Am)).toBe(false);
    expect(snapToKey(68, Am, 68.4)).toBe(69);
    expect(snapToKey(68, Am, 67.9)).toBe(67);
  });
});
