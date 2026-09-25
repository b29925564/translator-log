import { Download, Info, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useData } from '../db/data';
import { toCSV } from '../domain/csv';
import { jobGross } from '../domain/money';
import { taxYear } from '../domain/tax';
import { tx } from '../i18n';
import { money, num } from '../ui/format';
import { Button, Empty, fitText, PageHeader, Segmented } from '../ui/kit';
import { useUI } from '../ui/store';
import { downloadFile } from '../features/download';

const CAT_LABEL = () => ({
  '9B': tx('9B 稿費', '9B Royalties & writing fees'),
  '9A': tx('9A 執行業務所得', '9A Professional income'),
  '50': tx('50 薪資', '50 Salary'),
  none: tx('未分類', 'Unclassified'),
});

export function Tax() {
  const { jobs, settings, clientMap, today } = useData();
  const navigate = useUI((s) => s.navigate);
  const years = useMemo(() => {
    const ys = [...new Set(jobs.filter((j) => j.status === 'paid' && j.paidAt).map((j) => j.paidAt!.slice(0, 4)))].sort().reverse();
    return ys.length ? ys : [today.slice(0, 4)];
  }, [jobs, today]);
  const [year, setYear] = useState(() => {
    const last = String(Number(today.slice(0, 4)) - 1);
    return years.includes(last) && Number(today.slice(5, 7)) <= 6 ? last : years[0];
  });
  const t = useMemo(() => taxYear(jobs, Number(year), settings.tax), [jobs, year, settings.tax]);
  const base = settings.baseCurrency;
  const labels = CAT_LABEL();

  if (settings.tax.region !== 'TW') {
    return (
      <div>
        <PageHeader title={tx('報稅', 'Taxes')} />
        <div className="card">
          <Empty title={tx('報稅助手目前支援台灣', 'The tax helper currently supports Taiwan')} body={tx('若你在台灣報稅，請到設定將地區改為台灣。', 'If you file taxes in Taiwan, switch your region in Settings.')} action={<Button onClick={() => navigate('/settings')}>{tx('前往設定', 'Open Settings')}</Button>} />
        </div>
      </div>
    );
  }

  const exportCSV = () => {
    const rows: (string | number | undefined)[][] = [
      [tx('收款日', 'Paid on'), tx('給付單位', 'Payer'), tx('案件', 'Job'), tx('所得類別', 'Category'), tx('幣別', 'Currency'), tx('總額', 'Gross'), tx('扣繳', 'Withheld'), tx('補充保費', 'NHI'), tx('手續費', 'Fees'), `${tx('總額', 'Gross')} ${base}`],
      ...jobs
        .filter((j) => j.status === 'paid' && j.paidAt?.startsWith(year))
        .sort((a, b) => a.paidAt!.localeCompare(b.paidAt!))
        .map((j) => [j.paidAt, j.clientId ? clientMap.get(j.clientId)?.name : '', j.title, j.incomeCategory ?? '9B', j.currency, jobGross(j), j.withholding ?? 0, j.nhi ?? 0, j.fees ?? 0, Math.round(jobGross(j) * (j.fxToBase || 1))]),
    ];
    void downloadFile(`witimemo-tax-${year}.csv`, toCSV(rows), 'text/csv');
  };

  const g9b = t.lines.find((l) => l.category === '9B')?.gross ?? 0;

  return (
    <div>
      <PageHeader
        eyebrow={tx('綜合所得稅參考', 'Income tax worksheet')}
        title={tx('報稅助手', 'Tax helper')}
        actions={
          <Button size="sm" variant="ghost" icon={<Download size={15} />} onClick={exportCSV}>
            {tx('匯出明細', 'Export')}
          </Button>
        }
      />
      <div className="mb-4 scroll-x">
        <Segmented value={year} onChange={setYear} options={years.slice(0, 6).map((y) => ({ value: y, label: tx(`${y} 年度`, y) }))} />
      </div>

      <div className="ruled mb-4 grid-cols-2 md:grid-cols-5">
        {[
          { l: tx('全年收款（稅前）', 'Gross received'), v: t.gross },
          { l: tx('已扣繳稅額', 'Tax withheld'), v: t.withheld, sub: tx('可抵繳應納稅額', 'Credited against tax due') },
          { l: tx('二代健保補充保費', 'NHI premium'), v: t.nhi },
          { l: tx('手續費', 'Fees'), v: t.fees },
          { l: tx('實際入帳', 'Net received'), v: t.net },
        ].map((x) => (
          <div key={x.l} className="min-w-0 p-4 [container-type:inline-size] last:col-span-2 sm:p-5 md:last:col-span-1">
            <div className="eyebrow truncate">{x.l}</div>
            <div className="tnum mt-3 truncate font-medium leading-none tracking-[-0.03em] text-ink" style={fitText(money(x.v, base), 22)}>
              {money(x.v, base)}
            </div>
            {x.sub && <div className="mt-2 text-[11.5px] text-muted">{x.sub}</div>}
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-[15px] font-semibold text-ink">{tx('稿費（9B）應稅所得估算', '9B taxable income estimate')}</h2>
          <dl className="mt-3 divide-y divide-line text-[14px]">
            <div className="flex justify-between py-2">
              <dt className="text-muted">{tx('9B 稿費收入', '9B income')}</dt>
              <dd className="text-ink tnum">{money(g9b, base)}</dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-muted">{tx('減：全年免稅額', 'Less annual exemption')}</dt>
              <dd className="text-ink tnum">− {money(Math.min(g9b, settings.tax.exemption9B), base)}</dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-muted">{tx(`減：必要費用 ${Math.round(settings.tax.expenseRate9B * 100)}%`, `Less ${Math.round(settings.tax.expenseRate9B * 100)}% expenses`)}</dt>
              <dd className="text-ink tnum">− {money(Math.max(0, g9b - settings.tax.exemption9B) * settings.tax.expenseRate9B, base)}</dd>
            </div>
            <div className="flex justify-between py-2.5 text-[16px] font-semibold">
              <dt className="text-ink">{tx('估計應申報所得額', 'Estimated taxable amount')}</dt>
              <dd className="text-ink tnum">{money(t.taxable9B, base)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
            {tx('稿費、版稅等收入全年合計 18 萬元以內免稅；超過部分可減除 30% 必要費用（或核實認列）。實際類別依給付單位開立的扣繳憑單為準。', 'Royalty-type income is tax-free up to NT$180,000 a year; beyond that, 30% can be deducted as expenses. Your payer’s withholding statement decides the category.')}
          </p>
        </section>

        <section className="card p-5">
          <h2 className="text-[15px] font-semibold text-ink">{tx('所得類別', 'By income category')}</h2>
          <table className="mt-3 w-full text-[13.5px] tnum">
            <thead>
              <tr className="text-left text-[12px] text-muted">
                <th className="pb-2 font-medium">{tx('類別', 'Category')}</th>
                <th className="pb-2 text-right font-medium">{tx('收入', 'Gross')}</th>
                <th className="pb-2 text-right font-medium">{tx('扣繳', 'Withheld')}</th>
                <th className="pb-2 text-right font-medium">{tx('筆數', 'Count')}</th>
              </tr>
            </thead>
            <tbody>
              {t.lines.map((l) => (
                <tr key={l.category} className="border-t border-line">
                  <td className="py-2 text-ink">{labels[l.category]}</td>
                  <td className="py-2 text-right text-ink">{money(l.gross, base)}</td>
                  <td className="py-2 text-right text-ink-2">{money(l.withheld, base)}</td>
                  <td className="py-2 text-right text-muted">{l.count}</td>
                </tr>
              ))}
              {!t.lines.length && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted">
                    {tx('這個年度沒有收款紀錄', 'No payments recorded this year')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {t.unwithheld > 0 && (
            <div className="mt-4 flex gap-3 rounded-xl bg-warn-soft p-3 text-[13px] leading-relaxed text-ink">
              <TriangleAlert size={18} className="mt-0.5 shrink-0 text-warn" />
              <span>
                {tx(
                  `有 ${t.unwithheldCount} 筆、共 ${money(t.unwithheld, base)} 的收入沒有被扣繳（多半是國外客戶或小額案件）。在台灣提供勞務取得的報酬，一般仍屬中華民國來源所得，報稅時記得自行申報。`,
                  `${t.unwithheldCount} payments totalling ${money(t.unwithheld, base)} had nothing withheld (usually overseas or small clients). Pay for work performed in Taiwan is generally Taiwan-source income, so remember to declare it yourself.`,
                )}
              </span>
            </div>
          )}
        </section>

        <section className="card overflow-hidden lg:col-span-2">
          <div className="px-5 pb-2 pt-4">
            <h2 className="text-[15px] font-semibold text-ink">{tx('給付單位對帳', 'Reconcile by payer')}</h2>
            <p className="mt-0.5 text-[12.5px] text-muted">{tx('和各公司寄來的扣繳憑單逐一核對。', 'Check these against each payer’s withholding statement.')}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[13.5px] tnum">
              <thead>
                <tr className="border-y border-line bg-surface-2 text-left text-[12px] text-muted">
                  <th className="px-5 py-2 font-medium">{tx('給付單位', 'Payer')}</th>
                  <th className="px-3 py-2 text-right font-medium">{tx('收入', 'Gross')}</th>
                  <th className="px-3 py-2 text-right font-medium">{tx('扣繳稅額', 'Withheld')}</th>
                  <th className="px-3 py-2 text-right font-medium">{tx('補充保費', 'NHI')}</th>
                  <th className="px-5 py-2 text-right font-medium">{tx('筆數', 'Count')}</th>
                </tr>
              </thead>
              <tbody>
                {t.byPayer.map((p) => (
                  <tr key={p.clientId ?? 'none'} className="border-b border-line">
                    <td className="px-5 py-2 text-ink">{p.clientId ? clientMap.get(p.clientId)?.name ?? '—' : tx('（未指定）', '(none)')}</td>
                    <td className="px-3 py-2 text-right text-ink">{money(p.gross, base)}</td>
                    <td className="px-3 py-2 text-right text-ink-2">{p.withheld ? money(p.withheld, base) : '—'}</td>
                    <td className="px-3 py-2 text-right text-ink-2">{p.nhi ? money(p.nhi, base) : '—'}</td>
                    <td className="px-5 py-2 text-right text-muted">{num(p.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {t.pendingCount > 0 && (
        <p className="mt-4 text-[13px] text-muted">
          {tx(`另有 ${t.pendingCount} 筆 ${year} 年交稿但尚未收款的案件，收到款項的年度才會列入所得。`, `${t.pendingCount} jobs delivered in ${year} are still unpaid; income counts in the year the money arrives.`)}
        </p>
      )}
      <div className="mt-4 flex gap-2 text-[12px] leading-relaxed text-muted">
        <Info size={15} className="mt-0.5 shrink-0" />
        <span>{tx('本頁依你的紀錄整理，僅供報稅前參考；稅率與門檻可在設定中調整。實際金額以國稅局資料及最新法規為準，有疑問請洽國稅局或會計師。', 'A worksheet built from your own records, for reference only. Rates and thresholds are adjustable in Settings. Official figures and current law always prevail.')}</span>
      </div>
    </div>
  );
}
