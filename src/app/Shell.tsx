import {
  BarChart3,
  Building2,
  Calculator,
  Command,
  FileText,
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

export function Sidebar() {
  const { route, navigate, openQuickAdd, setPalette } = useUI();
  const { settings, jobs, today } = useData();
  const overdue = jobs.filter((j) => j.status === 'active' && j.dueAt && j.dueAt.slice(0, 10) < today).length;
  return (
    <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-[232px] flex-col border-r border-line bg-surface lg:flex">
      <div className="px-5 pb-4 pt-5">
        <button type="button" onClick={() => navigate('/')} aria-label={tx('回到總覽', 'Go to overview')}>
          <Wordmark />
        </button>
      </div>
      <div className="px-3">
        <button type="button" className="btn btn-primary w-full justify-between" onClick={() => openQuickAdd()}>
          <span className="inline-flex items-center gap-2">
            <Plus size={17} strokeWidth={2.4} />
            {tx('新增案件', 'New job')}
          </span>
          <span className="rounded bg-white/20 px-1.5 font-mono text-[11px]">N</span>
        </button>
        <button
          type="button"
          onClick={() => setPalette(true)}
          className="mt-2 flex h-9 w-full items-center gap-2 rounded-[10px] border border-line bg-surface-2 px-3 text-[13px] text-muted transition-colors hover:text-ink"
        >
          <Command size={14} />
          <span className="flex-1 text-left">{tx('搜尋與指令', 'Search & commands')}</span>
          <Kbd>⌘K</Kbd>
        </button>
      </div>
      <nav className="mt-4 flex-1 overflow-y-auto px-3 pb-4" aria-label={tx('主選單', 'Main')}>
        {NAV.filter((n) => !n.twOnly || settings.tax.region === 'TW').map((n) => {
          const active = isActive(route, n.route);
          const Icon = n.icon;
          return (
            <button
              key={n.route}
              type="button"
              onClick={() => navigate(n.route)}
              aria-current={active ? 'page' : undefined}
              className={cx(
                'group relative mb-0.5 flex h-10 w-full items-center gap-3 rounded-[10px] px-3 text-[14.5px] transition-colors',
                active ? 'bg-accent-soft font-semibold text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
              )}
            >
              <Icon size={18} strokeWidth={active ? 2.3 : 1.9} className={active ? 'text-accent' : 'text-muted group-hover:text-ink-2'} />
              <span className="flex-1 text-left">{n.label()}</span>
              {n.route === '/jobs' && overdue > 0 && <span className="rounded-full bg-bad px-1.5 text-[11px] font-semibold text-white tnum">{overdue}</span>}
            </button>
          );
        })}
      </nav>
      <div className="flex flex-col gap-2 border-t border-line p-3">
        <SyncBadge />
        <LangToggle className="self-start ml-3" />
      </div>
    </aside>
  );
}

const TABS = ['/', '/jobs', '+', '/insights', 'more'] as const;

export function TabBar() {
  const { route, navigate, openQuickAdd, setMore } = useUI();
  return (
    <nav
      className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-md lg:hidden"
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
                  className="grid h-12 w-12 place-items-center rounded-2xl bg-accent text-accent-ink transition-transform active:scale-95"
                  style={{ boxShadow: '0 6px 18px color-mix(in srgb, var(--accent) 40%, transparent)' }}
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
              className={cx('flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium', active ? 'text-accent' : 'text-muted')}
            >
              <Icon size={21} strokeWidth={active ? 2.3 : 1.9} />
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
    <div role="group" aria-label={tx('介面語言', 'Language')} className={cx('inline-flex rounded-[9px] border border-line bg-surface-2 p-0.5 text-[12.5px]', className)}>
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
          className={cx('h-7 rounded-[7px] px-2.5 font-medium transition-colors', lang === v ? 'bg-surface text-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)]' : 'text-muted hover:text-ink')}
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
      <div className="grid grid-cols-3 gap-2 pb-2">
        {items.map((n) => {
          const Icon = n.icon;
          return (
            <button
              key={n.route}
              type="button"
              onClick={() => navigate(n.route)}
              className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface-2 px-2 py-4 text-[13px] font-medium text-ink transition-colors active:bg-surface-3"
            >
              <Icon size={22} className="text-accent" />
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
      <div className="flex items-center gap-2 rounded-full border border-line bg-ink py-1.5 pl-3 pr-1.5 text-surface" style={{ boxShadow: 'var(--shadow-lg)' }}>
        <span className="h-2 w-2 rounded-full bg-seal animate-[pulseDot_1.4s_ease_infinite]" />
        <button type="button" className="max-w-[160px] truncate text-left text-[13px] font-medium sm:max-w-[260px]" onClick={() => job && navigate('/jobs/' + job.id)}>
          {job?.title || tx('計時中', 'Timing')}
        </button>
        <span className="font-mono text-[13px] tnum">{fmtDuration(Date.now() - running.start)}</span>
        <button
          type="button"
          onClick={() => stopTimer()}
          className="grid h-8 w-8 place-items-center rounded-full bg-surface text-ink"
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
          className="pointer-events-auto flex max-w-md items-center gap-3 rounded-xl bg-ink px-4 py-2.5 text-[14px] text-surface animate-[pop_.2s_ease]"
          style={{ boxShadow: 'var(--shadow-lg)' }}
        >
          <span className="min-w-0 flex-1">{t.text}</span>
          {t.action && (
            <button
              type="button"
              className="shrink-0 font-semibold text-accent-soft underline-offset-2 hover:underline"
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

/** The vermilion “paid” seal that thumps onto the screen. */
export function StampLayer() {
  const { stamp, clearStamp } = useUI();
  useEffect(() => {
    if (!stamp) return;
    const t = setTimeout(clearStamp, 2000);
    return () => clearTimeout(t);
  }, [stamp, clearStamp]);
  if (!stamp) return null;
  return (
    <div key={stamp.key} aria-live="polite" className="no-print">
      <div className="stamp-ring" />
      <div className="stamp">
        <svg width="250" height="150" viewBox="0 0 250 150" role="img" aria-label={stamp.label}>
          <defs>
            <filter id="ink-rough">
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="n" />
              <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 1.25" result="m" />
              <feComposite in="SourceGraphic" in2="m" operator="in" />
            </filter>
          </defs>
          <g filter="url(#ink-rough)" fill="none" stroke="var(--seal)">
            <rect x="8" y="8" width="234" height="134" rx="16" strokeWidth="7" />
            <rect x="20" y="20" width="210" height="110" rx="9" strokeWidth="2" />
            <text x="125" y="78" textAnchor="middle" fill="var(--seal)" stroke="none" fontFamily="'LXGW WenKai TC', 'PingFang TC', serif" fontWeight="700" fontSize="46" letterSpacing="6">
              {stamp.label}
            </text>
            {stamp.sub && (
              <text x="125" y="112" textAnchor="middle" fill="var(--seal)" stroke="none" fontFamily="'IBM Plex Mono', monospace" fontWeight="500" fontSize="15" letterSpacing="3">
                {stamp.sub}
              </text>
            )}
          </g>
        </svg>
      </div>
    </div>
  );
}

export function PageFrame({ children }: { children: ReactNode }) {
  return <div className="page-enter mx-auto w-full max-w-[1180px] px-4 pb-32 pt-4 sm:px-6 lg:px-8 lg:pb-16 lg:pt-8 print:max-w-none print:p-0">{children}</div>;
}
