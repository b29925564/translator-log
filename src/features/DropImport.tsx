// Drop a file anywhere in the app to import it as a report.

import { FileUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { tx } from '../i18n';
import { useUI } from '../ui/store';

const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
// pages with their own file drop zone keep it
const OWN_DROP = ['/tools'];

export function DropImport() {
  const [over, setOver] = useState(false);

  useEffect(() => {
    let depth = 0;
    const skip = () => OWN_DROP.includes(useUI.getState().route);
    const enter = (e: DragEvent) => {
      if (!hasFiles(e) || skip()) return;
      depth++;
      setOver(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e) || skip()) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setOver(false);
    };
    const dragover = (e: DragEvent) => {
      if (hasFiles(e) && !skip()) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      depth = 0;
      setOver(false);
      if (!hasFiles(e) || skip() || e.defaultPrevented) return;
      e.preventDefault();
      const f = e.dataTransfer?.files?.[0];
      if (f) useUI.getState().openReportImport(f);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', dragover);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', dragover);
      window.removeEventListener('drop', drop);
    };
  }, []);

  if (!over || useUI.getState().reportImport.open) return null;
  return (
    <div className="pointer-events-none fixed inset-3 z-[60] flex items-center justify-center rounded-[10px] border-2 border-dashed border-accent" style={{ background: 'var(--backdrop)' }}>
      <div className="flex flex-col items-center gap-2 rounded-[6px] bg-surface px-8 py-6 text-center" style={{ boxShadow: 'var(--shadow-lg)' }}>
        <FileUp size={28} className="text-accent" />
        <div className="text-[16px] font-semibold text-ink">{tx('放開以匯入報表', 'Drop to import the report')}</div>
        <div className="text-[12.5px] text-muted">Excel · CSV · PDF · {tx('圖片', 'images')} · Word</div>
      </div>
    </div>
  );
}
