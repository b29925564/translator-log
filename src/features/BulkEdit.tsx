// Edit several jobs at once. Vendor reports often leave out what a whole
// batch shares (field, CAT tool, language pair…), so every field a job form
// has can be set here. Each one starts as “no change”; sections fold so the
// sheet stays short on a phone.

import { ChevronRight } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useData } from '../db/data';
import { splitTags, type BulkEdit } from '../db/repo';
import { CAT_TOOLS, CURRENCIES, PIPELINE, SERVICES, UNITS } from '../domain/constants';
import type { Job, JobStatus } from '../domain/types';
import { getLang, tx } from '../i18n';
import { Button, Field, Input, NumberInput, Select, Sheet, statusLabel, Textarea } from '../ui/kit';
import { DomainSelect, LangSelect } from './common';

const KEEP = '__keep';

type Mode = 'keep' | 'set' | 'clear';
type Text = { mode: 'keep' | 'append' | 'replace'; text: string };

interface Draft {
  status: string;
  client: string;
  project: string;
  currency: string;
  paid: boolean;
  paidAt: string;
  service: string;
  sourceLang: string;
  targetLang: string;
  unit: string;
  rate: { mode: Mode; value?: number };
  domain: { mode: Mode; value?: string };
  catTool: { mode: Mode; value: string };
  receivedAt: { mode: Mode; value: string };
  dueAt: { mode: Mode; value: string };
  deliveredAt: { mode: Mode; value: string };
  tags: Text;
  notes: Text;
}

const fresh = (today: string): Draft => ({
  status: KEEP,
  client: KEEP,
  project: KEEP,
  currency: KEEP,
  paid: false,
  paidAt: today,
  service: KEEP,
  sourceLang: KEEP,
  targetLang: KEEP,
  unit: KEEP,
  rate: { mode: 'keep' },
  domain: { mode: 'keep' },
  catTool: { mode: 'keep', value: '' },
  receivedAt: { mode: 'keep', value: today },
  dueAt: { mode: 'keep', value: today },
  deliveredAt: { mode: 'keep', value: today },
  tags: { mode: 'keep', text: '' },
  notes: { mode: 'keep', text: '' },
});

/** The edit a draft describes; only fields moved off “no change” are in it. */
export const draftToEdit = (d: Draft): BulkEdit => {
  const e: BulkEdit = {};
  if (d.status !== KEEP && !d.paid) e.status = d.status as JobStatus;
  if (d.client !== KEEP) e.clientId = d.client || null;
  if (d.project !== KEEP) e.projectId = d.project || null;
  if (d.currency !== KEEP) e.currency = d.currency;
  if (d.paid) e.paidAt = d.paidAt;
  if (d.service !== KEEP) e.service = d.service as Job['service'];
  if (d.sourceLang !== KEEP) e.sourceLang = d.sourceLang;
  if (d.targetLang !== KEEP) e.targetLang = d.targetLang;
  if (d.unit !== KEEP) e.unit = d.unit as Job['unit'];
  if (d.rate.mode === 'set' && d.rate.value != null) e.rate = d.rate.value;
  if (d.domain.mode !== 'keep') e.domain = d.domain.mode === 'set' && d.domain.value ? d.domain.value : null;
  if (d.catTool.mode !== 'keep') e.catTool = d.catTool.mode === 'set' && d.catTool.value.trim() ? d.catTool.value.trim() : null;
  for (const k of ['receivedAt', 'dueAt', 'deliveredAt'] as const) if (d[k].mode !== 'keep') e[k] = d[k].mode === 'set' && d[k].value ? d[k].value : null;
  if (d.tags.mode !== 'keep') e.tags = { mode: d.tags.mode, values: splitTags(d.tags.text) };
  if (d.notes.mode !== 'keep') e.notes = { mode: d.notes.mode, text: d.notes.text };
  return e;
};

