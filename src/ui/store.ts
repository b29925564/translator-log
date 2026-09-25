import { create } from 'zustand';
import type { Client, Job } from '../domain/types';

export interface Toast {
  id: number;
  text: string;
  tone?: 'good' | 'bad' | 'info';
  action?: { label: string; run: () => void };
}

export interface ConfirmOpts {
  title: string;
  body?: string;
  confirm?: string;
  cancel?: string;
  danger?: boolean;
}

interface UIState {
  route: string;
  navigate: (to: string, opts?: { replace?: boolean }) => void;

  quickAdd: { open: boolean; text: string };
  openQuickAdd: (text?: string) => void;
  closeQuickAdd: () => void;

  jobEditor: { open: boolean; job?: Job; isNew: boolean };
  openJobEditor: (job?: Job, isNew?: boolean) => void;
  closeJobEditor: () => void;

  clientEditor: { open: boolean; client?: Client; isNew: boolean; onSaved?: (c: Client) => void };
  openClientEditor: (client?: Client, isNew?: boolean, onSaved?: (c: Client) => void) => void;
  closeClientEditor: () => void;

  palette: boolean;
  setPalette: (open: boolean) => void;

  more: boolean;
  setMore: (open: boolean) => void;

  confirm: (ConfirmOpts & { resolve: (ok: boolean) => void }) | null;
  ask: (opts: ConfirmOpts) => Promise<boolean>;
  settleConfirm: (ok: boolean) => void;

  toasts: Toast[];
  toast: (text: string, opts?: Omit<Toast, 'id' | 'text'>) => void;
  dismissToast: (id: number) => void;

  stamp: { key: number; label: string; sub?: string } | null;
  fireStamp: (label: string, sub?: string) => void;
  clearStamp: () => void;
}

const readHash = () => {
  try {
    const h = window.location.hash.replace(/^#/, '');
    return h.startsWith('/') ? h : '/';
  } catch {
    return '/';
  }
};

let toastSeq = 1;

export const useUI = create<UIState>((set, get) => ({
  route: typeof window !== 'undefined' ? readHash() : '/',
  navigate: (to, opts) => {
    if (to === get().route) return;
    set({ route: to, more: false });
    try {
      if (opts?.replace) history.replaceState(null, '', '#' + to);
      else history.pushState(null, '', '#' + to);
    } catch {
      /* sandboxed frames may refuse history access; in-memory routing still works */
    }
    try {
      window.scrollTo({ top: 0 });
    } catch {
      /* ignore */
    }
  },

  quickAdd: { open: false, text: '' },
  openQuickAdd: (text = '') => set({ quickAdd: { open: true, text }, more: false, palette: false }),
  closeQuickAdd: () => set({ quickAdd: { open: false, text: '' } }),

  jobEditor: { open: false, isNew: false },
  openJobEditor: (job, isNew = !job) => set({ jobEditor: { open: true, job, isNew }, quickAdd: { open: false, text: '' }, palette: false }),
  closeJobEditor: () => set({ jobEditor: { open: false, isNew: false } }),

  clientEditor: { open: false, isNew: false },
  openClientEditor: (client, isNew = !client, onSaved) => set({ clientEditor: { open: true, client, isNew, onSaved } }),
  closeClientEditor: () => set({ clientEditor: { open: false, isNew: false } }),

  palette: false,
  setPalette: (palette) => set({ palette }),

  more: false,
  setMore: (more) => set({ more }),

  confirm: null,
  ask: (opts) => new Promise<boolean>((resolve) => set({ confirm: { ...opts, resolve } })),
  settleConfirm: (ok) => {
    const c = get().confirm;
    set({ confirm: null });
    c?.resolve(ok);
  },

  toasts: [],
  toast: (text, opts) => {
    const id = toastSeq++;
    set({ toasts: [...get().toasts.slice(-2), { id, text, ...opts }] });
    setTimeout(() => get().dismissToast(id), opts?.action ? 6000 : 3200);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

  stamp: null,
  fireStamp: (label, sub) => {
    set({ stamp: { key: Date.now(), label, sub } });
    try {
      navigator.vibrate?.(18);
    } catch {
      /* ignore */
    }
  },
  clearStamp: () => set({ stamp: null }),
}));

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    const r = readHash();
    if (r !== useUI.getState().route) useUI.setState({ route: r });
  });
  window.addEventListener('popstate', () => {
    const r = readHash();
    if (r !== useUI.getState().route) useUI.setState({ route: r });
  });
}

export const matchRoute = (route: string, pattern: string): Record<string, string> | null => {
  const a = route.split('?')[0].split('/').filter(Boolean);
  const b = pattern.split('/').filter(Boolean);
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < b.length; i++) {
    if (b[i].startsWith(':')) params[b[i].slice(1)] = decodeURIComponent(a[i]);
    else if (b[i] !== a[i]) return null;
  }
  return params;
};
