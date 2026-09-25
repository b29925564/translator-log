import { Copy, ExternalLink, KeyRound, Lock, QrCode, RefreshCw, ShieldCheck, Unplug } from 'lucide-react';
import { useEffect, useState } from 'react';
import { tx } from '../i18n';
import { Button, Field, Input } from '../ui/kit';
import { useUI } from '../ui/store';
import { copyText } from '../features/download';
import { connect, disconnect, pairingLink, syncAvailable, syncNow, useSync } from './engine';
import { WrongPassphraseError } from './crypto';
import { GistError } from './gist';
import { ago, syncErrorText } from './SyncBadge';

const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=gist&description=Witimemo%20sync';

export function SyncSettings() {
  const { status, login, lastSyncAt, error, lastStats } = useSync();
  const { toast, ask } = useUI();
  const [token, setToken] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pair, setPair] = useState<{ link: string; qr: string } | null>(null);

  useEffect(() => setPair(null), [status]);

  if (!syncAvailable()) {
    return <p className="text-[14px] text-muted">{tx('示範版不提供同步。請使用完整版 App 開啟跨裝置同步。', 'Sync is not available in the preview. Use the full app to sync devices.')}</p>;
  }

  const doConnect = async () => {
    setErr(null);
    if (pass.length < 8) {
      setErr(tx('同步密語至少 8 個字元', 'Use at least 8 characters for the passphrase'));
      return;
    }
    setBusy(true);
    try {
      const r = await connect(token.trim(), pass);
      toast(r.created ? tx('已建立加密同步空間', 'Encrypted sync space created') : tx('已連上既有的同步資料', 'Joined your existing sync data'));
      setToken('');
      setPass('');
    } catch (e) {
      if (e instanceof WrongPassphraseError) setErr(tx('密語與其他裝置設定的不同', 'That passphrase doesn’t match your other devices'));
      else if (e instanceof GistError && e.status === 401) setErr(tx('GitHub 權杖無效', 'The GitHub token is not valid'));
      else if (e instanceof GistError && (e.status === 403 || e.status === 404)) setErr(tx('權杖缺少 gist 權限', 'The token is missing the gist scope'));
      else setErr(tx('連線失敗，請確認網路後再試', 'Could not connect. Check your connection and try again'));
    } finally {
      setBusy(false);
    }
  };

  const showPair = async () => {
    const link = await pairingLink();
    if (!link) return;
    if (__DEMO_BUILD__) return;
    const QR = await import('qrcode');
    const qr = await QR.toDataURL(link, { margin: 1, width: 280, errorCorrectionLevel: 'M', color: { dark: '#0f1b24', light: '#ffffff' } });
    setPair({ link, qr });
  };

  if (status === 'off') {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex gap-3 rounded-xl bg-accent-soft p-4 text-[13.5px] leading-relaxed text-ink">
          <ShieldCheck size={20} className="mt-0.5 shrink-0 text-accent" />
          <span>
            {tx(
              '資料會先在這台裝置用你的密語加密（AES-256），再存進你自己 GitHub 帳號的私人 Gist。沒有密語，任何人（包括 GitHub）都看不到內容。',
              'Your data is encrypted on this device with your passphrase (AES-256) before it is stored in a private Gist on your own GitHub account. Without the passphrase, no one — GitHub included — can read it.',
            )}
          </span>
        </div>
        <ol className="flex flex-col gap-4">
          <li>
            <div className="mb-2 text-[14px] font-medium text-ink">1. {tx('建立一把只能存取 Gist 的 GitHub 權杖', 'Create a GitHub token limited to Gists')}</div>
            <a className="btn btn-secondary btn-sm" href={TOKEN_URL} target="_blank" rel="noreferrer">
              <ExternalLink size={14} /> {tx('開啟 GitHub 建立權杖', 'Open GitHub')}
            </a>
            <p className="mt-1.5 text-[12.5px] text-muted">{tx('只勾選「gist」權限，到期日可選「No expiration」。', 'Tick only the “gist” scope. You can choose “No expiration”.')}</p>
          </li>
          <li>
            <Field label={`2. ${tx('貼上權杖', 'Paste the token')}`} htmlFor="sync-token">
              <Input id="sync-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ghp_…" className="font-mono" />
            </Field>
          </li>
          <li>
            <Field label={`3. ${tx('設定同步密語', 'Choose a sync passphrase')}`} hint={tx('每台裝置都要輸入同一組密語。忘記就無法解開雲端資料，請妥善保存。', 'Every device uses the same passphrase. If you forget it, the cloud copy cannot be opened.')} htmlFor="sync-pass">
              <Input id="sync-pass" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />
            </Field>
          </li>
        </ol>
        {err && <p className="text-[13px] font-medium text-bad">{err}</p>}
        <div>
          <Button variant="primary" icon={<Lock size={15} />} disabled={busy || !token.trim() || !pass} onClick={() => void doConnect()}>
            {busy ? tx('加密並連線中…', 'Encrypting and connecting…') : tx('開啟同步', 'Turn on sync')}
          </Button>
        </div>
        <p className="text-[12.5px] text-muted">{tx('已經在另一台裝置開啟同步？在那台裝置的「設定 → 同步 → 配對新裝置」掃描 QR Code 最快。', 'Already syncing on another device? Scan the QR code from Settings → Sync → Pair a device there.')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-surface-2 p-3">
          <div className="text-[12px] text-muted">{tx('狀態', 'Status')}</div>
          <div className="text-[15px] font-semibold text-ink">{status === 'syncing' ? tx('同步中…', 'Syncing…') : status === 'error' ? tx('暫停', 'Paused') : tx('已同步', 'Synced')}</div>
          {status === 'error' && <div className="text-[12px] text-bad">{syncErrorText(error)}</div>}
        </div>
        <div className="rounded-xl bg-surface-2 p-3">
          <div className="text-[12px] text-muted">{tx('上次同步', 'Last sync')}</div>
          <div className="text-[15px] font-semibold text-ink">{ago(lastSyncAt)}</div>
          {lastStats && <div className="text-[12px] text-muted">{tx(`下載 ${lastStats.pulled}・上傳 ${lastStats.pushed}`, `${lastStats.pulled} in · ${lastStats.pushed} out`)}</div>}
        </div>
        <div className="rounded-xl bg-surface-2 p-3">
          <div className="text-[12px] text-muted">GitHub</div>
          <div className="truncate text-[15px] font-semibold text-ink">{login ?? '—'}</div>
          <div className="text-[12px] text-muted">{tx('端對端加密', 'End-to-end encrypted')}</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button icon={<RefreshCw size={15} />} onClick={() => void syncNow()}>
          {tx('立即同步', 'Sync now')}
        </Button>
        <Button icon={<QrCode size={15} />} onClick={() => void showPair()}>
          {tx('配對新裝置', 'Pair a device')}
        </Button>
        <Button
          variant="ghost"
          icon={<Unplug size={15} />}
          onClick={async () => {
            const ok = await ask({ title: tx('中斷這台裝置的同步？', 'Stop syncing this device?'), body: tx('這台裝置上的資料會保留；雲端資料不會被刪除。', 'Data on this device stays, and the cloud copy is not deleted.'), confirm: tx('中斷', 'Disconnect') });
            if (ok) await disconnect();
          }}
        >
          {tx('中斷連線', 'Disconnect')}
        </Button>
      </div>
      {pair && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-line p-5 text-center sm:flex-row sm:text-left">
          <img src={pair.qr} alt={tx('配對 QR Code', 'Pairing QR code')} width={180} height={180} className="rounded-xl border border-line bg-white p-1" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-center gap-2 text-[14.5px] font-semibold text-ink sm:justify-start">
              <KeyRound size={16} className="text-accent" /> {tx('用另一台裝置掃描', 'Scan with your other device')}
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{tx('手機相機掃描後會開啟記譯，輸入同一組密語即可完成配對。連結本身已加密，沒有密語無法使用。', 'The camera opens Witimemo; enter the same passphrase to finish. The link is encrypted and useless without the passphrase.')}</p>
            <Button size="sm" variant="ghost" className="mt-2" icon={<Copy size={14} />} onClick={() => void copyText(pair.link)}>
              {tx('複製配對連結', 'Copy pairing link')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
