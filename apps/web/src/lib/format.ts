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
