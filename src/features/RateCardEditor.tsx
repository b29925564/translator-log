import { Plus, Trash2 } from 'lucide-react';
import { SERVICES, UNITS } from '../domain/constants';
import { nextRateRow } from '../domain/rates';
import type { Client, ClientRate, ServiceType, Unit } from '../domain/types';
import { getLang, tx } from '../i18n';
import { Button, Input, NumberInput, Select } from '../ui/kit';
import { LangSelect } from './common';

/** The client's rates by service and language pair, edited as a list of small cards. */
export function RateCardEditor({ client, onChange, fallback }: { client: Client; onChange: (rates: ClientRate[]) => void; fallback: { sourceLang: string; targetLang: string } }) {
  const en = getLang() === 'en';
  const rows = client.rates ?? [];
  const update = (id: string, p: Partial<ClientRate>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const add = () => onChange([...rows, nextRateRow(client, fallback, crypto.randomUUID?.() ?? String(Date.now()))]);
  const any = tx('不限', 'Any');

  return (
    <div className="flex flex-col gap-2" data-testid="rate-card">
      {rows.map((r, i) => (
        <div key={r.id} className="rounded-xl border border-line bg-surface-2 p-3" data-testid="rate-row">
          <div className="flex items-center gap-2">
            <Select aria-label={tx('服務類型', 'Service')} value={r.service} onChange={(e) => update(r.id, { service: e.target.value as ServiceType })} className="min-w-0 flex-1">
              {SERVICES.map((s) => (
                <option key={s.id} value={s.id}>
                  {en ? s.en : s.zh}
                </option>
              ))}
            </Select>
            <Button iconOnly variant="ghost" icon={<Trash2 size={16} />} aria-label={tx(`刪除第 ${i + 1} 筆費率`, `Remove rate ${i + 1}`)} onClick={() => onChange(rows.filter((x) => x.id !== r.id))} />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <LangSelect compact aria-label={tx('原文', 'Source language')} anyLabel={any} value={r.sourceLang ?? ''} onChange={(v) => update(r.id, { sourceLang: v || undefined })} />
            </div>
            <span className="text-muted" aria-hidden>
              →
            </span>
            <div className="min-w-0 flex-1">
              <LangSelect compact aria-label={tx('譯文', 'Target language')} anyLabel={any} value={r.targetLang ?? ''} onChange={(v) => update(r.id, { targetLang: v || undefined })} />
            </div>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Select aria-label={tx('計價單位', 'Unit')} value={r.unit} onChange={(e) => update(r.id, { unit: e.target.value as Unit })}>
              {UNITS.map((u) => (
                <option key={u.id} value={u.id}>
                  {en ? u.en : u.zh}
                </option>
              ))}
            </Select>
            <NumberInput aria-label={r.unit === 'flat' ? tx('案費', 'Fee') : tx('單價', 'Rate')} value={r.rate || undefined} onChange={(v) => update(r.id, { rate: v ?? 0 })} placeholder={r.unit === 'flat' ? tx('案費', 'Fee') : tx('單價', 'Rate')} />
            <NumberInput aria-label={tx('最低收費', 'Minimum fee')} value={r.minimumFee} onChange={(v) => update(r.id, { minimumFee: v })} placeholder={tx('最低收費', 'Min. fee')} />
          </div>
          <Input className="mt-2" aria-label={tx('備註', 'Note')} value={r.note ?? ''} onChange={(e) => update(r.id, { note: e.target.value || undefined })} placeholder={tx('備註（選填），例如「急件另加 30%」', 'Note (optional), e.g. “rush +30%”')} />
        </div>
      ))}
      <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={add} className="self-start">
        {rows.length ? tx('再加一筆費率', 'Add another rate') : tx('新增費率', 'Add a rate')}
      </Button>
    </div>
  );
}

/** Drops rows without a rate before saving. */
export const cleanRates = (rates: ClientRate[] | undefined) => {
  const kept = (rates ?? []).filter((r) => r.rate > 0);
  return kept.length ? kept : undefined;
};
