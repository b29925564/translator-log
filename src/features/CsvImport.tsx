import { FileUp } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useData } from '../db/data';
import { applyRecords, newClient, newJob } from '../db/repo';
import { guessMapping, parseCSV, parseDate, parseNumber, parsePair, parseStatus, parseUnit, type ImportField } from '../domain/csv';
import { BUILTIN_DOMAINS } from '../domain/constants';
import { fxRate } from '../domain/money';
import type { Client, Job } from '../domain/types';
import { tx } from '../i18n';
import { Button, Select, Sheet } from '../ui/kit';
import { useUI } from '../ui/store';
import { changeBus } from '../db/repo';

const FIELDS = (): { id: ImportField; label: string }[] => [
  { id: 'ignore', label: tx('（略過）', '(skip)') },
  { id: 'title', label: tx('案件名稱', 'Title') },
  { id: 'client', label: tx('客戶', 'Client') },
  { id: 'date', label: tx('日期（交稿）', 'Date (delivered)') },
  { id: 'receivedAt', label: tx('接案日', 'Received') },
  { id: 'dueAt', label: tx('截止日', 'Due') },
  { id: 'deliveredAt', label: tx('交稿日', 'Delivered') },
  { id: 'paidAt', label: tx('收款日', 'Paid') },
  { id: 'pair', label: tx('語言組合', 'Language pair') },
  { id: 'sourceLang', label: tx('原文語言', 'Source language') },
  { id: 'targetLang', label: tx('譯文語言', 'Target language') },
  { id: 'quantity', label: tx('字數／數量', 'Words / quantity') },
  { id: 'unit', label: tx('計價單位', 'Unit') },
  { id: 'rate', label: tx('單價', 'Rate') },
  { id: 'currency', label: tx('幣別', 'Currency') },
  { id: 'amount', label: tx('金額', 'Amount') },
  { id: 'status', label: tx('狀態', 'Status') },
  { id: 'domain', label: tx('領域', 'Field') },
  { id: 'service', label: tx('服務類型', 'Service') },
  { id: 'catTool', label: tx('CAT 工具', 'CAT tool') },
  { id: 'notes', label: tx('備註', 'Notes') },
];

