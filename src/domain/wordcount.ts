// Word counting that understands mixed CJK / Latin text the way translators
// and clients actually count it.

export interface WordCount {
  /** Han, Kana and Hangul characters, each counted as one. */
  cjkChars: number;
  /** Full-width punctuation (，。「」…). */
  cjkPunct: number;
  /** Space-delimited words in Latin, Cyrillic, Greek… scripts, including numbers. */
  words: number;
  /** MS Word style total: CJK characters + full-width punctuation + words. */
  msWord: number;
  charsWithSpaces: number;
  charsNoSpaces: number;
  paragraphs: number;
  sentences: number;
  /** Most of the text is CJK, so it is normally billed per character. */
  cjkDominant: boolean;
}

const CJK_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}々ー]/u;
const CJK_PUNCT_RE = /[　-〿！-／：-＠［-｀｛-･‘’“”…—·]/u;
const WORD_CHAR_RE = /[\p{L}\p{N}\p{M}]/u;

export const countText = (text: string): WordCount => {
  let cjkChars = 0;
  let cjkPunct = 0;
  let words = 0;
  let inWord = false;
  let charsWithSpaces = 0;
  let charsNoSpaces = 0;

  const chars = Array.from(text);
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (ch === '\r') continue;
    if (ch !== '\n') charsWithSpaces++;
    const isSpace = /\s/u.test(ch);
    if (!isSpace) charsNoSpaces++;

    const next = chars[i + 1] ?? '';
    if (inWord && "'’-.,".includes(ch) && WORD_CHAR_RE.test(next) && !CJK_RE.test(next)) {
      // keep contractions, hyphenated words and 1,250.50 together
    } else if (CJK_RE.test(ch)) {
      cjkChars++;
      inWord = false;
    } else if (CJK_PUNCT_RE.test(ch)) {
      cjkPunct++;
      inWord = false;
    } else if (WORD_CHAR_RE.test(ch)) {
      if (!inWord) {
        words++;
        inWord = true;
      }
    } else {
      inWord = false;
    }
  }

  const trimmed = text.trim();
  const paragraphs = trimmed ? trimmed.split(/\n\s*\n|\r?\n/).filter((p) => p.trim()).length : 0;
  const sentences = trimmed ? (trimmed.match(/[.!?。！？]+(\s|$)|[。！？]/g) || []).length || 1 : 0;

  return {
    cjkChars,
    cjkPunct,
    words,
    msWord: cjkChars + cjkPunct + words,
    charsWithSpaces,
    charsNoSpaces,
    paragraphs,
    sentences,
    cjkDominant: cjkChars > words,
  };
};

/** The single number a translator would quote on. */
export const billableCount = (c: WordCount, unit: 'word' | 'char', includePunct = false): number => {
  if (unit === 'char') return c.cjkChars + (includePunct ? c.cjkPunct : 0) + (c.cjkDominant ? c.words : 0);
  return c.words + (c.cjkDominant ? 0 : c.cjkChars);
};
