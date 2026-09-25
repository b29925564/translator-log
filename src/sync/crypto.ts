// End-to-end encryption for sync: PBKDF2-SHA256 → AES-GCM-256, gzip first.
// Only ciphertext ever leaves the device.

export const KDF_ITERATIONS = 600_000;

export interface Envelope {
  /** Format marker from before the rename; kept so older files still open. */
  app: 'wordtrail';
  v: 1;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iter: number; salt: string };
  iv: string;
  gz: boolean;
  ct: string;
  at: number;
}

const subtle = () => globalThis.crypto.subtle;

export const toB64 = (bytes: Uint8Array): string => {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
};

export const fromB64 = (b64: string): Uint8Array => {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
};

export const toB64Url = (bytes: Uint8Array) => toB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const fromB64Url = (s: string) => fromB64(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));

export const randomBytes = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));

export const newSalt = () => toB64(randomBytes(16));

export const deriveKey = async (passphrase: string, saltB64: string, iter = KDF_ITERATIONS): Promise<CryptoKey> => {
  const base = await subtle().importKey('raw', new TextEncoder().encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(saltB64) as BufferSource, iterations: iter },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
};

const pipe = async (data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> => {
  const out = new Blob([data as BlobPart]).stream().pipeThrough(stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(out).arrayBuffer());
};

const canGzip = () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

export const encryptJSON = async (value: unknown, key: CryptoKey, salt: string, iter = KDF_ITERATIONS): Promise<Envelope> => {
  let bytes: Uint8Array = new TextEncoder().encode(JSON.stringify(value));
  const gz = canGzip();
  if (gz) bytes = await pipe(bytes, new CompressionStream('gzip'));
  const iv = randomBytes(12);
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, bytes as BufferSource));
  return {
    app: 'wordtrail',
    v: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iter, salt },
    iv: toB64(iv),
    gz,
    ct: toB64(ct),
    at: Date.now(),
  };
};

export class WrongPassphraseError extends Error {
  constructor() {
    super('wrong-passphrase');
  }
}

export const decryptJSON = async <T = unknown>(env: Envelope, key: CryptoKey): Promise<T> => {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: fromB64(env.iv) as BufferSource }, key, fromB64(env.ct) as BufferSource));
  } catch {
    throw new WrongPassphraseError();
  }
  if (env.gz) bytes = await pipe(bytes, new DecompressionStream('gzip'));
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
};

export const isEnvelope = (x: unknown): x is Envelope =>
  !!x && typeof x === 'object' && (x as Envelope).app === 'wordtrail' && typeof (x as Envelope).ct === 'string';
