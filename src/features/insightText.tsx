import { CircleAlert, Flame, Info, TrendingDown, TrendingUp, Trophy } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Insight } from '../domain/stats';
import type { Client } from '../domain/types';
import { tx } from '../i18n';
import { date, money, pct } from '../ui/format';

export interface InsightView {
  title: string;
  body: string;
  icon: ReactNode;
  tone: Insight['tone'];
  link?: string;
}

export const insightView = (ins: Insight, clientMap: Map<string, Client>, base: string): InsightView => {
  const p = ins.params;
  const cname = (id: unknown) => clientMap.get(String(id))?.name ?? tx('某客戶', 'a client');
  switch (ins.kind) {
    case 'rateUp':
      return {
        tone: 'good',
        icon: <TrendingUp size={18} />,
        title: tx(`平均字價上升 ${pct(Number(p.pct))}`, `Per-word income up ${pct(Number(p.pct))}`),
        body: tx('近 12 個月每字平均收入比前一年高，議價有成果。', 'Your average income per word over the last 12 months beat the year before.'),
        link: '/insights',
      };
    case 'rateDown':
      return {
        tone: 'warn',
        icon: <TrendingDown size={18} />,
        title: tx(`平均字價下降 ${pct(Number(p.pct))}`, `Per-word income down ${pct(Number(p.pct))}`),
        body: tx('近 12 個月每字平均收入比前一年低，可以檢視報價或客戶組合。', 'Income per word slipped versus the year before. Worth reviewing rates or your client mix.'),
        link: '/insights',
      };
    case 'concentration':
      return {
        tone: 'warn',
        icon: <CircleAlert size={18} />,
        title: tx(`收入集中在「${cname(p.clientId)}」`, `Income concentrated in ${cname(p.clientId)}`),
        body: tx(`近 12 個月 ${pct(Number(p.share))} 的收入來自同一位客戶，分散客源能降低風險。`, `${pct(Number(p.share))} of the last 12 months came from one client. Spreading it out lowers your risk.`),
        link: '/clients/' + p.clientId,
      };
    case 'overdue':
      return {
        tone: 'warn',
        icon: <CircleAlert size={18} />,
        title: tx(`${p.count} 筆款項已逾期`, `${p.count} overdue ${Number(p.count) === 1 ? 'payment' : 'payments'}`),
        body: tx(`合計 ${money(Number(p.amount), base)}，可以寄出付款提醒。`, `${money(Number(p.amount), base)} in total — time for a friendly reminder.`),
        link: '/money',
      };
    case 'slowPayer':
      return {
        tone: 'warn',
        icon: <CircleAlert size={18} />,
        title: tx(`「${cname(p.clientId)}」付款偏慢`, `${cname(p.clientId)} pays slowly`),
        body: tx(`平均 ${p.days} 天才入帳，超過約定天數。`, `On average it takes ${p.days} days, longer than the agreed terms.`),
        link: '/clients/' + p.clientId,
      };
    case 'crunch':
      return {
        tone: 'warn',
        icon: <Flame size={18} />,
        title: tx(`${date(String(p.date), { month: 'short', day: 'numeric', weekday: 'short' })} 工作量超載`, `Overbooked on ${date(String(p.date), { month: 'short', day: 'numeric', weekday: 'short' })}`),
        body: tx(`當天需要約 ${p.hours} 小時，超過你設定的每日工時。`, `That day needs about ${p.hours} hours, more than your daily capacity.`),
      };
    case 'bestHourly':
      return {
        tone: 'good',
        icon: <Trophy size={18} />,
        title: tx(`時薪最高：${cname(p.clientId)}`, `Best hourly rate: ${cname(p.clientId)}`),
        body: tx(`近 12 個月有效時薪約 ${money(Number(p.hourly), base)}。`, `About ${money(Number(p.hourly), base)} per hour over the last 12 months.`),
        link: '/clients/' + p.clientId,
      };
    case 'goalPace':
      return {
        tone: Number(p.pct) >= 1 ? 'good' : 'info',
        icon: Number(p.pct) >= 1 ? <TrendingUp size={18} /> : <Info size={18} />,
        title: tx(`年度目標預估達成 ${pct(Number(p.pct))}`, `On pace for ${pct(Number(p.pct))} of your goal`),
        body: tx(`照目前步調，今年收入約 ${money(Number(p.projected), base)}。`, `At this pace the year ends around ${money(Number(p.projected), base)}.`),
      };
    case 'streak':
      return {
        tone: 'good',
        icon: <Flame size={18} />,
        title: tx(`連續 ${p.days} 個工作天都有產出`, `${p.days} working days in a row`),
        body: tx('穩定的節奏是自由工作者最好的朋友。', 'A steady rhythm is a freelancer’s best friend.'),
      };
  }
};
