import { ClipboardPaste } from 'lucide-react';
import { useState } from 'react';
import { parseCatReport, totalWords, weightedWords } from '../domain/cat';
import { CAT_BANDS } from '../domain/constants';
import type { CatCounts, CatGrid } from '../domain/types';
import { tx } from '../i18n';
import { num } from '../ui/format';
import { Button, NumberInput, Textarea } from '../ui/kit';

export function CatPanel({ counts, grid, onChange }: { counts: CatCounts; grid: CatGrid; onChange: (counts: CatCounts, grid: CatGrid) => void }) {
  const [paste, setPaste] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const total = totalWords(counts);
  const weighted = weightedWords(counts, grid);
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Textarea
          rows={2}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder={tx('貼上 Trados／memoQ／Phrase 分析報告的表格文字', 'Paste the analysis table from Trados, memoQ or Phrase')}
          className="flex-1 font-mono text-[12.5px]"
        />
        <Button
          size="sm"
          icon={<ClipboardPaste size={15} />}
          onClick={() => {
            const r = parseCatReport(paste);
            if (!r.matched) {
              setMsg(tx('沒有找到可辨識的比對區間', 'No match bands recognised'));
              return;
            }
            onChange(r.counts, grid);
            setMsg(tx(`已讀取 ${r.matched} 個區間`, `Read ${r.matched} bands`));
            setPaste('');
          }}
          disabled={!paste.trim()}
          className="sm:self-start"
        >
          {tx('解析', 'Read')}
        </Button>
      </div>
      {msg && <div className="mt-1.5 text-[12px] text-muted">{msg}</div>}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[360px] text-[13px] tnum">
          <thead>
            <tr className="text-left text-[12px] text-muted">
              <th className="pb-1.5 font-medium">{tx('比對區間', 'Band')}</th>
              <th className="pb-1.5 text-right font-medium">{tx('字數', 'Words')}</th>
              <th className="pb-1.5 text-right font-medium">{tx('計費 %', 'Pay %')}</th>
              <th className="pb-1.5 text-right font-medium">{tx('加權', 'Weighted')}</th>
            </tr>
          </thead>
          <tbody>
            {CAT_BANDS.map((b) => (
              <tr key={b.id} className="border-t border-line">
                <td className="py-1 pr-2 font-mono text-[12px] text-ink-2">{b.label}</td>
                <td className="py-1">
                  <NumberInput className="input-sm ml-auto w-24 text-right" value={counts[b.id]} onChange={(v) => onChange({ ...counts, [b.id]: v || 0 }, grid)} aria-label={b.label} />
                </td>
                <td className="py-1">
                  <NumberInput className="input-sm ml-auto w-16 text-right" value={grid[b.id]} onChange={(v) => onChange(counts, { ...grid, [b.id]: v ?? 0 })} aria-label={`${b.label} %`} />
                </td>
                <td className="py-1 text-right text-ink-2">{num(((counts[b.id] || 0) * (grid[b.id] ?? 100)) / 100)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line-strong font-semibold text-ink">
              <td className="pt-2">{tx('合計', 'Total')}</td>
              <td className="pt-2 text-right">{num(total)}</td>
              <td className="pt-2 text-right text-muted">{total ? `${Math.round((weighted / total) * 100)}%` : ''}</td>
              <td className="pt-2 text-right">{num(weighted, 1)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
