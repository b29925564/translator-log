// The positioned text of a PDF, read on the device with pdf.js. Loaded only
// when someone imports a PDF; the service worker caches it on first use.

import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PdfItem } from './pdfTable';

GlobalWorkerOptions.workerSrc = workerUrl;

/** Every text run with its page, position and font size. Scanned pages yield nothing. */
export const readPdfItems = async (data: ArrayBuffer): Promise<PdfItem[]> => {
  const task = getDocument({
    data: new Uint8Array(data),
    // character maps for CJK fonts that are not embedded, copied next to the app at build time
    cMapUrl: `${import.meta.env.BASE_URL}pdfjs/cmaps/`,
    cMapPacked: true,
    disableFontFace: true,
  });
  const doc = await task.promise;
  const out: PdfItem[] = [];
  try {
    for (let p = 1; p <= Math.min(doc.numPages, 200); p++) {
      const page = await doc.getPage(p);
      const text = await page.getTextContent();
      for (const it of text.items) {
        if (!('str' in it) || !it.str.trim()) continue;
        const [a, b, , , x, y] = it.transform as number[];
        out.push({ str: it.str, x, y, width: it.width, height: it.height || Math.hypot(a, b), page: p });
      }
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return out;
};

/** Each page drawn onto a canvas, for text recognition of scanned statements. */
export async function* renderPages(data: ArrayBuffer, maxPages = 30): AsyncGenerator<{ canvas: HTMLCanvasElement; page: number; pages: number }> {
  const task = getDocument({ data: new Uint8Array(data), cMapUrl: `${import.meta.env.BASE_URL}pdfjs/cmaps/`, cMapPacked: true });
  const doc = await task.promise;
  try {
    const pages = Math.min(doc.numPages, maxPages);
    for (let p = 1; p <= pages; p++) {
      const page = await doc.getPage(p);
      // about 200 dpi, enough for small print in a statement
      const viewport = page.getViewport({ scale: 2.8 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      page.cleanup();
      yield { canvas, page: p, pages };
    }
  } finally {
    await task.destroy();
  }
}
