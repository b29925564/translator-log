import { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../db/data';
import { saveInvoice, uid, updateSettings } from '../db/repo';
import { addDays } from '../domain/dates';
import { jobGross } from '../domain/money';
import { incomeDate } from '../domain/stats';
import type { Invoice } from '../domain/types';
import { tx } from '../i18n';
import { date, money } from '../ui/format';
import { Button, Field, Input, Pair, Segmented, Select, Sheet, Textarea } from '../ui/kit';
import { useUI } from '../ui/store';

export function InvoiceBuilder({ open, onClose, presetClient, onlyJobs }: { open: boolean; onClose: () => void; presetClient?: string; onlyJobs?: string[] }) {
  const { clients, jobs, settings, today, clientMap } = useData();
  const navigate = useUI((s) => s.navigate);
  const [clientId, setClientId] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [issue, setIssue] = useState(today);
  const [due, setDue] = useState(today);
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  const [number, setNumber] = useState('');
  const [notes, setNotes] = useState('');

  const eligibleClients = useMemo(
    () => clients.filter((c) => jobs.some((j) => j.clientId === c.id && (j.status === 'delivered' || (j.status === 'invoiced' && !j.invoiceId)))),
    [clients, jobs],
  );

  const eligibleRef = useRef(eligibleClients);
  eligibleRef.current = eligibleClients;
  useEffect(() => {
    if (!open) return;
    const cid = presetClient ?? eligibleRef.current[0]?.id ?? '';
    setClientId(cid);
    setIssue(today);
    const seq = settings.invoiceSeq;
    setNumber(`${settings.invoicePrefix}-${today.slice(0, 7).replace('-', '')}-${String(seq).padStart(3, '0')}`);
    setNotes('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, presetClient]);

  const client = clientMap.get(clientId);
  const candidates = useMemo(
    () =>
      jobs
        .filter((j) => j.clientId === clientId && (j.status === 'delivered' || (j.status === 'invoiced' && !j.invoiceId)))
        .sort((a, b) => incomeDate(a).localeCompare(incomeDate(b))),
    [jobs, clientId],
  );

  // reset the selection only when the client changes, not on every data refresh
  const candidatesRef = useRef(candidates);
  candidatesRef.current = candidates;
  useEffect(() => {
    if (!open) return;
    const c = clientMap.get(clientId);
    setPicked(new Set(candidatesRef.current.filter((j) => j.currency === (c?.currency ?? j.currency) && (!onlyJobs || onlyJobs.includes(j.id))).map((j) => j.id)));
    setDue(addDays(today, c?.paymentTermsDays ?? 30));
    setLang(c?.country && c.country !== 'TW' ? 'en' : 'zh');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, open]);

  const currency = client?.currency ?? settings.baseCurrency;
  const chosen = candidates.filter((j) => picked.has(j.id));
  const total = chosen.reduce((s, j) => s + jobGross(j), 0);

  const create = async () => {
    if (!client || !chosen.length) return;
    const inv: Invoice = {
      id: uid(),
      number: number.trim() || `INV-${Date.now()}`,
      clientId: client.id,
      issueDate: issue,
      dueDate: due,
      currency,
      jobIds: chosen.map((j) => j.id),
      lang,
      notes: notes || undefined,
      status: 'sent',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveInvoice(inv, chosen.map((j) => ({ ...j, paymentDueAt: j.paymentDueAt ?? due })));
    await updateSettings({ invoiceSeq: settings.invoiceSeq + 1 });
    onClose();
    navigate('/money/invoices/' + inv.id);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="lg"
      title={tx('建立請款單', 'New invoice')}
      footer={
        <>
          <span className="mr-auto text-[14px] text-ink-2">
            {tx(`${chosen.length} 個項目，合計`, `${chosen.length} items, total`)} <b className="text-ink tnum">{money(total, currency)}</b>
          </span>
          <Button variant="ghost" onClick={onClose}>
            {tx('取消', 'Cancel')}
          </Button>
          <Button variant="primary" disabled={!chosen.length} onClick={() => void create()}>
            {tx('建立', 'Create')}
          </Button>
        </>
      }
    >
      {eligibleClients.length === 0 ? (
        <p className="py-8 text-center text-[14px] text-muted">{tx('目前沒有已交稿但尚未請款的案件。', 'No delivered jobs waiting to be invoiced.')}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={tx('客戶', 'Client')} htmlFor="inv-client">
              <Select id="inv-client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                {eligibleClients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={tx('請款單號', 'Invoice number')} htmlFor="inv-no">
              <Input id="inv-no" value={number} onChange={(e) => setNumber(e.target.value)} className="font-mono" />
            </Field>
            <Field label={tx('開立日期', 'Issue date')} htmlFor="inv-issue">
              <Input
                id="inv-issue"
                type="date"
                value={issue}
                onChange={(e) => {
                  setIssue(e.target.value);
                  // the payment terms run from the issue date
                  if (e.target.value) setDue(addDays(e.target.value, client?.paymentTermsDays ?? 30));
                }}
              />
            </Field>
            <Field label={tx('付款期限', 'Due date')} htmlFor="inv-due">
              <Input id="inv-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </Field>
            <Field label={tx('單據語言', 'Document language')}>
              <Segmented value={lang} onChange={setLang} options={[{ value: 'zh', label: '中文' }, { value: 'en', label: 'English' }]} />
            </Field>
          </div>
          <div>
            <div className="label">{tx('請款項目', 'Items')}</div>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {candidates.map((j) => {
                const disabled = j.currency !== currency;
                return (
                  <li key={j.id}>
                    <label className={`flex items-center gap-3 px-3 py-2.5 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
                      <input
                        type="checkbox"
                        disabled={disabled}
                        checked={picked.has(j.id)}
                        onChange={(e) => {
                          const n = new Set(picked);
                          if (e.target.checked) n.add(j.id);
                          else n.delete(j.id);
                          setPicked(n);
                        }}
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] text-ink">{j.title}</span>
                        <span className="mt-0.5 flex items-center gap-2 text-[12px] text-muted">
                          <Pair source={j.sourceLang} target={j.targetLang} />
                          {j.deliveredAt && date(j.deliveredAt)}
                          {disabled && tx(`（幣別 ${j.currency} 不同）`, ` (different currency ${j.currency})`)}
                        </span>
                      </span>
                      <span className="shrink-0 text-[14px] font-medium text-ink tnum">{money(jobGross(j), j.currency)}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
          <Field label={tx('備註（會印在請款單上）', 'Notes (printed on the invoice)')} htmlFor="inv-notes">
            <Textarea id="inv-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
      )}
    </Sheet>
  );
}
