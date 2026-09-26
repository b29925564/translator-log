// Version line in Settings → About: which build is running and whether a newer one is out.

import { CheckCircle2, CloudOff, Download, Loader2 } from 'lucide-react';
import { tx } from '../i18n';
import { applyUpdate, checkForUpdate, useUpdate } from './update';

const stamp = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function AppVersion() {
  const { state, latestTime } = useUpdate();
  return (
    <div className="mt-2 flex flex-col gap-1.5" data-testid="app-version">
      <p className="font-mono text-[12px] text-muted">
        v{__APP_VERSION__} · {stamp(__BUILD_TIME__)} · {__BUILD_ID__}
      </p>
      {state === 'available' || state === 'updating' ? (
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink">
          <Download size={14} className="text-accent" />
          <span>{tx(`有新版本（${stamp(latestTime)}）`, `New version available (${stamp(latestTime)})`)}</span>
          <button type="button" className="btn btn-primary btn-sm" disabled={state === 'updating'} onClick={() => void applyUpdate()}>
            {state === 'updating' ? tx('更新中…', 'Updating…') : tx('立即更新', 'Update now')}
          </button>
        </div>
      ) : state === 'latest' ? (
        <button type="button" className="flex items-center gap-1.5 self-start text-[13px] text-ink-2" onClick={() => void checkForUpdate()} title={tx('再檢查一次', 'Check again')}>
          <CheckCircle2 size={14} className="text-good" />
          {tx('已是最新版', 'Up to date')}
        </button>
      ) : state === 'checking' ? (
        <span className="flex items-center gap-1.5 text-[13px] text-muted">
          <Loader2 size={14} className="animate-spin" />
          {tx('檢查更新中…', 'Checking for updates…')}
        </span>
      ) : state === 'offline' ? (
        <button type="button" className="flex items-center gap-1.5 self-start text-[13px] text-muted" onClick={() => void checkForUpdate()}>
          <CloudOff size={14} />
          {tx('離線中，無法確認是否最新（點此重試）', 'Offline, cannot check for updates (tap to retry)')}
        </button>
      ) : null}
    </div>
  );
}