export function CsvImport({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { clients, settings, today } = useData();
  const toast = useUI((s) => s.toast);
  const [rows, setRows] = useState<string[][]>([]);
  const [map, setMap] = useState<ImportField[]>([]);
  const [name, setName] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  const load = async (f: File) => {
    const text = await f.text();
    const r = parseCSV(text);
    setRows(r);
    setMap(guessMapping(r[0] ?? []));
    setName(f.name);
  };

  const built = useMemo(() => {
    if (rows.length < 2) return { jobs: [] as Job[], newClients: [] as Client[] };
    const byName = new Map(clients.map((c) => [c.name.trim().toLowerCase(), c]));
    const created = new Map<string, Client>();
    const jobs: Job[] = [];
    for (const r of rows.slice(1)) {
      const get = (f: ImportField) => {
        const i = map.indexOf(f);
        return i >= 0 ? r[i]?.trim() : undefined;
      };
      const title = get('title') || get('notes') || tx('匯入的案件', 'Imported job');
      const cname = get('client');
      let clientId: string | undefined;
      if (cname) {
        const key = cname.toLowerCase();
        const c = byName.get(key) ?? created.get(key) ?? newClient({ name: cname, currency: (get('currency') || settings.baseCurrency).toUpperCase() });
        if (!byName.has(key)) created.set(key, c);
        clientId = c.id;
      }
      const pair = parsePair(get('pair'), today, settings.defaultTargetLang);
      const quantity = parseNumber(get('quantity')) ?? 0;
      const amount = parseNumber(get('amount'));
      let rate = parseNumber(get('rate'));
      let unit = parseUnit(get('unit')) ?? (quantity ? 'word' : 'flat');
      if (!rate && amount != null && quantity) rate = Math.round((amount / quantity) * 10000) / 10000;
      if (!quantity && amount != null) unit = 'flat';
      const currency = (get('currency') || settings.baseCurrency).toUpperCase().replace('NTD', 'TWD');
      const delivered = parseDate(get('deliveredAt')) ?? parseDate(get('date'));
      const paid = parseDate(get('paidAt'));
      const status = parseStatus(get('status'), paid);
      const dom = get('domain');
      const domain = dom ? BUILTIN_DOMAINS.find((d) => d.zh === dom || d.en.toLowerCase() === dom.toLowerCase() || d.id === dom)?.id ?? dom : undefined;
      jobs.push(
        newJob({
          title,
          clientId,
          sourceLang: pair.sourceLang ?? get('sourceLang') ?? settings.defaultSourceLang,
          targetLang: pair.targetLang ?? get('targetLang') ?? settings.defaultTargetLang,
          unit,
          quantity: unit === 'flat' ? 1 : quantity,
          words: unit === 'flat' && quantity ? quantity : undefined,
          rate: unit === 'flat' ? amount ?? rate ?? 0 : rate ?? 0,
          amountOverride: unit !== 'flat' && amount != null && rate == null ? amount : undefined,
          currency,
          fxToBase: fxRate(currency, settings.baseCurrency, settings.fx.rates),
          status,
          receivedAt: parseDate(get('receivedAt')) ?? delivered,
          dueAt: parseDate(get('dueAt')),
          deliveredAt: status === 'active' || status === 'quote' ? undefined : delivered,
          invoicedAt: status === 'invoiced' || status === 'paid' ? delivered : undefined,
          paidAt: status === 'paid' ? paid ?? delivered : undefined,
          domain,
          catTool: get('catTool'),
          notes: get('notes') && get('notes') !== title ? get('notes') : undefined,
          progress: status === 'active' ? 0 : 100,
        }),
      );
    }
    return { jobs, newClients: [...created.values()] };
  }, [rows, map, clients, settings, today]);

  const run = async () => {
    await applyRecords({ jobs: built.jobs, clients: built.newClients });
    changeBus.dispatchEvent(new Event('change'));
    toast(tx(`已匯入 ${built.jobs.length} 個案件、${built.newClients.length} 位新客戶`, `Imported ${built.jobs.length} jobs and ${built.newClients.length} new clients`));
    setRows([]);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="xl"
      title={tx('從試算表匯入', 'Import from a spreadsheet')}
      subtitle={tx('把 Excel／Google 試算表存成 CSV 後上傳，系統會自動對應欄位。', 'Save your Excel or Google Sheet as CSV; columns are matched automatically.')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tx('取消', 'Cancel')}
          </Button>
          <Button variant="primary" disabled={!built.jobs.length} onClick={() => void run()}>
            {tx(`匯入 ${built.jobs.length} 筆`, `Import ${built.jobs.length}`)}
          </Button>
        </>
      }
    >
      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-line-strong px-4 py-12 text-center">
          <FileUp size={26} className="text-accent" />
          <p className="max-w-md text-[14px] text-ink-2">{tx('支援欄位：日期、客戶、案件名稱、語言組合、字數、單價、金額、幣別、狀態、收款日、領域、備註。欄位名稱中英文皆可。', 'Recognised columns include date, client, title, language pair, words, rate, amount, currency, status, paid date, field and notes — in English or Chinese.')}</p>
          <Button variant="primary" onClick={() => ref.current?.click()}>
            {tx('選擇 CSV 檔', 'Choose a CSV file')}
          </Button>
          <input ref={ref} type="file" accept=".csv,.tsv,.txt,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && void load(e.target.files[0])} />
        </div>
      ) : (
        <div>
          <p className="mb-3 text-[13px] text-muted">
            {name} · {tx(`${rows.length - 1} 列資料`, `${rows.length - 1} rows`)} · {tx(`將新增 ${built.newClients.length} 位客戶`, `${built.newClients.length} new clients`)}
          </p>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-[12.5px]">
              <thead className="bg-surface-2">
                <tr>
                  {rows[0].map((h, i) => (
                    <th key={i} className="min-w-[140px] border-b border-line p-2 text-left align-top font-medium">
                      <div className="mb-1 truncate text-ink">{h || `#${i + 1}`}</div>
                      <Select
                        className="input-sm"
                        value={map[i] ?? 'ignore'}
                        onChange={(e) => {
                          const m = [...map];
                          m[i] = e.target.value as ImportField;
                          setMap(m);
                        }}
                        aria-label={tx(`「${h}」對應到`, `Map “${h}” to`)}
                      >
                        {FIELDS().map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.label}
                          </option>
                        ))}
                      </Select>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(1, 7).map((r, ri) => (
                  <tr key={ri} className="border-b border-line last:border-0">
                    {rows[0].map((_, i) => (
                      <td key={i} className="max-w-[200px] truncate p-2 text-ink-2">
                        {r[i]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button size="sm" variant="ghost" className="mt-3" onClick={() => setRows([])}>
            {tx('換一個檔案', 'Choose another file')}
          </Button>
        </div>
      )}
    </Sheet>
  );
}
