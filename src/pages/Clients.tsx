import { Building2, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useData } from '../db/data';
import { CLIENT_KINDS } from '../domain/constants';
import { clientStats, type ClientStats } from '../domain/stats';
import type { Client } from '../domain/types';
import { getLang, tx } from '../i18n';
import { date, money, num, pct, rate as fmtRateStr } from '../ui/format';
import { Button, cx, Empty, Input, PageHeader, Segmented } from '../ui/kit';
import { useUI } from '../ui/store';
import { useMedianRate } from '../features/common';

export const GRADE_STYLE: Record<ClientStats['grade'], string> = {
  A: 'bg-good-soft text-good',
  B: 'bg-accent-soft text-accent',
  C: 'bg-warn-soft text-warn',
  D: 'bg-bad-soft text-bad',
};

export function GradeBadge({ grade, size = 'md' }: { grade: ClientStats['grade']; size?: 'md' | 'lg' }) {
  return (
    <span
      className={cx('grid shrink-0 place-items-center rounded-xl font-mono font-semibold', GRADE_STYLE[grade], size === 'lg' ? 'h-12 w-12 text-[22px]' : 'h-9 w-9 text-[15px]')}
      title={tx(`客戶評級 ${grade}`, `Client grade ${grade}`)}
    >
      {grade}
    </span>
  );
}

type Sort = 'income' | 'recent' | 'grade' | 'name';

export function Clients() {
  const { clients, jobs, hours, today, settings } = useData();
  const { navigate, openClientEditor } = useUI();
  const median = useMedianRate();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('income');
  const [showArchived, setShowArchived] = useState(false);
  const base = settings.baseCurrency;
  const en = getLang() === 'en';

  const rows = useMemo(() => {
    const list = clients
      .filter((c) => (showArchived ? true : !c.archived))
      .filter((c) => !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()))
      .map((c) => ({ c, s: clientStats(c, jobs, hours, today, median) }));
    const by: Record<Sort, (a: (typeof list)[number], b: (typeof list)[number]) => number> = {
      income: (a, b) => b.s.income - a.s.income,
      recent: (a, b) => (b.s.lastAt ?? '').localeCompare(a.s.lastAt ?? ''),
      grade: (a, b) => b.s.score - a.s.score,
      name: (a, b) => a.c.name.localeCompare(b.c.name, 'zh-Hant'),
    };
    return list.sort(by[sort]);
  }, [clients, jobs, hours, today, median, q, sort, showArchived]);

  const kindLabel = (c: Client) => {
    const k = CLIENT_KINDS.find((x) => x.id === c.kind);
    return k ? (en ? k.en : k.zh) : '';
  };

  return (
    <div>
      <PageHeader
        eyebrow={tx(`${clients.length} 位客戶`, `${clients.length} clients`)}
        title={tx('客戶', 'Clients')}
        actions={
          <Button variant="primary" size="sm" icon={<Plus size={15} />} onClick={() => openClientEditor(undefined, true)}>
            {tx('新增客戶', 'New client')}
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx('搜尋客戶', 'Search clients')} className="pl-9" aria-label={tx('搜尋客戶', 'Search clients')} />
        </div>
        <Segmented
          size="sm"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'income', label: tx('收入', 'Income') },
            { value: 'grade', label: tx('評級', 'Grade') },
            { value: 'recent', label: tx('最近', 'Recent') },
            { value: 'name', label: tx('名稱', 'Name') },
          ]}
        />
        <button type="button" className="chip" aria-pressed={showArchived} onClick={() => setShowArchived((v) => !v)}>
          {tx('含封存', 'Archived')}
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <Empty icon={<Building2 size={20} />} title={tx('還沒有客戶', 'No clients yet')} body={tx('新增案件時輸入客戶名稱，也會自動建立。', 'Clients are also created automatically when you add a job.')} />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ c, s }) => (
            <button key={c.id} type="button" onClick={() => navigate('/clients/' + c.id)} className={cx('card flex flex-col p-4 text-left transition-colors hover:border-line-strong', c.archived && 'opacity-60')}>
              <div className="flex items-start gap-3">
                <GradeBadge grade={s.grade} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold text-ink">{c.name}</div>
                  <div className="mt-0.5 truncate text-[12.5px] text-muted">
                    {[kindLabel(c), c.country, c.currency].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[15px] font-semibold text-ink tnum">{money(s.income, base, { compact: true })}</div>
                  <div className="text-[12px] text-muted">{pct(s.share)}</div>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-[12px]">
                <div>
                  <dt className="text-muted">{tx('案件', 'Jobs')}</dt>
                  <dd className="mt-0.5 font-medium text-ink tnum">{num(s.jobs)}</dd>
                </div>
                <div>
                  <dt className="text-muted">{tx('每字均價', 'Per word')}</dt>
                  <dd className="mt-0.5 font-medium text-ink tnum">{s.ratePerWord ? fmtRateStr(s.ratePerWord, base) : '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted">{tx('付款天數', 'Days to pay')}</dt>
                  <dd className={cx('mt-0.5 font-medium tnum', s.avgDaysToPay != null && s.avgDaysToPay > (c.paymentTermsDays ?? 30) + 7 ? 'text-bad' : 'text-ink')}>
                    {s.avgDaysToPay != null ? Math.round(s.avgDaysToPay) : '—'}
                  </dd>
                </div>
              </dl>
              {s.lastAt && <div className="mt-2 text-[11.5px] text-muted">{tx(`最近合作 ${date(s.lastAt, { year: 'numeric', month: 'short', day: 'numeric' })}`, `Last job ${date(s.lastAt, { year: 'numeric', month: 'short', day: 'numeric' })}`)}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
