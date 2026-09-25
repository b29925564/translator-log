import { unzipSync, strFromU8 } from 'fflate';

// Extracts countable text from the file types translators receive most often.

export const SUPPORTED_EXTENSIONS = ['docx', 'pptx', 'xlsx', 'odt', 'txt', 'md', 'srt', 'vtt', 'csv', 'html', 'htm', 'xml', 'xliff', 'xlf', 'json', 'po'];

const decodeEntities = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');

/** Collects the inner text of `textTag` elements, one line per `paraTag`. */
const xmlParagraphs = (xml: string, paraClose: string, textTag: string): string => {
  const textRe = new RegExp(`<${textTag}(?:\\s[^>]*)?>([^<]*)</${textTag}>`, 'g');
  return xml
    .split(paraClose)
    .map((chunk) => {
      const withTabs = chunk.replace(/<w:tab\/>|<w:br\/>/g, `<${textTag}> </${textTag}>`);
      let line = '';
      for (const m of withTabs.matchAll(textRe)) line += m[1];
      return decodeEntities(line);
    })
    .filter((l) => l.trim())
    .join('\n');
};

const stripTags = (s: string) => decodeEntities(s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '));

const naturalSort = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

export const extractFromZip = (ext: string, data: Uint8Array): string => {
  const files = unzipSync(data);
  const read = (name: string) => (files[name] ? strFromU8(files[name]) : '');
  const names = Object.keys(files);

  if (ext === 'docx') {
    const parts = ['word/document.xml', ...names.filter((n) => /^word\/(header|footer|footnotes|endnotes)\d*\.xml$/.test(n)).sort(naturalSort)];
    return parts.map((p) => xmlParagraphs(read(p), '</w:p>', 'w:t')).filter(Boolean).join('\n');
  }
  if (ext === 'pptx') {
    const slides = names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort(naturalSort);
    return slides.map((p) => xmlParagraphs(read(p), '</a:p>', 'a:t')).filter(Boolean).join('\n');
  }
  if (ext === 'xlsx') {
    const shared = read('xl/sharedStrings.xml');
    const strings = shared.split('</si>').map((si) => {
      let s = '';
      for (const m of si.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)) s += m[1];
      return decodeEntities(s);
    });
    const sheets = names.filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
    const inline: string[] = [];
    for (const sh of sheets) for (const m of read(sh).matchAll(/<is>[\s\S]*?<t[^>]*>([^<]*)<\/t>[\s\S]*?<\/is>/g)) inline.push(decodeEntities(m[1]));
    return [...strings, ...inline].filter((s) => s.trim()).join('\n');
  }
  if (ext === 'odt') {
    return stripTags(read('content.xml').replace(/<\/text:p>|<\/text:h>/g, '\n'));
  }
  return '';
};

export const extractFromText = (ext: string, raw: string): string => {
  if (ext === 'srt' || ext === 'vtt') {
    return raw
      .split(/\r?\n/)
      .filter((l) => l.trim() && !/^\d+$/.test(l.trim()) && !/-->/.test(l) && !/^WEBVTT/.test(l))
      .map((l) => l.replace(/<[^>]+>/g, ''))
      .join('\n');
  }
  if (ext === 'html' || ext === 'htm') return stripTags(raw.replace(/<\/(p|div|h\d|li|tr)>/gi, '\n'));
  if (ext === 'xliff' || ext === 'xlf') {
    const src = [...raw.matchAll(/<source(?:\s[^>]*)?>([\s\S]*?)<\/source>/g)].map((m) => stripTags(m[1]));
    return src.join('\n');
  }
  if (ext === 'po') {
    return [...raw.matchAll(/^msgid\s+"(.*)"$/gm)].map((m) => m[1]).filter(Boolean).join('\n');
  }
  if (ext === 'json') {
    const out: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === 'string') out.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    try {
      walk(JSON.parse(raw));
      return out.join('\n');
    } catch {
      return raw;
    }
  }
  if (ext === 'xml') return stripTags(raw);
  return raw;
};

export const extensionOf = (name: string) => (name.split('.').pop() || '').toLowerCase();

export const extractFileText = async (file: File): Promise<string> => {
  const ext = extensionOf(file.name);
  if (['docx', 'pptx', 'xlsx', 'odt'].includes(ext)) {
    return extractFromZip(ext, new Uint8Array(await file.arrayBuffer()));
  }
  return extractFromText(ext, await file.text());
};
