import { tx } from '../i18n';
import { useUI } from '../ui/store';

/** Saves a file, preferring the share sheet on phones where downloads are awkward. */
export const downloadFile = async (name: string, content: string | Blob, type = 'text/plain') => {
  const blob = typeof content === 'string' ? new Blob([content], { type: `${type};charset=utf-8` }) : content;
  if (__DEMO_BUILD__) {
    useUI.getState().toast(tx('示範版無法下載檔案，請使用完整版 App。', 'Downloads are off in the preview. Use the full app.'));
    return;
  }
  try {
    const file = new File([blob], name, { type: blob.type });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (/iPhone|iPad|Android/i.test(navigator.userAgent) && nav.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return;
    }
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};

export const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    useUI.getState().toast(tx('已複製', 'Copied'));
    return true;
  } catch {
    useUI.getState().toast(tx('無法自動複製，請手動選取文字', 'Couldn’t copy automatically — select the text instead'));
    return false;
  }
};

export const printPage = () => {
  if (__DEMO_BUILD__) {
    useUI.getState().toast(tx('示範版無法列印，請使用完整版 App。', 'Printing is off in the preview. Use the full app.'));
    return;
  }
  window.print();
};
