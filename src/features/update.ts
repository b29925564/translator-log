// Tells whether the running app is the latest build. The server publishes
// version.json with every deploy (never cached by the service worker), so
// comparing it with the build baked into this bundle shows whether a newer
// version is waiting. Updating installs the new service worker and reloads.

import { create } from 'zustand';
import { tx } from '../i18n';
import { useUI } from '../ui/store';

export type UpdateState = 'checking' | 'latest' | 'available' | 'updating' | 'offline' | 'dev';

interface UpdateStore {
  state: UpdateState;
  /** Build time of the newer version, when one is available. */
  latestTime?: string;
  checkedAt?: number;
}

export const useUpdate = create<UpdateStore>(() => ({
  state: import.meta.env.PROD && !__DEMO_BUILD__ ? 'checking' : 'dev',
}));

let registration: ServiceWorkerRegistration | undefined;
let announced = '';

export const setRegistration = (r: ServiceWorkerRegistration | undefined) => {
  registration = r;
};

export const checkForUpdate = async () => {
  if (useUpdate.getState().state === 'dev' || useUpdate.getState().state === 'updating') return;
  useUpdate.setState({ state: 'checking' });
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const v = (await res.json()) as { build?: string; time?: string };
    const newer = !!v.build && v.build !== __BUILD_ID__ && (!v.time || v.time > __BUILD_TIME__);
    useUpdate.setState({ state: newer ? 'available' : 'latest', latestTime: newer ? v.time : undefined, checkedAt: Date.now() });
    if (newer && v.build && announced !== v.build) {
      announced = v.build;
      useUI.getState().toast(tx('有新版本可以更新', 'A new version is available'), { tone: 'info', action: { label: tx('更新', 'Update'), run: () => void applyUpdate() } });
    }
    // let the service worker start fetching the new version right away
    if (newer) void registration?.update().catch(() => {});
  } catch {
    useUpdate.setState({ state: 'offline', checkedAt: Date.now() });
  }
};

/** Installs the newer version and reloads into it. */
export const applyUpdate = async () => {
  useUpdate.setState({ state: 'updating' });
  const reload = () => window.location.reload();
  const sw = navigator.serviceWorker;
  if (!sw || !registration) return reload();
  // the new worker takes over by itself (autoUpdate); reload once it does,
  // or after a while in case it was already in control
  const timer = setTimeout(reload, 8000);
  sw.addEventListener('controllerchange', () => {
    clearTimeout(timer);
    reload();
  }, { once: true });
  try {
    await registration.update();
    registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
    if (!registration.installing && !registration.waiting) {
      clearTimeout(timer);
      reload();
    }
  } catch {
    clearTimeout(timer);
    reload();
  }
};

export const startUpdateChecks = () => {
  if (useUpdate.getState().state === 'dev') return;
  setTimeout(() => void checkForUpdate(), 3000);
  document.addEventListener('visibilitychange', () => {
    const last = useUpdate.getState().checkedAt ?? 0;
    if (document.visibilityState === 'visible' && Date.now() - last > 60_000) void checkForUpdate();
  });
  setInterval(() => void checkForUpdate(), 30 * 60_000);
};
