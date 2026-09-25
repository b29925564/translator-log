import { ArrowLeft, Check, Printer, Trash2 } from 'lucide-react';
import { useData } from '../db/data';
import { deleteInvoice, markInvoicePaid, saveInvoice } from '../db/repo';
import { langInfo, unitInfo } from '../domain/constants';
import { fmtDateLong } from '../domain/dates';
import { fmtMoney, fmtNum, fmtRate, jobGross } from '../domain/money';
import { tx } from '../i18n';
import { Button, Empty, Segmented } from '../ui/kit';
import { useUI } from '../ui/store';
import { printPage } from '../features/download';
import { BrandName, WGlyph } from '../app/Logo';
import { Plaque } from '../app/Stamps';

export function InvoiceView({ id }: { id: string }) {
  const { invoices, jobMap, clientMap, settings, today } = useData();
  const { navigate, ask, fireStamp } = useUI();
  const inv = invoices.find((i) => i.id === id);
  if (!inv) {
    return (
      <div className="card">
        <Empty title={tx('找不到這張請款單', 'Invoice not found')} action={<Button onClick={() => navigate('/money')}>{tx('回到收款', 'Back to payments')}</Button>} />
      </div>
    );
  }
  const client = clientMap.get(inv.clientId);
  const items = inv.jobIds.map((jid) => jobMap.get(jid)).filter(Boolean) as NonNullable<ReturnType<typeof jobMap.get>>[];
  const total = items.reduce((s, j) => s + jobGross(j), 0);
  const L = inv.lang === 'en' ? 'en' : 'zh-TW';
  const T = (zh: string, en: string) => (inv.lang === 'en' ? en : zh);
  const p = settings.profile;
  const m = (v: number) => fmtMoney(v, inv.currency, L);

  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => navigate('/money')} className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-muted hover:text-ink">
          <ArrowLeft size={16} /> {tx('收款', 'Payments')}
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented size="sm" value={inv.lang} onChange={(v) => void saveInvoice({ ...inv, lang: v }, [])} options={[{ value: 'zh', label: '中文' }, { value: 'en', label: 'EN' }]} />
          {inv.status !== 'paid' && (
            <Button
              size="sm"
              variant="secondary"
              icon={<Check size={15} />}
              onClick={async () => {
                await markInvoicePaid(inv, today);
                fireStamp(tx('已收款', 'PAID'), today.replace(/-/g, '.'));
              }}
            >
              {tx('標記已付款', 'Mark paid')}
            </Button>
          )}
          <Button size="sm" variant="primary" icon={<Printer size={15} />} onClick={printPage}>
            {tx('列印／存成 PDF', 'Print / PDF')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            iconOnly
            icon={<Trash2 size={15} />}
            aria-label={tx('刪除請款單', 'Delete invoice')}
            onClick={async () => {
              const ok = await ask({ title: tx('刪除這張請款單？', 'Delete this invoice?'), body: tx('案件會回到「已交稿」狀態。', 'Its jobs go back to “Delivered”.'), confirm: tx('刪除', 'Delete'), danger: true });
              if (!ok) return;
              await deleteInvoice(inv);
              navigate('/money');
            }}
          />
        </div>
      </div>

      <article className="print-page relative mx-auto max-w-[820px] overflow-hidden rounded-[4px] border border-line bg-white p-8 text-[#0b0b0c] sm:p-12" style={{ boxShadow: 'var(--shadow)', colorScheme: 'light' }}>
        {inv.status === 'paid' && (
          <div className="absolute right-10 top-28">
            <Plaque title={T('已收款', 'PAID')} sub={(inv.paidAt ?? today).replace(/-/g, '.')} color="#a8843f" width={170} />
          </div>
        )}
        <header className="flex flex-wrap items-start justify-between gap-6 pb-6">
          <div>
            <div className="mb-3 flex items-center gap-2 text-[#0b0b0c]">
              <WGlyph size={22} color="#a8843f" />
              <BrandName gold="#a8843f" className="font-wide text-[10px] tracking-[0.3em]" />
            </div>
            <div className="font-display text-[40px] leading-none">{T('請款單', 'Invoice')}</div>
            <div className="mt-2 font-mono text-[13px] tracking-wide text-[#51606d]">{inv.number}</div>
          </div>
          <div className="text-right text-[13px] leading-relaxed">
            <div className="text-[16px] font-semibold">{inv.lang === 'en' ? p.nameEn || p.name : p.name}</div>
            {p.title && <div className="text-[#51606d]">{p.title}</div>}
            {p.email && <div>{p.email}</div>}
            {p.phone && <div>{p.phone}</div>}
            {p.address && <div className="whitespace-pre-line">{p.address}</div>}
            {p.taxId && <div>{T('身分證／統編', 'Tax ID')}: {p.taxId}</div>}
          </div>
        </header>
        <div className="h-[5px] border-y border-[#0b0b0c]" style={{ borderTopWidth: 2 }} />

        <section className="mt-6 grid gap-6 text-[13.5px] sm:grid-cols-2">
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7a8793]">{T('請款對象', 'Bill to')}</div>
            <div className="text-[15px] font-semibold">{client?.name}</div>
            {client?.contactName && <div>{client.contactName}</div>}
            {client?.address && <div className="whitespace-pre-line text-[#51606d]">{client.address}</div>}
            {client?.taxId && <div className="text-[#51606d]">{T('統一編號', 'Tax ID')}: {client.taxId}</div>}
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 sm:justify-self-end">
            <dt className="text-[#7a8793]">{T('開立日期', 'Issue date')}</dt>
            <dd className="text-right">{fmtDateLong(inv.issueDate, L)}</dd>
            {inv.dueDate && (
              <>
                <dt className="text-[#7a8793]">{T('付款期限', 'Due date')}</dt>
                <dd className="text-right">{fmtDateLong(inv.dueDate, L)}</dd>
              </>
            )}
            <dt className="text-[#7a8793]">{T('幣別', 'Currency')}</dt>
            <dd className="text-right">{inv.currency}</dd>
          </dl>
        </section>

        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[520px] text-[13.5px] tnum">
            <thead>
              <tr className="border-b border-[#c9d2d8] text-left text-[11.5px] uppercase tracking-[0.08em] text-[#7a8793]">
                <th className="py-2 pr-2 font-semibold">#</th>
                <th className="py-2 pr-2 font-semibold">{T('項目', 'Description')}</th>
                <th className="py-2 pr-2 text-right font-semibold">{T('數量', 'Qty')}</th>
                <th className="py-2 pr-2 text-right font-semibold">{T('單價', 'Rate')}</th>
                <th className="py-2 text-right font-semibold">{T('金額', 'Amount')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((j, i) => {
                const unit = unitInfo(j.unit);
                const qty = j.unit === 'flat' ? 1 : j.cat ? Object.values(j.cat.counts).reduce<number>((s, v) => s + (v || 0), 0) : j.quantity;
                return (
                  <tr key={j.id} className="border-b border-[#e3e8eb] align-top">
                    <td className="py-3 pr-2 text-[#7a8793]">{i + 1}</td>
                    <td className="py-3 pr-2">
                      <div className="font-medium">{j.title}</div>
                      <div className="mt-0.5 text-[12px] text-[#7a8793]">
                        {langInfo(j.sourceLang).short} → {langInfo(j.targetLang).short}
                        {j.poNumber && ` · PO ${j.poNumber}`}
                        {j.deliveredAt && ` · ${T('交稿', 'Delivered')} ${fmtDateLong(j.deliveredAt, L)}`}
                        {j.cat && ` · ${T('CAT 加權計價', 'CAT-weighted')}`}
                        {!!j.surchargePct && ` · ${j.surchargePct > 0 ? T('急件', 'Rush') : T('折扣', 'Discount')} ${j.surchargePct}%`}
                      </div>
                    </td>
                    <td className="py-3 pr-2 text-right">
                      {j.unit === 'flat' ? '1' : fmtNum(qty, L, 2)} <span className="text-[11.5px] text-[#7a8793]">{inv.lang === 'en' ? unit.per.en : unit.per.zh}</span>
                    </td>
                    <td className="py-3 pr-2 text-right">{j.unit === 'flat' ? m(j.rate) : fmtRate(j.rate, inv.currency, L)}</td>
                    <td className="py-3 text-right font-medium">{m(jobGross(j))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex justify-end">
          <dl className="w-full max-w-[280px] text-[14px]">
            <div className="flex justify-between py-1.5">
              <dt className="text-[#51606d]">{T('小計', 'Subtotal')}</dt>
              <dd className="tnum">{m(total)}</dd>
            </div>
            <div className="mt-1 flex justify-between border-t-2 border-[#0b0b0c] pt-3 text-[18px] font-semibold">
              <dt>{T('應付總額', 'Total due')}</dt>
              <dd className="tnum">{m(total)}</dd>
            </div>
          </dl>
        </div>

        <footer className="mt-10 grid gap-6 border-t border-[#e3e8eb] pt-6 text-[12.5px] leading-relaxed text-[#51606d] sm:grid-cols-2">
          {p.bank && (
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7a8793]">{T('匯款資訊', 'Payment details')}</div>
              <div className="whitespace-pre-line text-[#0b0b0c]">{p.bank}</div>
            </div>
          )}
          <div>
            {client?.withholds && inv.currency === 'TWD' && <p>{T('本單金額為稅前報酬；所得稅扣繳及二代健保補充保費由給付單位依法辦理。', 'Amounts are before statutory withholding, which the payer handles.')}</p>}
            {inv.notes && <p className="mt-2 whitespace-pre-line text-[#0b0b0c]">{inv.notes}</p>}
            <p className="mt-2">{T('感謝您的合作。', 'Thank you for your business.')}</p>
          </div>
        </footer>
      </article>
    </div>
  );
}
