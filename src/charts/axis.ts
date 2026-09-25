// Picks which x-axis labels a chart can draw without them touching. The
// first label is drawn left-aligned, the last right-aligned and the rest
// centred, matching how the charts anchor their text.

const GAP = 8;

// rough width of 11px text: CJK glyphs are about a full em, the rest ~0.6em
export const labelWidth = (s: string, fontSize = 11) => {
  let w = 0;
  for (const ch of s) w += /[⺀-鿿가-힯＀-￯]/.test(ch) ? fontSize : fontSize * 0.6;
  return w;
};

export const pickAxisLabels = (labels: string[], xs: number[], fontSize = 11): Set<number> => {
  const n = labels.length;
  const shown = new Set<number>();
  if (n === 0) return shown;
  const span = (i: number): [number, number] => {
    const w = labelWidth(labels[i], fontSize);
    if (i === 0) return [xs[i], xs[i] + w];
    if (i === n - 1) return [xs[i] - w, xs[i]];
    return [xs[i] - w / 2, xs[i] + w / 2];
  };
  const last = span(n - 1);
  // step evenly so the kept labels land on a regular rhythm; the step leaves
  // room for an edge-aligned label beside a centred one (1.5 label widths)
  const widest = Math.max(...labels.map((l) => labelWidth(l, fontSize)));
  const pitch = n > 1 ? Math.abs(xs[n - 1] - xs[0]) / (n - 1) : Infinity;
  const every = Math.max(1, Math.ceil((widest * 1.5 + GAP) / pitch));
  let right = -Infinity;
  for (let i = 0; i < n - 1; i += every) {
    const [a, b] = span(i);
    if (a < right + GAP || b > last[0] - GAP) continue;
    shown.add(i);
    right = b;
  }
  shown.add(n - 1);
  return shown;
};
