import { Cloud, CloudOff, RefreshCw, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { tx } from '../i18n';
import { useUI } from '../ui/store';
import { syncNow, useSync } from './engine';

export const syncErrorText = (code?: string) => {
  switch (code) {
    case 'wrong-passphrase':
      return tx('同步密語不正確', 'Wrong sync passphrase');
    case 'bad-token':
      return tx('GitHub 權杖失效，請重新連線', 'GitHub token expired, reconnect');
    case 'gist-missing':
      return tx('找不到同步資料，請重新連線', 'Sync data not found, reconnect');
    case 'rate-limited':
      return tx('GitHub 暫時限制請求，稍後再試', 'GitHub rate limit, try later');
    case 'offline':
      return tx('目前離線，連上網路後自動同步', 'Offline — will sync when online');
    default:
      return code ? tx(`同步失敗：${code}`, `Sync failed: ${code}`) : '';
  }
};

export const ago = (t?: number) => {
  if (!t) return tx('尚未同步', 'Never');
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return tx('剛剛', 'just now');
  const m = Math.round(s / 60);
  if (m < 60) return tx(`${m} 分鐘前`, `${m} min ago`);
  const h = Math.round(m / 60);
  if (h < 24) return tx(`${h} 小時前`, `${h} h ago`);
  return tx(`${Math.round(h / 24)} 天前`, `${Math.round(h / 24)} d ago`);
};

export function SyncBadge() {
  const { status, lastSyncAt, error } = useSync();
  const navigate = useUI((s) => s.navigate);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  if (__DEMO_BUILD__) {
    return (
      <div className="rounded-xl bg-surface-2 px-3 py-2.5 text-[12.5px] leading-snug text-muted">
        {tx('示範版：資料只存在這個瀏覽器。', 'Preview: data stays in this browser.')}
      </div>
    );
  }

  if (status === 'off')
    return (
      <button type="button" onClick={() => navigate('/settings/sync')} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-ink">
        <CloudOff size={16} />
        <span className="flex-1">
          <span className="block font-medium text-ink-2">{tx('僅存於此裝置', 'This device only')}</span>
          <span className="block text-[12px]">{tx('開啟跨裝置同步 →', 'Turn on device sync →')}</span>
        </span>
      </button>
    );

  return (
    <button
      type="button"
      onClick={() => void syncNow()}
      title={tx('立即同步', 'Sync now')}
      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] transition-colors hover:bg-surface-2"
    >
      {status === 'error' ? (
        <TriangleAlert size={16} className="text-warn" />
      ) : status === 'syncing' ? (
        <RefreshCw size={16} className="animate-spin text-accent" />
      ) : (
        <Cloud size={16} className="text-accent" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-ink">
          {status === 'syncing' ? tx('同步中…', 'Syncing…') : status === 'error' ? tx('同步暫停', 'Sync paused') : tx('已同步', 'Synced')}
        </span>
        <span className="block truncate text-[12px] text-muted">{status === 'error' ? syncErrorText(error) : ago(lastSyncAt)}</span>
      </span>
    </button>
  );
}
