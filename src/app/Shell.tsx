import {
  BarChart3,
  Building2,
  Calculator,
  Command,
  FileText,
  FolderKanban,
  IdCard,
  Landmark,
  LayoutDashboard,
  MoreHorizontal,
  Plus,
  Settings,
  Sparkles,
  Square,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useData } from '../db/data';
import { stopTimer, updateSettings } from '../db/repo';
import { fmtDuration } from '../domain/dates';
import { getLang, tx } from '../i18n';
import { cx, Kbd, Sheet } from '../ui/kit';
import { useUI } from '../ui/store';
import { SyncBadge } from '../sync/SyncBadge';
import { Wordmark } from './Logo';

export interface NavItem {
  route: string;
  icon: LucideIcon;
  label: () => string;
  twOnly?: boolean;
}

export const NAV: NavItem[] = [
  { route: '/', icon: LayoutDashboard, label: () => tx('總覽', 'Overview') },
  { route: '/projects', icon: FolderKanban, label: () => tx('專案', 'Projects') },
  { route: '/jobs', icon: FileText, label: () => tx('案件', 'Jobs') },
  { route: '/clients', icon: Building2, label: () => tx('客戶', 'Clients') },
  { route: '/money', icon: Wallet, label: () => tx('收款', 'Payments') },
  { route: '/insights', icon: BarChart3, label: () => tx('洞察', 'Insights') },
  { route: '/resume', icon: IdCard, label: () => tx('履歷', 'Résumé') },
  { route: '/wrapped', icon: Sparkles, label: () => tx('年度回顧', 'Year in review') },
  { route: '/tools', icon: Calculator, label: () => tx('工具', 'Tools') },
  { route: '/tax', icon: Landmark, label: () => tx('報稅', 'Taxes'), twOnly: true },
  { route: '/settings', icon: Settings, label: () => tx('設定', 'Settings') },
];

const isActive = (route: string, item: string) => (item === '/' ? route === '/' : route === item || route.startsWith(item + '/'));

const NAV_GROUPS: { label: () => string; routes: string[] }[] = [
  { label: () => tx('工作', 'Work'), routes: ['/', '/projects', '/jobs', '/clients', '/money'] },
  { label: () => tx('成果', 'Record'), routes: ['/insights', '/resume', '/wrapped'] },
  { label: () => tx('工具', 'Utilities'), routes: ['/tools', '/tax', '/settings'] },
];

