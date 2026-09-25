import { X } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { langInfo } from '../domain/constants';
import type { JobStatus } from '../domain/types';
import { tx } from '../i18n';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ---------- buttons ----------

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  iconOnly?: boolean;
};

export function Button({ variant = 'secondary', size = 'md', icon, iconOnly, className, children, type = 'button', ...rest }: BtnProps) {
  return (
    <button
      type={type}
      className={cx('btn', `btn-${variant}`, size !== 'md' && `btn-${size}`, iconOnly && 'btn-icon', className)}
      {...rest}
    >
      {icon}
      {!iconOnly && children}
    </button>
  );
}

// ---------- form ----------

export function Field({ label, hint, children, className, htmlFor }: { label?: ReactNode; hint?: ReactNode; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={cx('min-w-0', className)}>
      {label && (
        <label className="label" htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {children}
      {hint && <div className="mt-1.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx('input', className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx('input', className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx('input', className)} {...rest}>
      {children}
    </select>
  );
}

/** Numeric input that keeps the raw text while typing (so “0.” and “1,2” work). */
export function NumberInput({
  value,
  onChange,
  className,
  placeholder,
  id,
  min,
  step,
  suffix,
  prefix,
  ...rest
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  className?: string;
  placeholder?: string;
  id?: string;
  min?: number;
  step?: number;
  suffix?: ReactNode;
  prefix?: ReactNode;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'prefix'>) {
  const [text, setText] = useState(value == null ? '' : String(value));
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      setText(value == null || Number.isNaN(value) ? '' : String(value));
      last.current = value;
    }
  }, [value]);
  const input = (
    <input
      id={id}
      className={cx('input tnum', prefix ? 'pl-12' : '', suffix ? 'pr-14' : '', className)}
      inputMode="decimal"
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        const cleaned = t.replace(/,/g, '').trim();
        const n = cleaned === '' ? undefined : Number(cleaned);
        const v = n != null && Number.isFinite(n) ? (min != null ? Math.max(min, n) : n) : undefined;
        last.current = v;
        onChange(v);
      }}
      step={step}
      {...rest}
    />
  );
  if (!suffix && !prefix) return input;
  return (
    <div className="relative">
      {prefix && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">{prefix}</span>}
      {input}
      {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">{suffix}</span>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, description, id }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; id?: string }) {
  const gen = useId();
  const tid = id ?? gen;
  return (
    <label htmlFor={tid} className="flex cursor-pointer items-start justify-between gap-4 py-1">
      <span className="min-w-0">
        <span className="block text-[14px] font-medium text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input id={tid} type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-6 w-10 rounded-[3px] border border-line-strong bg-surface-3 transition-colors peer-checked:border-ink peer-checked:bg-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink" />
        <span className="absolute left-[3px] top-[3px] h-[18px] w-[18px] rounded-[2px] bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.25)] transition-transform peer-checked:translate-x-4" />
      </span>
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div role="tablist" className={cx('inline-flex rounded-[3px] border border-line-strong bg-surface p-[2px]', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-[2px] font-medium transition-colors',
            size === 'sm' ? 'h-7 px-2.5 text-[12.5px]' : 'h-8 px-3.5 text-[13.5px]',
            o.value === value ? 'bg-ink text-surface' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------- display ----------

export const STATUS_COLOR: Record<JobStatus, string> = {
  quote: 'var(--st-quote)',
  active: 'var(--st-active)',
  delivered: 'var(--st-delivered)',
  invoiced: 'var(--st-invoiced)',
  paid: 'var(--st-paid)',
  cancelled: 'var(--st-cancelled)',
};

export const statusLabel = (s: JobStatus) =>
  ({
    quote: tx('詢價中', 'Quote'),
    active: tx('進行中', 'In progress'),
    delivered: tx('已交稿', 'Delivered'),
    invoiced: tx('已請款', 'Invoiced'),
    paid: tx('已收款', 'Paid'),
    cancelled: tx('已取消', 'Cancelled'),
  })[s];

export function StatusPill({ status, className }: { status: JobStatus; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-medium text-ink-2', className)}>
      <span className="h-2 w-2 shrink-0 rounded-[1px]" style={{ background: STATUS_COLOR[status] }} />
      {statusLabel(status)}
    </span>
  );
}

export function Pair({ source, target, className }: { source: string; target: string; className?: string }) {
  return (
    <span className={cx('pair', className)} title={`${langInfo(source).zh} → ${langInfo(target).zh}`}>
      {langInfo(source).short}→{langInfo(target).short}
    </span>
  );
}

export function Meter({ value, max = 1, tone = 'accent', className, label }: { value: number; max?: number; tone?: 'accent' | 'good' | 'warn' | 'bad' | 'series'; className?: string; label?: string }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  const color = tone === 'series' ? 'var(--series-1)' : `var(--${tone})`;
  const track = tone === 'accent' ? 'var(--surface-3)' : tone === 'series' ? 'var(--heat-1)' : `var(--${tone}-soft)`;
  return (
    <div
      className={cx('h-1 w-full overflow-hidden rounded-[1px]', className)}
      style={{ background: track }}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
    >
      <div className="h-full transition-[width] duration-700" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function Empty({ icon, title, body, action }: { icon?: ReactNode; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && <div className="mb-3 grid h-12 w-12 place-items-center rounded-[3px] border border-line-strong text-muted">{icon}</div>}
      <div className="font-semibold text-ink">{title}</div>
      {body && <div className="mt-1 max-w-sm text-sm text-muted">{body}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function SectionTitle({ children, action, eyebrow, className }: { children: ReactNode; action?: ReactNode; eyebrow?: ReactNode; className?: string }) {
  return (
    <div className={cx('mb-3 flex items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-0.5">{eyebrow}</div>}
        <h2 className="text-[15px] font-semibold text-ink">{children}</h2>
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, eyebrow, actions, children }: { title: ReactNode; eyebrow?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-6 pt-1">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 pb-4">
        <div className="min-w-0">
          {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
          <h1 className="font-display text-[32px] leading-[1.05] text-ink md:text-[44px]">{title}</h1>
          {children}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className="rule-deco" />
    </header>
  );
}

// ---------- overlays ----------

const useLockScroll = (on: boolean) => {
  useEffect(() => {
    if (!on) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [on]);
};

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  headerExtra,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  headerExtra?: ReactNode;
  labelledBy?: string;
}) {
  useLockScroll(open);
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const tid = useId();
  // focus once per opening; callers often pass a fresh onClose on every render
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    const t = setTimeout(() => {
      const el = ref.current?.querySelector<HTMLElement>('[data-autofocus]') ?? ref.current;
      el?.focus({ preventScroll: true });
    }, 30);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [open]);
  if (!open) return null;
  const w = { sm: 'sm:max-w-[440px]', md: 'sm:max-w-[600px]', lg: 'sm:max-w-[780px]', xl: 'sm:max-w-[1000px]' }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="presentation">
      <div className="absolute inset-0 animate-[fadeIn_.2s_ease]" style={{ background: 'var(--backdrop)' }} onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? (title ? tid : undefined)}
        tabIndex={-1}
        className={cx(
          'relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[14px] bg-surface outline-none sm:max-h-[88dvh] sm:rounded-[6px]',
          'animate-[sheetUp_.32s_cubic-bezier(.2,.8,.2,1)] sm:animate-[pop_.22s_ease]',
          w,
        )}
        style={{ boxShadow: 'var(--shadow-lg)' }}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong sm:hidden" />
        {(title || headerExtra) && (
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 pb-3 pt-3 sm:pt-4">
            <div className="min-w-0">
              {title && (
                <h2 id={tid} className="text-[17px] font-semibold text-ink">
                  {title}
                </h2>
              )}
              {subtitle && <div className="mt-0.5 text-[13px] text-muted">{subtitle}</div>}
            </div>
            <div className="flex items-center gap-1">
              {headerExtra}
              <Button variant="ghost" size="sm" iconOnly icon={<X size={18} />} onClick={onClose} aria-label={tx('關閉', 'Close')} />
            </div>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-line bg-surface px-5 py-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function Menu({
  trigger,
  items,
  align = 'right',
}: {
  trigger: (props: { onClick: () => void; 'aria-expanded': boolean }) => ReactNode;
  items: ({ label: ReactNode; icon?: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean } | 'divider')[];
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative inline-block">
      {trigger({ onClick: () => setOpen((o) => !o), 'aria-expanded': open })}
      {open && (
        <div
          role="menu"
          className={cx('absolute z-40 mt-1 min-w-[200px] overflow-hidden rounded-xl border border-line bg-surface py-1 animate-[pop_.15s_ease]', align === 'right' ? 'right-0' : 'left-0')}
          style={{ boxShadow: 'var(--shadow)' }}
        >
          {items.map((it, i) =>
            it === 'divider' ? (
              <div key={i} className="my-1 h-px bg-line" />
            ) : (
              <button
                key={i}
                role="menuitem"
                type="button"
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
                className={cx(
                  'flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[14px] transition-colors hover:bg-surface-2 disabled:opacity-40',
                  it.danger ? 'text-bad' : 'text-ink',
                )}
              >
                {it.icon && <span className="text-muted">{it.icon}</span>}
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line-strong bg-surface-2 px-1.5 py-px font-mono text-[11px] text-muted">{children}</kbd>;
}