function Section({ title, count, children, open }: { title: string; count: number; children: ReactNode; open?: boolean }) {
  return (
    <details className="group border-b border-line last:border-0" open={open}>
      <summary className="flex cursor-pointer list-none items-center gap-2 py-3 text-[14px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
        <ChevronRight size={16} className="shrink-0 text-muted transition-transform group-open:rotate-90" />
        <span className="flex-1">{title}</span>
        {count > 0 && <span className="rounded-[3px] bg-accent-soft px-1.5 py-px text-[11.5px] font-medium text-accent tnum">{tx(`改 ${count} 項`, `${count} set`)}</span>}
      </summary>
      <div className="flex flex-col gap-3 pb-4">{children}</div>
    </details>
  );
}

/** “No change / set to / clear”, with the control shown once a value is being set. */
function OptField({ label, id, mode, onMode, clearable = true, children }: { label: string; id: string; mode: Mode; onMode: (m: Mode) => void; clearable?: boolean; children: ReactNode }) {
  return (
    <Field label={label} htmlFor={id}>
      <div className="flex flex-col gap-2">
        <Select id={id} value={mode} onChange={(e) => onMode(e.target.value as Mode)}>
          <option value="keep">{tx('（不變）', '(no change)')}</option>
          <option value="set">{tx('設為…', 'Set to…')}</option>
          {clearable && <option value="clear">{tx('清除', 'Clear')}</option>}
        </Select>
        {mode === 'set' && children}
      </div>
    </Field>
  );
}

function TextField({ label, id, value, onChange, multiline, hint }: { label: string; id: string; value: Text; onChange: (v: Text) => void; multiline?: boolean; hint?: string }) {
  return (
    <Field label={label} htmlFor={id} hint={value.mode !== 'keep' ? hint : undefined}>
      <div className="flex flex-col gap-2">
        <Select id={id} value={value.mode} onChange={(e) => onChange({ ...value, mode: e.target.value as Text['mode'] })}>
          <option value="keep">{tx('（不變）', '(no change)')}</option>
          <option value="append">{tx('附加到原有的', 'Add to what is there')}</option>
          <option value="replace">{tx('取代原有的', 'Replace what is there')}</option>
        </Select>
        {value.mode !== 'keep' &&
          (multiline ? (
            <Textarea rows={3} value={value.text} onChange={(e) => onChange({ ...value, text: e.target.value })} aria-label={label} />
          ) : (
            <Input value={value.text} onChange={(e) => onChange({ ...value, text: e.target.value })} aria-label={label} />
          ))}
      </div>
    </Field>
  );
}

