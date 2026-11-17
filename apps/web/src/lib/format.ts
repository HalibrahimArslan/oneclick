import { format, isToday, isTomorrow, isYesterday } from 'date-fns';
import { tr } from 'date-fns/locale';

// Tarih biçimleri: DESIGN.md §6
const d = (v: string | Date) => (typeof v === 'string' ? new Date(v) : v);

/** 9 Ekim 2026, 10:00 */
export const fmtLong = (v: string | Date | null) => (v ? format(d(v), 'd MMMM yyyy, HH:mm', { locale: tr }) : '—');

/** 9 Eki Per, 10:00 */
export const fmtShort = (v: string | Date) => format(d(v), 'd MMM EEE, HH:mm', { locale: tr });

export const fmtTime = (v: string | Date) => format(d(v), 'HH:mm');

/** Bugün · 8 Ekim Çarşamba */
export function dayHeading(v: Date) {
  const rest = format(v, 'd MMMM EEEE', { locale: tr });
  if (isToday(v)) return `Bugün · ${rest}`;
  if (isTomorrow(v)) return `Yarın · ${rest}`;
  if (isYesterday(v)) return `Dün · ${rest}`;
  return rest.replace(/^./, (c) => c.toLocaleUpperCase('tr'));
}

/** Gelen kutusu: "şimdi", "5 dk", "3 sa", "dün 14:30", "12 Kas" */
export function fmtAgo(v: string | Date, now = new Date()) {
  const t = d(v);
  const min = Math.floor((now.getTime() - t.getTime()) / 60_000);
  if (min < 1) return 'şimdi';
  if (min < 60) return `${min} dk`;
  if (min < 24 * 60 && isToday(t)) return `${Math.floor(min / 60)} sa`;
  if (isYesterday(t)) return `dün ${format(t, 'HH:mm')}`;
  return format(t, t.getFullYear() === now.getFullYear() ? 'd MMM' : 'd MMM yyyy', { locale: tr });
}
