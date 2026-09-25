// The dashboard's opening view: lifetime words on an odometer above the
// Career Skyline, lit by searchlights.

import { useEffect, useMemo, useState } from 'react';
import { BRAND_GOLD } from '../app/Logo';
import { Skyline } from '../charts/Skyline';
import { useData } from '../db/data';
import { fmtMonth } from '../domain/dates';
import { isEarned, skylineMonths, skylineQuarters } from '../domain/stats';
import { jobWords } from '../domain/money';
import { getLang, tx } from '../i18n';
import { num } from '../ui/format';
import { Odometer } from '../ui/motion';
import { useUI } from '../ui/store';

export const useMedia = (q: string) => {
  const get = () => {
    try {
      return window.matchMedia(q).matches;
    } catch {
      return false;
    }
  };
  const [m, setM] = useState(get);
  useEffect(() => {
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia(q);
    } catch {
      return;
    }
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
};

export function SkylineHero() {
  const { jobs, clients, settings, today } = useData();
  const navigate = useUI((s) => s.navigate);
  const wide = useMedia('(min-width: 1024px)');
  const sm = useMedia('(min-width: 640px)');
  const data = useMemo(() => skylineMonths(jobs, today), [jobs, today]);
  // phones get one tower per quarter so the towers are wide enough for windows
  const quarterly = !sm && data.length > 30;
  const drawn = useMemo(() => (quarterly ? skylineQuarters(data) : data), [data, quarterly]);
  const s = useMemo(() => {
    const earned = jobs.filter(isEarned);
    const words = earned.reduce((a, j) => a + jobWords(j), 0);
    const record = data.reduce((b, d) => (d.words > (b?.words ?? 0) ? d : b), undefined as (typeof data)[number] | undefined);
    const thisYear = data.filter((d) => d.month.startsWith(today.slice(0, 4))).reduce((a, d) => a + d.words, 0);
    const clientIds = new Set(earned.map((j) => j.clientId).filter(Boolean));
    return { words, jobs: earned.length, clients: clientIds.size || clients.length, record, thisYear, since: data[0]?.month.slice(0, 4) };
  }, [jobs, clients, data, today]);
  const lang = getLang();

  return (
    <section className="on-ink relative overflow-hidden rounded-[4px] border border-line text-ink" style={{ background: '#0b0b0c' }} aria-label={tx('職涯天際線', 'Career skyline')}>
      <div className="relative z-10 flex flex-wrap items-start justify-between gap-x-8 gap-y-4 px-5 pt-5 sm:px-7 sm:pt-6">
        <div className="min-w-0">
          <div className="eyebrow" style={{ color: BRAND_GOLD }}>
            {s.since ? tx(`職涯天際線 · ${s.since} 年至今`, `Career skyline · since ${s.since}`) : tx('職涯天際線', 'Career skyline')}
          </div>
          <div className="mt-3 text-[44px] font-medium leading-none tracking-[-0.045em] text-ink sm:text-[64px]">
            <Odometer text={num(s.words)} />
          </div>
          <div className="mt-2.5 text-[13.5px] text-ink-2">
            {tx(`個字 · ${num(s.jobs)} 個案件 · ${num(s.clients)} 位客戶`, `words · ${num(s.jobs)} jobs · ${num(s.clients)} clients`)}
          </div>
        </div>
        {s.record && (
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-[13px] sm:text-right">
            <div>
              <dt className="eyebrow">{tx('紀錄月份', 'Record month')}</dt>
              <dd className="mt-1.5 font-medium text-ink">{fmtMonth(s.record.month, lang, 'long')}</dd>
              <dd className="text-[12px] text-muted tnum">{tx(`${num(s.record.words)} 字`, `${num(s.record.words)} words`)}</dd>
            </div>
            <div>
              <dt className="eyebrow">{tx(`${today.slice(0, 4)} 年`, today.slice(0, 4))}</dt>
              <dd className="mt-1.5 font-medium text-ink tnum">{tx(`${num(s.thisYear)} 字`, `${num(s.thisYear)} words`)}</dd>
              <dd className="text-[12px] text-muted">{settings.goals.yearWords ? tx(`目標 ${num(settings.goals.yearWords)}`, `Goal ${num(settings.goals.yearWords)}`) : tx('今年到目前為止', 'so far this year')}</dd>
            </div>
          </dl>
        )}
      </div>
      {data.length ? (
        <div className={wide ? '-mt-24 px-4' : 'mt-2 px-3'}>
          <Skyline data={drawn} height={wide ? 280 : sm ? 230 : 190} base={settings.baseCurrency} reserveTop={wide ? 0.42 : 0.12} minSlots={wide ? 24 : 12} />
        </div>
      ) : (
        <EmptyLot />
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-4 pt-1 text-[11.5px] text-muted sm:px-7">
        <span>
          {quarterly
            ? tx('每座塔是一季，高度是字數；每扇亮著的窗是一個案件。', 'Each tower is a quarter, its height the words; every lit window is a job.')
            : tx('每座塔是一個月，高度是字數；每扇亮著的窗是一個案件。', 'Each tower is a month, its height the words; every lit window is a job.')}
        </span>
        {data.length > 0 && (
          <button type="button" className="font-medium text-ink underline decoration-gold underline-offset-4" onClick={() => navigate('/insights')}>
            {tx('看完整洞察', 'Open insights')}
          </button>
        )}
      </div>
    </section>
  );
}

function EmptyLot() {
  return (
    <div className="relative mx-5 mt-6 h-[150px] sm:mx-7">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 600 150" preserveAspectRatio="xMidYMax meet" aria-hidden>
        <g stroke={BRAND_GOLD} fill="none" style={{ animation: 'fadeIn 1s ease .3s both' }}>
          <line x1="300" x2="300" y1="128" y2="30" strokeWidth="1.2" />
          <line x1="250" x2="336" y1="30" y2="30" strokeWidth="1.2" />
          <line x1="300" x2="336" y1="46" y2="30" strokeWidth="0.8" />
          <line x1="258" x2="258" y1="30" y2="62" strokeWidth="0.8" />
          <rect x="251" y="62" width="14" height="9" strokeWidth="0.8" />
          {[40, 58, 76, 94, 112].map((y) => (
            <line key={y} x1="296" x2="304" y1={y} y2={y + 14} strokeWidth="0.6" strokeOpacity="0.6" />
          ))}
        </g>
        <line x1="0" x2="600" y1="128.5" y2="128.5" stroke={BRAND_GOLD} strokeOpacity="0.55" strokeWidth="1.2" />
        <line x1="0" x2="600" y1="131.5" y2="131.5" stroke={BRAND_GOLD} strokeOpacity="0.2" />
      </svg>
      <p className="absolute inset-x-0 top-2 text-center text-[13px] text-ink-2">{tx('交出第一個案件，天際線就會開始長高。', 'Deliver your first job and your skyline starts to rise.')}</p>
    </div>
  );
}
