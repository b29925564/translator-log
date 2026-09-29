// Text recognition on the device for scanned statements and photos, with
// tesseract.js (Traditional Chinese + English). Loaded only when needed; the
// language data (about 20 MB) downloads once and tesseract keeps it in
// IndexedDB, so later imports work offline.

import { createWorker } from 'tesseract.js';
import workerPath from 'tesseract.js/dist/worker.min.js?url';
import { ocrWordsToItems, type OcrWord, type PdfItem } from './pdfTable';

type Progress = (page: number, pages: number, pct: number) => void;

/** Positioned words of an image or of every page of a scanned PDF. */
export const recognise = async (file: File, pdf: boolean, progress: Progress): Promise<PdfItem[]> => {
  let page = 0;
  let pages = 1;
  progress(0, pages, 0);
  const worker = await createWorker(['chi_tra', 'eng'], 1, {
    workerPath,
    // the recognition engine is copied next to the app at build time
    corePath: `${import.meta.env.BASE_URL}tesseract/`,
    logger: (m) => {
      if (m.status === 'recognizing text' && page) progress(page, pages, m.progress);
      else if (!page && /load/i.test(m.status)) progress(0, pages, m.progress);
    },
  }).catch(() => {
    throw new Error(navigator.onLine ? 'ocr-failed' : 'ocr-offline');
  });
  try {
    const out: PdfItem[] = [];
    const read = async (img: HTMLCanvasElement | File) => {
      const { data } = await worker.recognize(img, {}, { blocks: true });
      const words: OcrWord[] = [];
      for (const b of data.blocks ?? []) for (const para of b.paragraphs) for (const line of para.lines) for (const w of line.words) words.push({ text: w.text, confidence: w.confidence, bbox: w.bbox });
      out.push(...ocrWordsToItems(words, page));
    };
    if (pdf) {
      const { renderPages } = await import('./pdfText');
      for await (const r of renderPages(await file.arrayBuffer())) {
        page = r.page;
        pages = r.pages;
        progress(page, pages, 0);
        await read(r.canvas);
      }
    } else {
      page = 1;
      progress(1, 1, 0);
      await read(file);
    }
    return out;
  } finally {
    await worker.terminate();
  }
};
