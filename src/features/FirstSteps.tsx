// First-run guide on an empty dashboard: a short checklist plus example
// sentences that open Quick Add already filled in.

import { ArrowRight, Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { useData } from '../db/data';
import { loadDemo } from '../db/repo';
import { DEFAULT_SETTINGS } from '../domain/constants';
import { tx } from '../i18n';
import { cx } from '../ui/kit';
import { useUI } from '../ui/store';
import { useSync } from '../sync/engine';
import { useInstall } from './install';

function Step({ n, done, title, body, action }: { n: number; done?: boolean; title: string; body: string; action: ReactNode }) {
  return (
    <li className="flex items-start gap-4 px-5 py-4">
      <span className={cx('grid h-7 w-7 shrink-0 place-items-center rounded-[3px] border font-mono text-[12px]', done ? 'border-gold bg-gold text-[#0b0b0c]' : 'border-line-strong text-ink-2')}>
        {done ? <Check size={14} strokeWidth={3} /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <div className={cx('text-[14.5px] font-semibold', done ? 'text-muted line-through' : 'text-ink')}>{title}</div>
        <div className="mt-0.5 text-[13px] leading-snug text-muted">{body}</div>
      </div>
      <div className="shrink-0">{action}</div>
    </li>
  );
}

export function FirstSteps() {
  const { clients, settings } = useData();
  const { openQuickAdd, openClientEditor, navigate } = useUI();
  const sync = useSync((s) => s.status);
  const install = useInstall();
  const link = 'inline-flex items-center gap-1 text-[13px] font-medium text-ink underline decoration-gold underline-offset-4';
  const examples = [
    tx('藍海翻譯社 醫療器材說明書 英翻中 12,500字 每字1.2 下週五交', 'Lumina app strings EN>ZH-TW 3,200 words @ $0.09/word due Friday'),
    tx('森田翻訳 RPG 劇情 日翻中 26,000字 每字0.9 10/30交', 'Atlas Patent Partners patent claims 6k words 12 cents/word in 5 days'),
    tx('Pixelforge 遊戲更新說明 英翻中 5000字 每字1.1 急件', 'Harbor & Quill clinical protocol 8000 words $0.11/word Oct 30'),
  ];
  return (
    <div className="grid items-start gap-4 lg:grid-cols-12">
      <section className="card min-w-0 overflow-hidden lg:col-span-7">
        <div className="px-5 pb-3 pt-5">
          <div className="eyebrow">{tx('開始使用', 'Getting started')}</div>
          <h2 className="font-display mt-1.5 text-[22px] leading-tight text-ink">{tx('四步，把紀錄本變成你的', 'Four steps to make it yours')}</h2>
        </div>
        <ol className="hairline-list border-t border-line">
          <Step
            n={1}
            title={tx('記下第一個案件', 'Log your first job')}
            body={tx('一句話就好，客戶、語言、字數、費率、截止日會自動辨識。', 'One sentence; client, languages, volume, rate and deadline are picked out for you.')}
            action={
              <button type="button" className="btn btn-primary btn-sm" onClick={() => openQuickAdd()}>
                {tx('新增', 'Add')}
              </button>
            }
          />
          <Step
            n={2}
            done={clients.length > 0}
            title={tx('加入常合作的客戶', 'Add a regular client')}
            body={tx('記住付款天數、預設費率與扣繳，之後每筆都幫你帶入。', 'Payment terms, default rate and withholding fill in automatically from then on.')}
            action={
              <button type="button" className={link} onClick={() => openClientEditor(undefined, true)}>
                {tx('新增客戶', 'Add client')}
              </button>
            }
          />
          <Step
            n={3}
            done={settings.goals.yearIncome !== DEFAULT_SETTINGS.goals.yearIncome}
            title={tx('設定今年的目標', 'Set this year’s goal')}
            body={tx('收入目標會出現在總覽，工作節奏用來排每日進度。', 'Your income goal shows on the overview; your working hours shape the daily plan.')}
            action={
              <button type="button" className={link} onClick={() => navigate('/settings')}>
                {tx('設定', 'Set')}
              </button>
            }
          />
          <Step
            n={4}
            done={sync !== 'off' || install.installed}
            title={tx('裝到手機，或開啟同步', 'Install it, or turn on sync')}
            body={tx('加到主畫面就像一般 App；同步會端對端加密，只有你看得到。', 'Add it to your home screen like any app; sync is end-to-end encrypted.')}
            action={
              <button type="button" className={link} onClick={() => navigate('/settings/sync')}>
                {tx('前往', 'Open')}
              </button>
            }
          />
        </ol>
      </section>
      <section className="card min-w-0 p-5 lg:col-span-5">
        <div className="eyebrow">{tx('試試看', 'Try one')}</div>
        <h2 className="font-display mt-1.5 text-[22px] leading-tight text-ink">{tx('一句話新增', 'Add in one line')}</h2>
        <div className="mt-4 flex flex-col gap-2">
          {examples.map((e) => (
            <button key={e} type="button" onClick={() => openQuickAdd(e)} className="rounded-[3px] border border-line bg-surface-2 px-3.5 py-3 text-left text-[13.5px] leading-snug text-ink-2 transition-colors hover:border-ink hover:text-ink">
              {e}
            </button>
          ))}
        </div>
        <div className="mt-5 border-t border-line pt-4">
          <button type="button" className={link} onClick={() => void loadDemo()}>
            {tx('或先載入示範資料逛逛', 'Or explore with sample data')} <ArrowRight size={14} />
          </button>
        </div>
      </section>
    </div>
  );
}
