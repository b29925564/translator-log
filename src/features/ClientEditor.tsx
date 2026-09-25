import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useData } from '../db/data';
import { deleteClient, newClient, saveClient } from '../db/repo';
import { CLIENT_KINDS, DEFAULT_CAT_GRID, UNITS } from '../domain/constants';
import type { Client, Unit } from '../domain/types';
import { getLang, tx } from '../i18n';
import { Button, Field, Input, NumberInput, Select, Sheet, Textarea, Toggle } from '../ui/kit';
import { useUI } from '../ui/store';
import { CatPanel } from './CatPanel';
import { CurrencySelect } from './common';
import { cleanRates, RateCardEditor } from './RateCardEditor';

export function ClientEditor() {
  const { clientEditor, closeClientEditor, ask, toast, navigate } = useUI();
  const { settings, jobs } = useData();
  const [c, setC] = useState<Client | null>(null);
  const [gridOn, setGridOn] = useState(false);

  useEffect(() => {
    if (clientEditor.open) {
      const base = clientEditor.client ?? newClient({ currency: settings.baseCurrency, withholds: settings.tax.region === 'TW' });
      setC({ ...base });
      setGridOn(!!base.catGrid);
    } else setC(null);
  }, [clientEditor.open, clientEditor.client, settings.baseCurrency, settings.tax.region]);

  if (!c) return null;
  const set = (p: Partial<Client>) => setC((x) => (x ? { ...x, ...p } : x));
  const en = getLang() === 'en';
  const jobCount = jobs.filter((j) => j.clientId === c.id).length;

  const save = async () => {
    if (!c.name.trim()) return;
    const rec = await saveClient({ ...c, name: c.name.trim(), catGrid: gridOn ? c.catGrid ?? DEFAULT_CAT_GRID : undefined, rates: cleanRates(c.rates) });
    clientEditor.onSaved?.(rec);
    closeClientEditor();
    toast(clientEditor.isNew ? tx(`已新增客戶「${rec.name}」`, `Added client “${rec.name}”`) : tx('已儲存', 'Saved'));
  };

  const remove = async () => {
    const ok = await ask({
      title: tx('刪除這位客戶？', 'Delete this client?'),
      body: jobCount ? tx(`${jobCount} 個案件會保留，但不再連結到客戶。也可以改用「封存」。`, `${jobCount} jobs stay but lose their client link. You can archive instead.`) : undefined,
      confirm: tx('刪除', 'Delete'),
      danger: true,
    });
    if (!ok) return;
    await deleteClient(c.id);
    closeClientEditor();
    navigate('/clients');
  };

  return (
    <Sheet
      open={clientEditor.open}
      onClose={closeClientEditor}
      size="md"
      title={clientEditor.isNew ? tx('新增客戶', 'New client') : tx('編輯客戶', 'Edit client')}
      footer={
        <>
          {!clientEditor.isNew && (
            <Button variant="ghost" className="mr-auto text-bad" icon={<Trash2 size={16} />} onClick={remove}>
              {tx('刪除', 'Delete')}
            </Button>
          )}
          <Button variant="ghost" onClick={closeClientEditor}>
            {tx('取消', 'Cancel')}
          </Button>
          <Button variant="primary" onClick={save} disabled={!c.name.trim()}>
            {tx('儲存', 'Save')}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label={tx('名稱', 'Name')} className="sm:col-span-2" htmlFor="cl-name">
          <Input id="cl-name" data-autofocus value={c.name} onChange={(e) => set({ name: e.target.value })} placeholder={tx('例如：藍海翻譯社', 'e.g. Lumina Localization')} />
        </Field>
        <Field label={tx('類型', 'Type')} htmlFor="cl-kind">
          <Select id="cl-kind" value={c.kind} onChange={(e) => set({ kind: e.target.value as Client['kind'] })}>
            {CLIENT_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {en ? k.en : k.zh}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tx('國家／地區', 'Country')} htmlFor="cl-country">
          <Input id="cl-country" value={c.country ?? ''} onChange={(e) => set({ country: e.target.value || undefined })} placeholder="TW / US / JP" />
        </Field>
        <Field label={tx('幣別', 'Currency')} htmlFor="cl-cur">
          <CurrencySelect id="cl-cur" value={c.currency} onChange={(v) => set({ currency: v })} />
        </Field>
        <Field label={tx('付款天數', 'Payment terms (days)')} htmlFor="cl-terms">
          <NumberInput id="cl-terms" value={c.paymentTermsDays} onChange={(v) => set({ paymentTermsDays: v })} placeholder="30" />
        </Field>
        <Field label={tx('預設計價單位', 'Default unit')} htmlFor="cl-unit">
          <Select id="cl-unit" value={c.defaultUnit ?? ''} onChange={(e) => set({ defaultUnit: (e.target.value || undefined) as Unit | undefined })}>
            <option value="">—</option>
            {UNITS.map((u) => (
              <option key={u.id} value={u.id}>
                {en ? u.en : u.zh}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tx('預設單價', 'Default rate')} htmlFor="cl-rate">
          <NumberInput id="cl-rate" value={c.defaultRate} onChange={(v) => set({ defaultRate: v })} placeholder="—" />
        </Field>
        <div className="sm:col-span-2">
          <div className="label">{tx('費率表', 'Rate card')}</div>
          <p className="mb-2 text-[12.5px] text-muted">
            {tx('依服務與語言組合分開記錄，例如英→中翻譯、校對、MTPE 各一個價。新增案件時會自動帶入對應的費率；沒列到的服務用上面的預設單價。', 'One rate per service and language pair, e.g. EN→ZH translation, proofreading and MTPE. New jobs pick the matching rate; anything not listed uses the default rate above.')}
          </p>
          <RateCardEditor client={c} onChange={(rates) => set({ rates })} fallback={{ sourceLang: settings.defaultSourceLang, targetLang: settings.defaultTargetLang }} />
        </div>
        {settings.tax.region === 'TW' && (
          <div className="sm:col-span-2">
            <Toggle checked={!!c.withholds} onChange={(v) => set({ withholds: v })} label={tx('會代扣所得稅與二代健保', 'Withholds income tax and NHI premium')} description={tx('台灣公司給付超過 2 萬元時通常會扣繳 10% 並代扣補充保費', 'Taiwanese payers usually withhold 10% and the NHI premium above NT$20,000')} />
          </div>
        )}
        <Field label={tx('履歷上的匿名稱呼', 'Name on an anonymised résumé')} className="sm:col-span-2" htmlFor="cl-public" hint={tx('例如「國際醫療器材公司」。留空會依類型自動產生。', 'e.g. “Global medical-device maker”. Left empty, one is generated from the type.')}>
          <Input id="cl-public" value={c.publicLabel ?? ''} onChange={(e) => set({ publicLabel: e.target.value || undefined })} />
        </Field>
        <Field label={tx('聯絡人', 'Contact')} htmlFor="cl-contact">
          <Input id="cl-contact" value={c.contactName ?? ''} onChange={(e) => set({ contactName: e.target.value || undefined })} />
        </Field>
        <Field label="Email" htmlFor="cl-email">
          <Input id="cl-email" type="email" value={c.email ?? ''} onChange={(e) => set({ email: e.target.value || undefined })} />
        </Field>
        <Field label={tx('統一編號／稅號', 'Tax ID')} htmlFor="cl-tax">
          <Input id="cl-tax" value={c.taxId ?? ''} onChange={(e) => set({ taxId: e.target.value || undefined })} />
        </Field>
        <Field label={tx('電話', 'Phone')} htmlFor="cl-phone">
          <Input id="cl-phone" value={c.phone ?? ''} onChange={(e) => set({ phone: e.target.value || undefined })} />
        </Field>
        <Field label={tx('地址（請款單用）', 'Billing address')} className="sm:col-span-2" htmlFor="cl-addr">
          <Textarea id="cl-addr" rows={2} value={c.address ?? ''} onChange={(e) => set({ address: e.target.value || undefined })} />
        </Field>
        <div className="sm:col-span-2">
          <Toggle checked={gridOn} onChange={setGridOn} label={tx('自訂 CAT 比對計費表', 'Custom CAT discount grid')} description={tx('新案件開啟 CAT 加權時會套用', 'Applied when CAT weighting is on for this client’s jobs')} />
          {gridOn && (
            <div className="mt-2">
              <CatPanel counts={{}} grid={c.catGrid ?? DEFAULT_CAT_GRID} onChange={(_, grid) => set({ catGrid: grid })} />
            </div>
          )}
        </div>
        <Field label={tx('備註', 'Notes')} className="sm:col-span-2" htmlFor="cl-notes">
          <Textarea id="cl-notes" rows={2} value={c.notes ?? ''} onChange={(e) => set({ notes: e.target.value || undefined })} />
        </Field>
        {!clientEditor.isNew && (
          <div className="sm:col-span-2">
            <Toggle checked={!!c.archived} onChange={(v) => set({ archived: v })} label={tx('封存', 'Archived')} description={tx('不再出現在新案件的客戶選單', 'Hidden from the client picker for new jobs')} />
          </div>
        )}
      </form>
    </Sheet>
  );
}