export function Sidebar() {
  const { route, navigate, openQuickAdd, setPalette } = useUI();
  const { settings, jobs, today } = useData();
  const overdue = jobs.filter((j) => j.status === 'active' && j.dueAt && j.dueAt.slice(0, 10) < today).length;
  return (
    <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-[232px] flex-col border-r border-line bg-surface lg:flex">
      <div className="px-5 pb-5 pt-6">
        <button type="button" onClick={() => navigate('/')} aria-label={tx('回到總覽', 'Go to overview')}>
          <Wordmark />
        </button>
      </div>
      <div className="px-4">
        <button type="button" className="btn btn-primary w-full justify-between" onClick={() => openQuickAdd()}>
          <span className="inline-flex items-center gap-2">
            <Plus size={16} strokeWidth={2.4} />
            {tx('新增案件', 'New job')}
          </span>
          <span className="rounded-[2px] border border-accent-ink/25 px-1.5 font-mono text-[10.5px] leading-[18px]">N</span>
        </button>
        <button
          type="button"
          onClick={() => setPalette(true)}
          className="mt-2 flex h-9 w-full items-center gap-2 rounded-[3px] border border-line-strong px-3 text-[13px] text-muted transition-colors hover:border-ink hover:text-ink"
        >
          <Command size={14} />
          <span className="flex-1 text-left">{tx('搜尋', 'Search')}</span>
          <Kbd>⌘K</Kbd>
        </button>
      </div>
      <nav className="mt-5 flex-1 overflow-y-auto px-4 pb-4" aria-label={tx('主選單', 'Main')}>
        {NAV_GROUPS.map((g) => (
          <div key={g.routes[0]} className="mb-4">
            <div className="eyebrow mb-1.5 px-2 !text-[9.5px]">{g.label()}</div>
            {NAV.filter((n) => g.routes.includes(n.route) && (!n.twOnly || settings.tax.region === 'TW')).map((n) => {
              const active = isActive(route, n.route);
              const Icon = n.icon;
              return (
                <button
                  key={n.route}
                  type="button"
                  onClick={() => navigate(n.route)}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'group relative flex h-9 w-full items-center gap-3 rounded-[2px] px-2 text-[14px] transition-colors',
                    active ? 'bg-surface-3 font-semibold text-ink' : 'text-ink-2 hover:text-ink',
                  )}
                >
                  {active && <span className="absolute inset-y-1.5 left-0 w-[2px] bg-gold" />}
                  <Icon size={16} strokeWidth={active ? 2.1 : 1.7} className={active ? 'text-ink' : 'text-muted group-hover:text-ink'} />
                  <span className="flex-1 text-left">{n.label()}</span>
                  {n.route === '/jobs' && overdue > 0 && <span className="rounded-[2px] bg-bad px-1.5 text-[11px] font-semibold text-white tnum">{overdue}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="flex flex-col gap-2 border-t border-line p-3">
        <SyncBadge />
        <LangToggle className="ml-3 self-start" />
      </div>
    </aside>
  );
}

const TABS = ['/', '/jobs', '+', '/insights', 'more'] as const;

export function TabBar() {
  const { route, navigate, openQuickAdd, setMore } = useUI();
  return (
    <nav
      className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label={tx('主選單', 'Main')}
    >
      <div className="mx-auto grid h-[62px] max-w-lg grid-cols-5 items-center">
        {TABS.map((t) => {
          if (t === '+')
            return (
              <div key={t} className="flex justify-center">
                <button
                  type="button"
                  onClick={() => openQuickAdd()}
                  aria-label={tx('新增案件', 'New job')}
                  className="grid h-11 w-11 place-items-center rounded-[4px] bg-ink text-surface transition-transform active:scale-95"
                  style={{ boxShadow: 'inset 0 -2px 0 var(--gold)' }}
                >
                  <Plus size={24} strokeWidth={2.5} />
                </button>
              </div>
            );
          const item = t === 'more' ? null : NAV.find((n) => n.route === t)!;
          const active = item ? isActive(route, item.route) : !['/', '/jobs', '/insights'].some((r) => isActive(route, r));
          const Icon = item ? item.icon : MoreHorizontal;
          return (
            <button
              key={t}
              type="button"
              onClick={() => (item ? navigate(item.route) : setMore(true))}
              aria-current={active ? 'page' : undefined}
              className={cx('relative flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium', active ? 'text-ink' : 'text-muted')}
            >
              {active && <span className="absolute left-1/2 top-0 h-[2px] w-6 -translate-x-1/2 bg-gold" />}
              <Icon size={20} strokeWidth={active ? 2.1 : 1.7} />
              {item ? item.label() : tx('更多', 'More')}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/** Quick 中文 / English switch, always one tap away. */
export function LangToggle({ className }: { className?: string }) {
  const lang = getLang();
  return (
    <div role="group" aria-label={tx('介面語言', 'Language')} className={cx('inline-flex rounded-[3px] border border-line-strong p-0.5 text-[12px]', className)}>
      {(
        [
          ['zh-TW', '中文'],
          ['en', 'EN'],
        ] as const
      ).map(([v, l]) => (
        <button
          key={v}
          type="button"
          aria-pressed={lang === v}
          onClick={() => lang !== v && void updateSettings({ lang: v })}
          className={cx('h-7 rounded-[2px] px-2.5 font-medium transition-colors', lang === v ? 'bg-ink text-surface' : 'text-muted hover:text-ink')}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export function MoreSheet() {
  const { more, setMore, navigate } = useUI();
  const { settings } = useData();
  const items = NAV.filter((n) => !['/', '/jobs', '/insights'].includes(n.route) && (!n.twOnly || settings.tax.region === 'TW'));
  return (
    <Sheet open={more} onClose={() => setMore(false)} title={tx('更多', 'More')} size="sm">
      <div className="grid grid-cols-2 gap-2 pb-2 min-[380px]:grid-cols-3">
        {items.map((n) => {
          const Icon = n.icon;
          return (
            <button
              key={n.route}
              type="button"
              onClick={() => navigate(n.route)}
              className="flex flex-col items-start gap-3 rounded-[3px] border border-line px-3 py-3.5 text-[13px] font-medium text-ink transition-colors active:bg-surface-3"
            >
              <Icon size={19} strokeWidth={1.8} className="text-ink" />
              {n.label()}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <SyncBadge />
        <LangToggle className="shrink-0" />
      </div>
    </Sheet>
  );
}

export function TimerPill() {
  const { running, jobMap } = useData();
  const navigate = useUI((s) => s.navigate);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [running]);
  if (!running) return null;
  const job = jobMap.get(running.jobId);
  return (
    <div className="no-print fixed bottom-[78px] left-1/2 z-40 -translate-x-1/2 lg:bottom-5 lg:left-[calc(50%+116px)]" style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="flex items-center gap-2.5 rounded-[4px] bg-ink py-1.5 pl-3 pr-1.5 text-surface" style={{ boxShadow: 'var(--shadow-lg)' }}>
        <span className="h-2 w-2 rounded-[1px] bg-gold animate-[pulseDot_1.4s_ease_infinite]" />
        <button type="button" className="max-w-[160px] truncate text-left text-[13px] font-medium sm:max-w-[260px]" onClick={() => job && navigate('/jobs/' + job.id)}>
          {job?.title || tx('計時中', 'Timing')}
        </button>
        <span className="font-mono text-[13px] tnum">{fmtDuration(Date.now() - running.start)}</span>
        <button
          type="button"
          onClick={() => stopTimer()}
          className="grid h-8 w-8 place-items-center rounded-[3px] bg-surface text-ink"
          aria-label={tx('停止計時', 'Stop timer')}
        >
          <Square size={13} fill="currentColor" />
        </button>
      </div>
    </div>
  );
}

export function Toasts() {
  const { toasts, dismissToast } = useUI();
  return (
    <div className="no-print pointer-events-none fixed inset-x-0 top-3 z-[80] flex flex-col items-center gap-2 px-4" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }} aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex max-w-md items-center gap-3 rounded-[4px] bg-ink px-4 py-2.5 text-[14px] text-surface animate-[pop_.2s_ease]"
          style={{ boxShadow: 'var(--shadow-lg)' }}
        >
          <span className="min-w-0 flex-1">{t.text}</span>
          {t.action && (
            <button
              type="button"
              className="shrink-0 font-semibold text-gold underline-offset-2 hover:underline"
              onClick={() => {
                t.action!.run();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function ConfirmDialog() {
  const { confirm, settleConfirm } = useUI();
  return (
    <Sheet
      open={!!confirm}
      onClose={() => settleConfirm(false)}
      title={confirm?.title}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={() => settleConfirm(false)}>
            {confirm?.cancel ?? tx('取消', 'Cancel')}
          </button>
          <button type="button" data-autofocus className={cx('btn', confirm?.danger ? 'btn-danger' : 'btn-primary')} onClick={() => settleConfirm(true)}>
            {confirm?.confirm ?? tx('確定', 'OK')}
          </button>
        </>
      }
    >
      {confirm?.body && <p className="text-[14.5px] leading-relaxed text-ink-2">{confirm.body}</p>}
    </Sheet>
  );
}

/** The brass “paid” medallion: rings, a sunburst of ticks, a drawn check. */
export function StampLayer() {
  const { stamp, clearStamp } = useUI();
  useEffect(() => {
    if (!stamp) return;
    const t = setTimeout(clearStamp, 2100);
    return () => clearTimeout(t);
  }, [stamp, clearStamp]);
  if (!stamp) return null;
  const ticks = Array.from({ length: 60 }, (_, i) => {
    const a = (i / 60) * Math.PI * 2;
    const long = i % 5 === 0;
    return <line key={i} x1={100 + Math.cos(a) * (long ? 70 : 74)} y1={100 + Math.sin(a) * (long ? 70 : 74)} x2={100 + Math.cos(a) * 79} y2={100 + Math.sin(a) * 79} stroke="var(--gold)" strokeWidth={long ? 1.6 : 0.8} />;
  });
  return (
    <div key={stamp.key} aria-live="polite" className="no-print">
      <div className="stamp-ring" />
      <div className="stamp">
        <div className="on-ink grid place-items-center rounded-full p-3" style={{ background: '#0b0b0c', boxShadow: '0 30px 80px rgb(0 0 0 / 0.45)' }}>
          <svg width="200" height="200" viewBox="0 0 200 200" role="img" aria-label={stamp.label}>
            <circle cx="100" cy="100" r="96" fill="none" stroke="var(--gold)" strokeWidth="1.5" />
            <circle cx="100" cy="100" r="90" fill="none" stroke="var(--gold)" strokeWidth="0.6" />
            {ticks}
            <circle cx="100" cy="100" r="62" fill="none" stroke="var(--gold)" strokeWidth="0.8" />
            <path d="M72 101 L92 120 L130 80" fill="none" stroke="var(--gold)" strokeWidth="6" strokeLinecap="square" strokeLinejoin="miter" style={{ strokeDasharray: 90, ['--len' as string]: 90, animation: 'drawLine .5s ease .25s both' }} />
            <text x="100" y="152" textAnchor="middle" fill="var(--gold)" style={{ fontFamily: "'Archivo', 'Noto Sans TC', sans-serif", fontStretch: '125%', fontWeight: 700, fontSize: 12, letterSpacing: '0.3em' }}>
              {stamp.label}
            </text>
            {stamp.sub && (
              <text x="100" y="56" textAnchor="middle" fill="var(--gold)" style={{ fontFamily: "'Geist Mono', monospace", fontSize: 9, letterSpacing: '0.24em' }}>
                {stamp.sub}
              </text>
            )}
          </svg>
        </div>
      </div>
    </div>
  );
}

export function PageFrame({ children }: { children: ReactNode }) {
  return <div className="page-enter mx-auto w-full max-w-[1180px] px-4 pb-32 pt-4 sm:px-6 lg:px-8 lg:pb-16 lg:pt-8 print:max-w-none print:p-0">{children}</div>;
}
