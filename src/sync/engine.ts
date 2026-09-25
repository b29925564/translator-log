// Device sync: local-first, end-to-end encrypted, stored in the user's own
// private GitHub Gist. Every device merges last-write-wins and converges.

import { create } from 'zustand';
import { delLocal, getLocal, setLocal } from '../db/db';
import { applyRecords, changeBus, snapshot, updateSettings } from '../db/repo';
import { mergeSnapshots, emptySnapshot, type Snapshot } from '../domain/merge';
import { decryptJSON, deriveKey, encryptJSON, fromB64Url, isEnvelope, KDF_ITERATIONS, newSalt, toB64Url, WrongPassphraseError, type Envelope } from './crypto';
import { createGist, findSyncGist, GistError, readGist, whoAmI, writeGist } from './gist';

export interface SyncConfig {
  provider: 'gist';
  token: string;
  gistId: string;
  login?: string;
  salt: string;
  iter: number;
  key: CryptoKey;
  connectedAt: number;
}

type Status = 'off' | 'idle' | 'syncing' | 'error';

interface SyncState {
  status: Status;
  lastSyncAt?: number;
  error?: string;
  login?: string;
  lastStats?: { pulled: number; pushed: number };
}

export const useSync = create<SyncState>(() => ({ status: 'off' }));

const SYNC_KEY = 'sync';
let config: SyncConfig | undefined;
let inflight: Promise<void> | null = null;
let queued = false;

export const syncAvailable = () => typeof fetch !== 'undefined' && typeof crypto !== 'undefined' && !!crypto.subtle && !__DEMO_BUILD__;

const loadConfig = async () => {
  config = await getLocal<SyncConfig>(SYNC_KEY);
  const last = await getLocal<number>('sync:last');
  useSync.setState({ status: config ? 'idle' : 'off', login: config?.login, lastSyncAt: last });
  return config;
};

const errorText = (e: unknown): string => {
  if (e instanceof WrongPassphraseError) return 'wrong-passphrase';
  if (e instanceof GistError) {
    if (e.status === 401) return 'bad-token';
    if (e.status === 404) return 'gist-missing';
    if (e.status === 403) return 'rate-limited';
    return `github-${e.status}`;
  }
  if (e instanceof TypeError) return 'offline';
  return String((e as Error)?.message ?? e);
};

const readRemote = async (cfg: SyncConfig): Promise<Snapshot> => {
  const { content } = await readGist(cfg.token, cfg.gistId);
  if (!content) return emptySnapshot();
  const env = JSON.parse(content);
  if (!isEnvelope(env)) return emptySnapshot();
  return decryptJSON<Snapshot>(env, cfg.key);
};

const doSync = async () => {
  const cfg = config;
  if (!cfg) return;
  useSync.setState({ status: 'syncing', error: undefined });
  try {
    const remote = await readRemote(cfg);
    const local = await snapshot();
    const r = mergeSnapshots(local, remote);
    await applyRecords(r.toLocal);
    if (r.remoteStale) {
      const env = await encryptJSON(r.merged, cfg.key, cfg.salt, cfg.iter);
      await writeGist(cfg.token, cfg.gistId, JSON.stringify(env));
    }
    const at = Date.now();
    await setLocal('sync:last', at);
    useSync.setState({ status: 'idle', lastSyncAt: at, lastStats: r.stats });
  } catch (e) {
    useSync.setState({ status: 'error', error: errorText(e) });
  }
};

export const syncNow = async (): Promise<void> => {
  if (!config) await loadConfig();
  if (!config) return;
  if (inflight) {
    queued = true;
    return inflight;
  }
  inflight = doSync().finally(async () => {
    inflight = null;
    if (queued) {
      queued = false;
      await syncNow();
    }
  });
  return inflight;
};

/** Connects this device. Reuses an existing sync gist when one exists. */
export const connect = async (token: string, passphrase: string): Promise<{ created: boolean }> => {
  const me = await whoAmI(token);
  const existing = await findSyncGist(token);
  let salt: string;
  let iter = KDF_ITERATIONS;
  let gistId: string;
  let key: CryptoKey;
  let created = false;
  if (existing) {
    const { content } = await readGist(token, existing.id);
    const env = content ? (JSON.parse(content) as Envelope) : undefined;
    salt = env?.kdf.salt ?? newSalt();
    iter = env?.kdf.iter ?? KDF_ITERATIONS;
    key = await deriveKey(passphrase, salt, iter);
    if (env) await decryptJSON(env, key); // throws WrongPassphraseError
    gistId = existing.id;
  } else {
    salt = newSalt();
    key = await deriveKey(passphrase, salt, iter);
    const env = await encryptJSON(await snapshot(), key, salt, iter);
    const g = await createGist(token, JSON.stringify(env));
    gistId = g.id;
    created = true;
  }
  config = { provider: 'gist', token, gistId, login: me.login, salt, iter, key, connectedAt: Date.now() };
  await setLocal(SYNC_KEY, config);
  useSync.setState({ status: 'idle', login: me.login });
  await syncNow();
  return { created };
};

export const disconnect = async () => {
  config = undefined;
  await delLocal(SYNC_KEY);
  await delLocal('sync:last');
  useSync.setState({ status: 'off', login: undefined, lastSyncAt: undefined, error: undefined });
};

// ---------- pairing ----------

/** A link another device can open; useless without the passphrase. */
export const pairingLink = async (): Promise<string | undefined> => {
  if (!config) await loadConfig();
  if (!config) return undefined;
  const env = await encryptJSON({ t: config.token, g: config.gistId, l: config.login }, config.key, config.salt, config.iter);
  const payload = toB64Url(new TextEncoder().encode(JSON.stringify({ s: env.kdf.salt, i: env.kdf.iter, v: env.iv, c: env.ct, z: env.gz ? 1 : 0 })));
  const base = `${location.origin}${location.pathname}`;
  return `${base}#/pair/${payload}`;
};

export const acceptPairing = async (payload: string, passphrase: string) => {
  const p = JSON.parse(new TextDecoder().decode(fromB64Url(payload))) as { s: string; i: number; v: string; c: string; z: number };
  const env: Envelope = { app: 'wordtrail', v: 1, kdf: { name: 'PBKDF2', hash: 'SHA-256', iter: p.i, salt: p.s }, iv: p.v, gz: !!p.z, ct: p.c, at: Date.now() };
  const key = await deriveKey(passphrase, p.s, p.i);
  const creds = await decryptJSON<{ t: string; g: string; l?: string }>(env, key);
  config = { provider: 'gist', token: creds.t, gistId: creds.g, login: creds.l, salt: p.s, iter: p.i, key, connectedAt: Date.now() };
  await setLocal(SYNC_KEY, config);
  await updateSettings({ onboarded: true });
  useSync.setState({ status: 'idle', login: creds.l });
  await syncNow();
};

// ---------- auto sync ----------

let started = false;

export const startAutoSync = async () => {
  if (started || !syncAvailable()) return;
  started = true;
  await loadConfig();
  let timer: ReturnType<typeof setTimeout> | undefined;
  changeBus.addEventListener('change', () => {
    if (!config) return;
    clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), 3000);
  });
  const maybe = () => {
    if (!config || document.visibilityState !== 'visible') return;
    const last = useSync.getState().lastSyncAt ?? 0;
    if (Date.now() - last > 20_000) void syncNow();
  };
  document.addEventListener('visibilitychange', maybe);
  window.addEventListener('focus', maybe);
  window.addEventListener('online', () => void syncNow());
  setInterval(maybe, 120_000);
  if (config) void syncNow();
};
