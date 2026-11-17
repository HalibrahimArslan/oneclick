import { PLATFORM_LABELS, type BrandDto, type Platform, type ReportRowDto } from '@oneclick/shared';
import {
  addDays,
  addWeeks,
  differenceInCalendarDays,
  endOfMonth,
  format,
  getDay,
  getHours,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
} from 'date-fns';
import { tr } from 'date-fns/locale';

// ---------- Dönem ----------

export type RangeKey = '7d' | '30d' | '90d' | 'month' | 'lastMonth';

export const RANGES: { key: RangeKey; label: string }[] = [
  { key: '7d', label: 'Son 7 gün' },
  { key: '30d', label: 'Son 30 gün' },
  { key: '90d', label: 'Son 90 gün' },
  { key: 'month', label: 'Bu ay' },
  { key: 'lastMonth', label: 'Geçen ay' },
];

/** [from, to) yerel saatle; "son N gün" bugünü de içerir */
export function rangeOf(key: RangeKey, now = new Date()): { from: Date; to: Date } {
  const tomorrow = addDays(startOfDay(now), 1);
  if (key === 'month') return { from: startOfMonth(now), to: tomorrow };
  if (key === 'lastMonth') {
    const prev = subMonths(now, 1);
    return { from: startOfMonth(prev), to: addDays(startOfDay(endOfMonth(prev)), 1) };
  }
  const days = key === '7d' ? 7 : key === '30d' ? 30 : 90;
  return { from: subDays(tomorrow, days), to: tomorrow };
}

// ---------- Toplamlar ----------

const sum = (rows: ReportRowDto[], k: 'likes' | 'comments' | 'reach' | 'views' | 'saved' | 'shares') => {
  const vals = rows.map((r) => r.metrics?.[k]).filter((v): v is number => typeof v === 'number');
  // Platform hiç vermediyse "0" değil "yok" gösterilir
  return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
};

export interface Totals {
  published: number;
  failed: number;
  /** Başarılı / (başarılı + başarısız); hiç yayın yoksa null */
  successRate: number | null;
  likes: number | null;
  comments: number | null;
  reach: number | null;
  views: number | null;
  /** İstatistiği olan yayın sayısı */
  measured: number;
}

export function totals(rows: ReportRowDto[]): Totals {
  const published = rows.filter((r) => r.status === 'PUBLISHED');
  const failed = rows.length - published.length;
  return {
    published: published.length,
    failed,
    successRate: rows.length ? published.length / rows.length : null,
    likes: sum(published, 'likes'),
    comments: sum(published, 'comments'),
    reach: sum(published, 'reach'),
    views: sum(published, 'views'),
    measured: published.filter((r) => r.metrics).length,
  };
}

export const engagement = (r: ReportRowDto) => (r.metrics?.likes ?? 0) + (r.metrics?.comments ?? 0) + (r.metrics?.saved ?? 0) + (r.metrics?.shares ?? 0);

// ---------- Zaman serisi ----------

export interface Bucket {
  key: string;
  label: string;
  /** İpucu için uzun etiket */
  title: string;
  published: number;
  failed: number;
}

/** 45 günden uzun dönemlerde haftalık, değilse günlük; boş günler/haftalar da yer alır */
export function timeSeries(rows: ReportRowDto[], from: Date, to: Date): { buckets: Bucket[]; unit: 'day' | 'week' } {
  const weekly = differenceInCalendarDays(to, from) > 45;
  const start = weekly ? startOfWeek(from, { weekStartsOn: 1 }) : startOfDay(from);
  const step = (d: Date) => (weekly ? addWeeks(d, 1) : addDays(d, 1));
  const keyOf = (d: Date) => format(weekly ? startOfWeek(d, { weekStartsOn: 1 }) : d, 'yyyy-MM-dd');

  const buckets: Bucket[] = [];
  const byKey = new Map<string, Bucket>();
  for (let d = start; d < to; d = step(d)) {
    const b: Bucket = {
      key: format(d, 'yyyy-MM-dd'),
      label: format(d, 'd MMM', { locale: tr }),
      title: weekly ? `${format(d, 'd MMM', { locale: tr })} haftası` : format(d, 'd MMMM EEEE', { locale: tr }),
      published: 0,
      failed: 0,
    };
    buckets.push(b);
    byKey.set(b.key, b);
  }
  for (const r of rows) {
    const b = byKey.get(keyOf(new Date(r.at)));
    if (b) b[r.status === 'PUBLISHED' ? 'published' : 'failed']++;
  }
  return { buckets, unit: weekly ? 'week' : 'day' };
}

