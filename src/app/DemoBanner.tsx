import { tx } from '../i18n';

export const FULL_APP_URL = 'https://b29925564.github.io/translator-log/';

/** Shown only in the single-file preview build. */
export function DemoBanner() {
  return (
    <div className="no-print relative z-20 border-b border-line bg-accent-soft px-4 py-2 text-center text-[12.5px] text-ink lg:pl-[248px]">
      {tx('這是示範版：內含虛構的示範資料，重新整理就會還原。', 'Preview with made-up sample data; reloading resets it.')}{' '}
      <a href={FULL_APP_URL} target="_blank" rel="noreferrer" className="font-semibold text-accent underline underline-offset-2">
        {tx('開啟完整版 App', 'Open the full app')}
      </a>
    </div>
  );
}
