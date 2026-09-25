import { describe, expect, it } from 'vitest';
import { decryptJSON, deriveKey, encryptJSON, fromB64Url, newSalt, toB64Url, WrongPassphraseError } from '../src/sync/crypto';

describe('sync crypto', () => {
  it('round-trips with the right passphrase and rejects a wrong one', async () => {
    const salt = newSalt();
    const key = await deriveKey('correct horse battery staple', salt, 1000);
    const data = { jobs: [{ id: '1', title: '醫療器材說明書' }], n: 42 };
    const env = await encryptJSON(data, key, salt, 1000);
    expect(env.ct).not.toContain('醫療');
    expect(await decryptJSON(env, key)).toEqual(data);
    const wrong = await deriveKey('wrong', salt, 1000);
    await expect(decryptJSON(env, wrong)).rejects.toBeInstanceOf(WrongPassphraseError);
  });

  it('encodes base64url', () => {
    const bytes = new Uint8Array([251, 255, 0, 1, 2]);
    expect(fromB64Url(toB64Url(bytes))).toEqual(bytes);
  });
});
