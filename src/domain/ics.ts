// Calendar export so deadlines land in Google / Apple / Outlook calendars.

import { addDays } from './dates';

export interface CalEvent {
  uid: string;
  title: string;
  /** YYYY-MM-DD (all-day) or YYYY-MM-DDTHH:mm (local time) */
  when: string;
  description?: string;
  url?: string;
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** RFC 5545 line folding at 75 octets. */
const fold = (line: string) => {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let curLen = 0;
  for (const ch of line) {
    const len = new TextEncoder().encode(ch).length;
    if (curLen + len > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      curLen = 0;
    }
    cur += ch;
    curLen += len;
  }
  out.push(cur);
  return out.join('\r\n ');
};

const compact = (iso: string) => iso.replace(/[-:]/g, '');

export const buildICS = (events: CalEvent[], calName = '譯跡 Wordtrail'): string => {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Wordtrail//Translator Log//ZH', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(calName)}`];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}@wordtrail`, `DTSTAMP:${stamp}`);
    if (e.when.includes('T')) {
      const start = compact(e.when) + '00';
      lines.push(`DTSTART:${start}`, `DURATION:PT30M`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${compact(e.when)}`, `DTEND;VALUE=DATE:${compact(addDays(e.when, 1))}`);
    }
    lines.push(`SUMMARY:${esc(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.title)}`, 'TRIGGER:-P1D', 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
};
