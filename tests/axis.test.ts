import { describe, expect, it } from 'vitest';
import { labelWidth, pickAxisLabels } from '../src/charts/axis';

const quarters = (n: number) => Array.from({ length: n }, (_, i) => `${2020 + Math.floor(i / 4)} Q${(i % 4) + 1}`);
const spread = (n: number, from: number, to: number) => Array.from({ length: n }, (_, i) => (n <= 1 ? (from + to) / 2 : from + (i / (n - 1)) * (to - from)));

// the drawn extent of each shown label, in the order they appear
const extents = (labels: string[], xs: number[], shown: Set<number>) =>
  [...shown]
    .sort((a, b) => a - b)
    .map((i) => {
      const w = labelWidth(labels[i]);
      const n = labels.length;
      return i === 0 ? [xs[i], xs[i] + w] : i === n - 1 ? [xs[i] - w, xs[i]] : [xs[i] - w / 2, xs[i] + w / 2];
    });

describe('pickAxisLabels', () => {
  it('keeps every label when there is room', () => {
    const labels = quarters(4);
    expect([...pickAxisLabels(labels, spread(4, 40, 800))].sort()).toEqual([0, 1, 2, 3]);
  });

  it('never lets labels overlap, and always keeps the first and last', () => {
    for (const n of [2, 3, 5, 9, 12, 17, 21, 30]) {
      for (const width of [220, 300, 420, 700, 1100]) {
        const labels = quarters(n);
        const xs = spread(n, 40, width);
        const shown = pickAxisLabels(labels, xs);
        expect(shown.has(n - 1)).toBe(true);
        const ext = extents(labels, xs, shown);
        for (let i = 1; i < ext.length; i++) expect(ext[i][0]).toBeGreaterThanOrEqual(ext[i - 1][1]);
        if (n > 1 && xs[n - 1] - xs[0] > 2 * labelWidth(labels[0]) + 8) expect(shown.has(0)).toBe(true);
      }
    }
  });

  it('spaces the kept labels evenly', () => {
    const labels = quarters(19);
    const shown = [...pickAxisLabels(labels, spread(19, 40, 315))].sort((a, b) => a - b);
    const steps = new Set(shown.slice(0, -1).map((v, i) => shown[i + 1] - v));
    expect(steps.size).toBe(1);
  });

  it('drops the label right before the last one when they would touch', () => {
    // the case seen on 洞察: "2026 Q2" ran into the right-aligned "2026 Q3"
    const labels = quarters(27);
    const xs = spread(27, 40, 1000);
    const shown = pickAxisLabels(labels, xs);
    expect(shown.has(26)).toBe(true);
    expect(shown.has(25)).toBe(false);
  });
});
