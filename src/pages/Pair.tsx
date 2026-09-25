import { KeyRound } from 'lucide-react';
import { useState } from 'react';
import { tx } from '../i18n';
import { Button, Field, Input } from '../ui/kit';
import { useUI } from '../ui/store';
import { acceptPairing } from '../sync/engine';
import { WrongPassphraseError } from '../sync/crypto';
import { LogoMark } from '../app/Logo';

export function Pair({ payload }: { payload: string }) {
  const navigate = useUI((s) => s.navigate);
  const toast = useUI((s) => s.toast);
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      await acceptPairing(payload, pass);
      toast(tx('配對完成，資料同步中', 'Paired — syncing your data'));
      navigate('/', { replace: true });
    } catch (e) {
      setErr(e instanceof WrongPassphraseError ? tx('密語不正確', 'Wrong passphrase') : tx('無法完成配對，請確認連結完整且網路正常', 'Could not pair. Check the link and your connection'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <form
        className="card w-full max-w-[420px] p-7"
        style={{ boxShadow: 'var(--shadow)' }}
        onSubmit={(e) => {
          e.preventDefault();
          void go();
        }}
      >
        <LogoMark size={48} />
        <h1 className="font-display mt-5 text-[26px] text-ink">{tx('連結這台裝置', 'Connect this device')}</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{tx('輸入你在其他裝置設定的同步密語。資料會在這台裝置上解密，不會經過任何伺服器。', 'Enter the sync passphrase you set on your other device. Data is decrypted here, never on a server.')}</p>
        <Field label={tx('同步密語', 'Sync passphrase')} className="mt-5" htmlFor="pair-pass">
          <Input id="pair-pass" type="password" autoFocus value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" />
        </Field>
        {err && <p className="mt-2 text-[13px] font-medium text-bad">{err}</p>}
        <Button type="submit" variant="primary" size="lg" className="mt-5 w-full" disabled={busy || !pass} icon={<KeyRound size={17} />}>
          {busy ? tx('解密中…', 'Decrypting…') : tx('連結', 'Connect')}
        </Button>
        <button type="button" className="mt-4 w-full text-center text-[13px] text-muted hover:text-ink" onClick={() => navigate('/', { replace: true })}>
          {tx('取消', 'Cancel')}
        </button>
      </form>
    </div>
  );
}
