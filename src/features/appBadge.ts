// Home-screen icon badge: how many active jobs are due today or already late.
// Per device, so the switch lives in localStorage rather than synced settings.

import { useEffect } from 'react';
import type { Job } from '../domain/types';

const KEY = 'witimemo.badge';
const EVENT = 'witimemo:badge';

export const badgeEnabled = () => {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
};

export const setBadgeEnabled = (on: boolean) => {
  try {
    if (on) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, 'off');
  } catch {
    /* private mode: the badge simply follows the default */
  }
  window.dispatchEvent(new Event(EVENT));
};

/** Active, undelivered jobs whose due date is today or earlier. */
export const dueCount = (jobs: Job[], today: string) =>
  jobs.filter((j) => !j.deletedAt && j.status === 'active' && !j.deliveredAt && j.dueAt && j.dueAt.slice(0, 10) <= today).length;

const apply = (n: number) => {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try {
    const p = n > 0 && badgeEnabled() ? nav.setAppBadge?.(n) : nav.clearAppBadge?.();
    p?.catch(() => {});
  } catch {
    /* unsupported or not installed */
  }
};

export function useAppBadge(jobs: Job[], today: string) {
  useEffect(() => {
    const run = () => document.visibilityState !== 'hidden' && apply(dueCount(jobs, today));
    run();
    document.addEventListener('visibilitychange', run);
    window.addEventListener(EVENT, run);
    return () => {
      document.removeEventListener('visibilitychange', run);
      window.removeEventListener(EVENT, run);
    };
  }, [jobs, today]);
}
