import { Building2, CornerDownLeft, Crosshair, FileText, FileUp, FolderKanban, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useData } from '../db/data';
import { jobGross } from '../domain/money';
import { incomeDate } from '../domain/stats';
import { tx } from '../i18n';
import { date, money } from '../ui/format';
import { cx, StatusPill } from '../ui/kit';
import { useUI } from '../ui/store';
import { NAV } from './Shell';

interface Item {
  id: string;
  group: string;
  label: string;
  sub?: string;
  icon: React.ReactNode;
  right?: React.ReactNode;
  run: () => void;
}

const norm = (s: string) => s.toLowerCase().normalize('NFKC');

export function CommandPalette() {
  const { palette, setPalette, navigate, openQuickAdd, openClientEditor, openProjectEditor } = useUI();
  const { jobs, clients, clientMap, settings, projects } = useData();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (palette) {
      setQ('');
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [palette]);

  const items = useMemo<Item[]>(() => {
    const nq = norm(q.trim());
    const out: Item[] = [];
    const close = () => setPalette(false);
    const urgent = jobs.filter((j) => j.status === 'active').sort((a, b) => (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999'))[0];
    const actions: Item[] = [
      { id: 'a-new', group: tx('動作', 'Actions'), label: tx('新增案件', 'New job'), sub: q.trim() ? tx(`用「${q.trim()}」建立`, `Create from “${q.trim()}”`) : undefined, icon: <Plus size={16} />, run: () => { close(); openQuickAdd(q.trim()); } },
      { id: 'a-client', group: tx('動作', 'Actions'), label: tx('新增客戶', 'New client'), icon: <Building2 size={16} />, run: () => { close(); openClientEditor(undefined, true); } },
      { id: 'a-project', group: tx('動作', 'Actions'), label: tx('新增專案', 'New project'), sub: tx('大案子拆成部分管理', 'Split a big job into parts'), icon: <FolderKanban size={16} />, run: () => { close(); openProjectEditor(); } },
      { id: 'a-import', group: tx('動作', 'Actions'), label: tx('匯入報表', 'Import a report'), sub: tx('Excel、PDF、照片、截圖', 'Excel, PDF, photos, screenshots'), icon: <FileUp size={16} />, run: () => { close(); useUI.getState().openReportImport(); } },
      ...(urgent
        ? [{ id: 'a-focus', group: tx('動作', 'Actions'), label: tx('開始專注', 'Start a focus session'), sub: urgent.title, icon: <Crosshair size={16} />, run: () => { close(); navigate('/focus/' + urgent.id); } }]
        : []),
      ...NAV.filter((n) => !n.twOnly || settings.tax.region === 'TW').map((n) => ({
        id: 'n-' + n.route,
        group: tx('前往', 'Go to'),
        label: n.label(),
        icon: <n.icon size={16} />,
        run: () => { close(); navigate(n.route); },
      })),
    ];
    if (!nq) return [...actions.filter((a) => a.id.startsWith('a-')), ...[...jobs].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6).map((j) => jobItem(j)), ...actions.filter((a) => !a.id.startsWith('a-'))];
    function jobItem(j: (typeof jobs)[number]): Item {
      const c = j.clientId ? clientMap.get(j.clientId) : undefined;
      return {
        id: 'j-' + j.id,
        group: tx('案件', 'Jobs'),
        label: j.title,
        sub: [c?.name, date(incomeDate(j), { year: 'numeric', month: 'short', day: 'numeric' })].filter(Boolean).join(' · '),
        icon: <FileText size={16} />,
        right: (
          <span className="flex items-center gap-3">
            <span className="text-[12.5px] text-ink-2 tnum">{money(jobGross(j), j.currency)}</span>
            <StatusPill status={j.status} className="hidden sm:inline-flex" />
          </span>
        ),
        run: () => { close(); navigate('/jobs/' + j.id); },
      };
    }
    out.push(...actions.filter((a) => norm(a.label).includes(nq) || a.id === 'a-new'));
    out.push(
      ...clients
        .filter((c) => norm(c.name).includes(nq))
        .slice(0, 5)
        .map((c) => ({ id: 'c-' + c.id, group: tx('客戶', 'Clients'), label: c.name, icon: <Building2 size={16} />, run: () => { close(); navigate('/clients/' + c.id); } })),
    );
    out.push(
      ...projects
        .filter((pj) => norm(`${pj.name} ${pj.clientId ? clientMap.get(pj.clientId)?.name ?? '' : ''}`).includes(nq))
        .slice(0, 5)
        .map((pj) => ({ id: 'p-' + pj.id, group: tx('專案', 'Projects'), label: pj.name, sub: pj.clientId ? clientMap.get(pj.clientId)?.name : undefined, icon: <FolderKanban size={16} />, run: () => { close(); navigate('/projects/' + pj.id); } })),
    );
    out.push(
      ...jobs
        .filter((j) => {
          const c = j.clientId ? clientMap.get(j.clientId)?.name ?? '' : '';
          return norm(`${j.title} ${c} ${j.poNumber ?? ''} ${j.notes ?? ''} ${j.domain ?? ''}`).includes(nq);
        })
        .sort((a, b) => incomeDate(b).localeCompare(incomeDate(a)))
        .slice(0, 12)
        .map(jobItem),
    );
    return out;
  }, [q, jobs, clients, clientMap, projects, settings.tax.region, navigate, openQuickAdd, openClientEditor, openProjectEditor, setPalette]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${sel}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  if (!palette) return null;
  let lastGroup = '';
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-3 pt-[10vh]" role="presentation">
      <div className="absolute inset-0" style={{ background: 'var(--backdrop)' }} onClick={() => setPalette(false)} />
      <div role="dialog" aria-modal="true" aria-label={tx('搜尋與指令', 'Search & commands')} className="relative w-full max-w-[620px] overflow-hidden rounded-2xl border border-line bg-surface animate-[pop_.16s_ease]" style={{ boxShadow: 'var(--shadow-lg)' }}>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={18} className="text-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSel((s) => Math.min(items.length - 1, s + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                items[sel]?.run();
              } else if (e.key === 'Escape') setPalette(false);
            }}
            placeholder={tx('搜尋案件、客戶，或輸入指令…', 'Search jobs, clients, or type a command…')}
            className="h-14 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-muted"
            aria-label={tx('搜尋', 'Search')}
          />
        </div>
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto p-2">
          {items.length === 0 && <div className="px-3 py-8 text-center text-[14px] text-muted">{tx('找不到符合的結果', 'No matches')}</div>}
          {items.map((it, i) => {
            const header = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            return (
              <div key={it.id}>
                {header && <div className="eyebrow px-3 pb-1 pt-2">{header}</div>}
                <button
                  type="button"
                  data-idx={i}
                  onMouseMove={() => setSel(i)}
                  onClick={it.run}
                  className={cx('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left', i === sel ? 'bg-surface-3' : '')}
                >
                  <span className="text-muted">{it.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] text-ink">{it.label}</span>
                    {it.sub && <span className="block truncate text-[12.5px] text-muted">{it.sub}</span>}
                  </span>
                  {it.right}
                  {i === sel && <CornerDownLeft size={14} className="text-muted" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