export function BulkEditSheet({ open, count, jobs, onClose, onApply }: { open: boolean; count: number; jobs: Job[]; onClose: () => void; onApply: (e: BulkEdit) => void }) {
  const { clients, projects, settings, today } = useData();
  const [d, setD] = useState<Draft>(() => fresh(today));
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  useEffect(() => {
    if (open) setD(fresh(today));
  }, [open, today]);
  const en = getLang() === 'en';
  const shared = <K extends keyof Job>(k: K) => (jobs.length && jobs.every((j) => j[k] === jobs[0][k]) ? jobs[0][k] : undefined);
  const edit = draftToEdit(d);
  const has = (...ks: (keyof BulkEdit)[]) => ks.filter((k) => edit[k] !== undefined).length;
  const changes = Object.keys(edit).length;
  const keepOpt = <option value={KEEP}>{tx('（不變）', '(no change)')}</option>;
  const date = (k: 'receivedAt' | 'dueAt' | 'deliveredAt', label: string) => (
    <OptField label={label} id={`bulk-${k}`} mode={d[k].mode} onMode={(mode) => set({ [k]: { ...d[k], mode } })}>
      <Input type="date" value={d[k].value} onChange={(e) => set({ [k]: { mode: 'set', value: e.target.value } })} aria-label={label} />
    </OptField>
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="md"
      title={tx(`編輯 ${count} 個案件`, `Edit ${count} job${count > 1 ? 's' : ''}`)}
      subtitle={tx('只會改動你有設定的欄位。', 'Only the fields you set are changed.')}
      footer={
        <>
          <span className="mr-auto text-[12.5px] text-muted tnum">{changes ? tx(`${changes} 個欄位`, `${changes} field${changes > 1 ? 's' : ''}`) : ''}</span>
          <Button variant="ghost" onClick={onClose}>
            {tx('取消', 'Cancel')}
          </Button>
          <Button variant="primary" disabled={!changes} onClick={() => onApply(edit)}>
            {tx('套用', 'Apply')}
          </Button>
        </>
      }
    >
      <div className="-mt-2 flex flex-col">
        <Section title={tx('內容', 'Work')} count={has('service', 'sourceLang', 'targetLang', 'domain', 'catTool')} open>
          <Field label={tx('領域', 'Field')} htmlFor="bulk-domain">
            <div className="flex flex-col gap-2">
              <Select id="bulk-domain" value={d.domain.mode} onChange={(e) => set({ domain: { ...d.domain, mode: e.target.value as Mode } })}>
                <option value="keep">{tx('（不變）', '(no change)')}</option>
                <option value="set">{tx('設為…', 'Set to…')}</option>
                <option value="clear">{tx('清除（未分類）', 'Clear (uncategorised)')}</option>
              </Select>
              {d.domain.mode === 'set' && <DomainSelect id="bulk-domain-value" value={d.domain.value} onChange={(v) => set({ domain: { mode: 'set', value: v } })} />}
            </div>
          </Field>
          <OptField label={tx('CAT 工具', 'CAT tool')} id="bulk-cat" mode={d.catTool.mode} onMode={(mode) => set({ catTool: { ...d.catTool, mode } })}>
            <Input list="bulk-cat-tools" value={d.catTool.value} onChange={(e) => set({ catTool: { mode: 'set', value: e.target.value } })} placeholder="Trados Studio" aria-label={tx('CAT 工具名稱', 'CAT tool name')} />
            <datalist id="bulk-cat-tools">
              {CAT_TOOLS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </OptField>
          <Field label={tx('服務類型', 'Service')} htmlFor="bulk-service">
            <Select id="bulk-service" value={d.service} onChange={(e) => set({ service: e.target.value })}>
              {keepOpt}
              {SERVICES.map((s) => (
                <option key={s.id} value={s.id}>
                  {en ? s.en : s.zh}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={tx('來源語言', 'Source')} htmlFor="bulk-src">
              <div className="flex flex-col gap-2">
                <Select id="bulk-src" value={d.sourceLang === KEEP ? KEEP : 'set'} onChange={(e) => set({ sourceLang: e.target.value === KEEP ? KEEP : (shared('sourceLang') as string) ?? settings.defaultSourceLang })}>
                  {keepOpt}
                  <option value="set">{tx('設為…', 'Set to…')}</option>
                </Select>
                {d.sourceLang !== KEEP && <LangSelect compact value={d.sourceLang} onChange={(v) => set({ sourceLang: v })} aria-label={tx('來源語言', 'Source language')} />}
              </div>
            </Field>
            <Field label={tx('目標語言', 'Target')} htmlFor="bulk-tgt">
              <div className="flex flex-col gap-2">
                <Select id="bulk-tgt" value={d.targetLang === KEEP ? KEEP : 'set'} onChange={(e) => set({ targetLang: e.target.value === KEEP ? KEEP : (shared('targetLang') as string) ?? settings.defaultTargetLang })}>
                  {keepOpt}
                  <option value="set">{tx('設為…', 'Set to…')}</option>
                </Select>
                {d.targetLang !== KEEP && <LangSelect compact value={d.targetLang} onChange={(v) => set({ targetLang: v })} aria-label={tx('目標語言', 'Target language')} />}
              </div>
            </Field>
          </div>
        </Section>

        <Section title={tx('計價', 'Pricing')} count={has('unit', 'rate', 'currency')}>
          <Field label={tx('計價單位', 'Unit')} htmlFor="bulk-unit">
            <Select id="bulk-unit" value={d.unit} onChange={(e) => set({ unit: e.target.value })}>
              {keepOpt}
              {UNITS.map((u) => (
                <option key={u.id} value={u.id}>
                  {en ? u.en : u.zh}
                </option>
              ))}
            </Select>
          </Field>
          <OptField label={tx('單價（整案則為案費）', 'Rate (fee when flat)')} id="bulk-rate" mode={d.rate.mode} clearable={false} onMode={(mode) => set({ rate: { ...d.rate, mode } })}>
            <NumberInput value={d.rate.value} onChange={(v) => set({ rate: { mode: 'set', value: v } })} placeholder="0" aria-label={tx('單價', 'Rate')} />
          </OptField>
          <Field label={tx('幣別', 'Currency')} htmlFor="bulk-currency" hint={shared('currency') ? undefined : tx('選取的案件幣別不同', 'The selected jobs use different currencies')}>
            <Select id="bulk-currency" value={d.currency} onChange={(e) => set({ currency: e.target.value })}>
              {keepOpt}
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} · {en ? c.en : c.zh}
                </option>
              ))}
            </Select>
          </Field>
        </Section>

        <Section title={tx('客戶與專案', 'Client and project')} count={has('clientId', 'projectId')}>
          <Field label={tx('客戶', 'Client')} htmlFor="bulk-client">
            <Select id="bulk-client" value={d.client} onChange={(e) => set({ client: e.target.value })}>
              {keepOpt}
              <option value="">{tx('（無客戶）', '(no client)')}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={tx('專案', 'Project')} htmlFor="bulk-project">
            <Select id="bulk-project" value={d.project} onChange={(e) => set({ project: e.target.value })}>
              {keepOpt}
              <option value="">{tx('（不屬於專案）', '(not in a project)')}</option>
              {projects
                .filter((p) => !p.archived)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </Select>
          </Field>
        </Section>

        <Section title={tx('狀態與日期', 'Status and dates')} count={has('status', 'paidAt', 'receivedAt', 'dueAt', 'deliveredAt')}>
          <Field label={tx('狀態', 'Status')} htmlFor="bulk-status">
            <Select id="bulk-status" value={d.status} onChange={(e) => set({ status: e.target.value })} disabled={d.paid}>
              {keepOpt}
              {[...PIPELINE, 'cancelled' as JobStatus].map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </Select>
          </Field>
          {date('receivedAt', tx('接案日', 'Received'))}
          {date('dueAt', tx('截止日', 'Due date'))}
          {date('deliveredAt', tx('交稿日', 'Delivered'))}
          <label className="flex items-center gap-2 text-[14px] text-ink">
            <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={d.paid} onChange={(e) => set({ paid: e.target.checked })} />
            {tx('標記為已收款', 'Mark as paid')}
          </label>
          {d.paid && (
            <Field label={tx('收款日', 'Paid on')} htmlFor="bulk-paid">
              <Input id="bulk-paid" type="date" value={d.paidAt} onChange={(e) => set({ paidAt: e.target.value || today })} />
            </Field>
          )}
        </Section>

        <Section title={tx('標籤與備註', 'Tags and notes')} count={has('tags', 'notes')}>
          <TextField label={tx('標籤', 'Tags')} id="bulk-tags" value={d.tags} onChange={(tags) => set({ tags })} hint={tx('用逗號分隔', 'Separate with commas')} />
          <TextField label={tx('備註', 'Notes')} id="bulk-notes" value={d.notes} onChange={(notes) => set({ notes })} multiline hint={tx('附加時會另起一行', 'Added on a new line')} />
        </Section>
      </div>
    </Sheet>
  );
}
