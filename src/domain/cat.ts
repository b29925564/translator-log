import type { CatBand, CatCounts, CatGrid } from './types';

export const totalWords = (counts: CatCounts): number =>
  Object.values(counts).reduce<number>((s, v) => s + (v || 0), 0);

export const weightedWords = (counts: CatCounts, grid: CatGrid): number => {
  let sum = 0;
  for (const [band, n] of Object.entries(counts) as [CatBand, number][]) {
    sum += (n || 0) * ((grid[band] ?? 100) / 100);
  }
  return Math.round(sum * 100) / 100;
};

/** Band detectors, most specific first. Each returns the index where the label ends. */
const BAND_PATTERNS: [CatBand, RegExp][] = [
  ['context', /(context\s*match|perfect\s*match|in[-\s]?context\s*exact|ice\s*match|x-translated|101\s*%|\bpm\b|\bicem?\b)/i],
  ['repetition', /(cross[-\s]?file\s*repetitions?|repetitions?|重複)/i],
  ['m95', /95\s*%?\s*[-–~至]\s*99\s*%?/],
  ['m85', /85\s*%?\s*[-–~至]\s*94\s*%?/],
  ['m75', /75\s*%?\s*[-–~至]\s*84\s*%?/],
  ['m50', /50\s*%?\s*[-–~至]\s*74\s*%?/],
  ['noMatch', /(0\s*%?\s*[-–~至]\s*49\s*%?|no\s*match|new\s*words?|^\s*new\b|無符合|新字)/i],
  ['mt', /(machine\s*translation|adaptive\s*mt|\bn?mt\b|機器翻譯)/i],
  ['m100', /(^|\s)(100\s*%|exact\s*match|完全符合)/i],
];

const NUMBER_RE = /(?<![\d.])(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?!\s*%)(?![\d,.])/g;

/**
 * Parses text copied from a CAT tool analysis report (Trados Studio, memoQ,
 * Phrase…). For each band row the word count is the second number on the
 * line (Segments, Words, Characters…) or the only number if there is one.
 */
export const parseCatReport = (text: string): { counts: CatCounts; matched: number } => {
  const counts: CatCounts = {};
  let matched = 0;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/ /g, ' ').trim();
    if (!line || /^(total|合計|總計)/i.test(line)) continue;
    for (const [band, re] of BAND_PATTERNS) {
      const m = re.exec(line);
      if (!m) continue;
      const rest = line.slice(m.index + m[0].length);
      const nums = [...rest.matchAll(NUMBER_RE)].map((x) => Number(x[1].replace(/,/g, '')));
      if (nums.length === 0) break;
      const words = nums.length >= 2 ? nums[1] : nums[0];
      counts[band] = (counts[band] || 0) + words;
      matched++;
      break;
    }
  }
  return { counts, matched };
};