// ---------- Gün × saat ----------

export const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

/** 7 × 24 yayın sayısı; satırlar Pazartesiden başlar */
export function heatmap(rows: ReportRowDto[]): number[][] {
  const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const r of rows) {
    if (r.status !== 'PUBLISHED') continue;
    const d = new Date(r.at);
    grid[(getDay(d) + 6) % 7][getHours(d)]++;
  }
  return grid;
}

// ---------- Kırılımlar ----------

export interface Breakdown {
  key: string;
  label: string;
  platform?: Platform;
  avatarUrl?: string | null;
  published: number;
  failed: number;
  likes: number | null;
  comments: number | null;
  reach: number | null;
}

function group(rows: ReportRowDto[], keyOf: (r: ReportRowDto) => string, describe: (r: ReportRowDto) => Pick<Breakdown, 'label' | 'platform' | 'avatarUrl'>) {
  const map = new Map<string, ReportRowDto[]>();
  for (const r of rows) {
    const k = keyOf(r);
    map.set(k, [...(map.get(k) ?? []), r]);
  }
  return [...map.entries()]
    .map(([key, rs]): Breakdown => {
      const t = totals(rs);
      return { key, ...describe(rs[0]), published: t.published, failed: t.failed, likes: t.likes, comments: t.comments, reach: t.reach };
    })
    .sort((a, b) => b.published - a.published || b.failed - a.failed);
}

export const byAccount = (rows: ReportRowDto[]) =>
  group(rows, (r) => r.account.id, (r) => ({ label: r.account.name, platform: r.platform, avatarUrl: r.account.avatarUrl }));
export const byPlatform = (rows: ReportRowDto[]) => group(rows, (r) => r.platform, (r) => ({ label: PLATFORM_LABELS[r.platform], platform: r.platform }));
export const byAuthor = (rows: ReportRowDto[]) => group(rows, (r) => r.author.id, (r) => ({ label: r.author.name }));

// ---------- CSV ----------

/**
 * Türkçe Excel ondalık ayırıcı olarak virgül kullandığı için alanlar noktalı virgülle ayrılır;
 * BOM olmadan Excel UTF-8'i tanımaz ve Türkçe karakterler bozulur.
 */
export function toCsv(rows: ReportRowDto[], brands: BrandDto[]): string {
  const brandName = new Map(brands.map((b) => [b.id, b.name]));
  const cell = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ['Tarih', 'Saat', 'Platform', 'Hesap', 'Müşteri', 'Hazırlayan', 'Durum', 'Metin', 'Beğeni', 'Yorum', 'Erişim', 'Görüntülenme', 'Kaydetme', 'Paylaşım', 'Bağlantı', 'Hata'];
  const lines = rows.map((r) => {
    const d = new Date(r.at);
    return [
      format(d, 'dd.MM.yyyy'),
      format(d, 'HH:mm'),
      PLATFORM_LABELS[r.platform],
      r.account.name,
      r.brandId ? (brandName.get(r.brandId) ?? '') : '',
      r.author.name,
      r.status === 'PUBLISHED' ? 'Yayınlandı' : 'Başarısız',
      r.text.replace(/\s+/g, ' ').trim(),
      r.metrics?.likes,
      r.metrics?.comments,
      r.metrics?.reach,
      r.metrics?.views,
      r.metrics?.saved,
      r.metrics?.shares,
      r.permalink,
      r.errorMessage,
    ]
      .map(cell)
      .join(';');
  });
  return '﻿' + [header.join(';'), ...lines].join('\r\n');
}

export function downloadCsv(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 1.234 / 12,3 B / 1,2 Mn (Türkçe) */
export const fmtNum = (n: number | null | undefined) => (n === null || n === undefined ? '—' : new Intl.NumberFormat('tr-TR', { notation: n >= 100_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(n));
