import { type ReportDto, type ReportRowDto } from '@oneclick/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { BarChart3, Download, ExternalLink, RefreshCw } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useFeedback } from '../components/feedback';
import { AccountAvatar, PlatformIcon } from '../components/identity';
import { Button, Card, cx, EmptyState, Notice, PageHeader, Select, Skeleton } from '../components/ui';
import { api, ws } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useBrands } from '../lib/queries';
import {
  byAccount,
  byAuthor,
  byPlatform,
  downloadCsv,
  engagement,
  fmtNum,
  heatmap,
  RANGES,
  rangeOf,
  timeSeries,
  toCsv,
  totals,
  WEEKDAYS,
  type Breakdown,
  type Bucket,
  type RangeKey,
} from '../lib/reports';

export function ReportsPage() {
  const { workspace } = useAuth();
  const brands = useBrands();
  const qc = useQueryClient();
  const { toast } = useFeedback();
  const [rangeKey, setRangeKey] = useState<RangeKey>('30d');
  const [brandId, setBrandId] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const { from, to } = useMemo(() => rangeOf(rangeKey), [rangeKey]);

  const report = useQuery({
    queryKey: ['report', workspace?.id, from.toISOString(), to.toISOString(), brandId],
    queryFn: () => {
      const q = new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), ...(brandId ? { brandId } : {}) });
      return api<ReportDto>(ws(`/reports?${q}`));
    },
  });
  const rows = report.data?.rows ?? [];

  const refresh = async () => {
    setRefreshing(true);
    try {
      const r = await api<{ checked: number; updated: number; failed: number }>(ws('/reports/refresh'), { method: 'POST' });
      await qc.invalidateQueries({ queryKey: ['report'] });
      toast(
        r.checked ? `${r.updated} yayının istatistiği güncellendi${r.failed ? `, ${r.failed} tanesi alınamadı` : ''}.` : 'Güncellenecek yayın yok; istatistikler güncel.',
        r.failed && !r.updated ? 'error' : 'success',
      );
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setRefreshing(false);
    }
  };

  const exportCsv = () => {
    const name = `rapor-${format(from, 'yyyy-MM-dd')}-${format(new Date(to.getTime() - 1), 'yyyy-MM-dd')}.csv`;
    downloadCsv(name, toCsv(rows, brands.data ?? []));
  };

  return (
    <div className="mx-auto max-w-300 space-y-5">
      <PageHeader
        title="Raporlar"
        subtitle="Yayınlarınız ve Instagram etkileşimi. İstatistikler yaklaşık 6 saatte bir güncellenir."
        actions={
          <>
            <Button variant="ghost" icon={RefreshCw} loading={refreshing} onClick={refresh}>
              İstatistikleri yenile
            </Button>
            <Button icon={Download} disabled={!rows.length} onClick={exportCsv}>
              CSV indir
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Select fit aria-label="Dönem" value={rangeKey} onChange={(e) => setRangeKey(e.target.value as RangeKey)} className="h-8 text-small font-medium">
          {RANGES.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </Select>
        {(brands.data?.length ?? 0) > 0 && (
          <Select fit aria-label="Müşteri" value={brandId} onChange={(e) => setBrandId(e.target.value)} className="h-8 text-small font-medium">
            <option value="">Tüm müşteriler</option>
            {brands.data!.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        )}
        <span className="text-small text-muted">
          {format(from, 'd MMM yyyy', { locale: tr })} – {format(new Date(to.getTime() - 1), 'd MMM yyyy', { locale: tr })}
        </span>
      </div>

      {report.isError ? (
        <Notice tone="error">{(report.error as Error).message}</Notice>
      ) : report.isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-22 rounded-card" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-card" />
        </div>
      ) : (
        <Report report={report.data!} from={from} to={to} />
      )}
    </div>
  );
}

function Report({ report, from, to }: { report: ReportDto; from: Date; to: Date }) {
  const { rows, accounts } = report;
  const t = useMemo(() => totals(rows), [rows]);
  const series = useMemo(() => timeSeries(rows, from, to), [rows, from, to]);
  const heat = useMemo(() => heatmap(rows), [rows]);
  const top = useMemo(
    () =>
      rows
        .filter((r) => r.status === 'PUBLISHED' && r.metrics)
        .sort((a, b) => engagement(b) - engagement(a))
        .slice(0, 5),
    [rows],
  );
  const basicIg = accounts.filter((a) => a.insights === 'basic');
  const noInsights = accounts.length > 0 && accounts.every((a) => a.insights === 'unsupported');

  return (
    <div className="space-y-4">
      {basicIg.length > 0 && (
        <Notice
          tone="info"
          action={
            <Link to="/accounts" className="font-medium whitespace-nowrap underline">
              Hesaplara git
            </Link>
          }
        >
          {basicIg.map((a) => a.name).join(', ')} için yalnızca beğeni ve yorum alınabiliyor. Erişim ve görüntülenme için hesabı Hesaplar sayfasından yeniden
          bağlayın (yeni “istatistik” iznini onaylamanız gerekir).
        </Notice>
      )}
      {noInsights && <Notice tone="info">LinkedIn ve TikTok gönderi istatistiği vermiyor; bu hesaplar için yalnızca yayın sayıları gösterilir.</Notice>}
      {report.truncated && <Notice tone="warning">Bu dönemde çok fazla yayın var; en yeni 5.000 tanesi gösteriliyor. Daha kısa bir dönem seçin.</Notice>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Yayın" value={fmtNum(t.published)} note={t.failed ? `${t.failed} başarısız` : 'Başarısız yok'} />
        <Stat label="Başarı oranı" value={t.successRate === null ? '—' : `%${Math.round(t.successRate * 100)}`} note={`${t.published + t.failed} denemeden`} />
        <Stat label="Beğeni" value={fmtNum(t.likes)} note={t.likes === null ? 'Veri yok' : `${t.measured} yayından`} />
        <Stat label="Yorum" value={fmtNum(t.comments)} note={t.comments === null ? 'Veri yok' : `${t.measured} yayından`} />
        <Stat label="Erişim" value={fmtNum(t.reach)} note={t.reach === null ? (basicIg.length ? 'Yeniden bağlantı gerekli' : 'Veri yok') : 'Tekil hesap toplamı'} />
      </div>

      {!rows.length ? (
        <Card>
          <EmptyState icon={BarChart3} title="Bu dönemde yayın yok" body="Başka bir dönem seçin ya da gönderi planlayın; yayınlananlar burada raporlanır." />
        </Card>
      ) : (
        <>
          <Card title={series.unit === 'week' ? 'Haftalık yayınlar' : 'Günlük yayınlar'}>
            <ColumnChart buckets={series.buckets} />
          </Card>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Card title="Yayın saatleri">
              <Heatmap grid={heat} />
            </Card>
            <Card title="En çok etkileşim alanlar">
              {top.length ? (
                <ol className="divide-y divide-line">
                  {top.map((r) => (
                    <TopRow key={r.targetId} r={r} />
                  ))}
                </ol>
              ) : (
                <p className="px-4 py-5 text-small text-muted">Bu dönemde istatistiği olan yayın yok. Instagram yayınlarının sayıları yayından birkaç saat sonra gelir.</p>
              )}
            </Card>
          </div>

          <Card title="Hesaplar">
            <BreakdownTable items={byAccount(rows)} first="Hesap" />
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Platformlar">
              <BreakdownTable items={byPlatform(rows)} first="Platform" />
            </Card>
            <Card title="Hazırlayanlar">
              <BreakdownTable items={byAuthor(rows)} first="Kişi" metrics={false} />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-card border border-line bg-surface px-4 py-3.5">
      <p className="text-small text-muted">{label}</p>
      <p className="mt-1 text-[24px] leading-8 font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-0.5 truncate text-caption text-faint">{note}</p>
    </div>
  );
}

/** Y ekseni üst sınırı: 1, 2, 5 × 10ⁿ'e yuvarlanır */
function niceMax(v: number) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 5, 10].map((m) => m * p).find((x) => x >= v)!;
}

/** Tek serili sütun grafik: ≤24px sütun, 4px yuvarlak uç, silik ızgara, sütun başına ipucu */
function ColumnChart({ buckets }: { buckets: Bucket[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(...buckets.map((b) => b.published)));
  const every = Math.ceil(buckets.length / 8);
  const h = buckets[hover ?? -1];
  const total = buckets.reduce((a, b) => a + b.published, 0);

  return (
    <div className="px-4 pt-4 pb-3" role="img" aria-label={`${buckets.length} dönemde toplam ${total} yayın; en yüksek ${Math.max(...buckets.map((b) => b.published))}`}>
      <div className="relative flex h-48">
        {/* Y ekseni */}
        <div className="flex w-8 shrink-0 flex-col justify-between pr-2 text-right text-micro text-faint tabular-nums" aria-hidden>
          <span className="-translate-y-1/2">{max}</span>
          <span>{max / 2}</span>
          <span className="translate-y-1/2">0</span>
        </div>
        <div className="relative flex min-w-0 flex-1 items-end border-b border-line-strong">
          <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-line" aria-hidden />
          <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-line" aria-hidden />
          {buckets.map((b, i) => (
            <div
              key={b.key}
              className="relative flex h-full min-w-0 flex-1 items-end justify-center px-px"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {b.published > 0 && (
                <div
                  className={cx('w-full max-w-6 rounded-t-[4px] transition-colors', hover === i ? 'bg-brand-700' : 'bg-brand-600')}
                  style={{ height: `${(b.published / max) * 100}%` }}
                />
              )}
            </div>
          ))}
          {h && (
            <div
              className="pointer-events-none absolute bottom-full z-10 mb-2 -translate-x-1/2 rounded-control bg-ink px-2.5 py-1.5 text-caption whitespace-nowrap text-white shadow-pop"
              style={{ left: `${((hover! + 0.5) / buckets.length) * 100}%` }}
            >
              <p className="font-medium">{h.title}</p>
              <p>
                {h.published} yayın{h.failed ? ` · ${h.failed} başarısız` : ''}
              </p>
            </div>
          )}
        </div>
      </div>
      <div className="ml-8 flex text-micro text-faint" aria-hidden>
        {buckets.map((b, i) => (
          <span key={b.key} className="min-w-0 flex-1 overflow-visible text-center whitespace-nowrap">
            {i % every === 0 ? b.label : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Gün × saat ısı haritası; tek tonlu sıralı ölçek (marka rengi) */
function Heatmap({ grid }: { grid: number[][] }) {
  const [hover, setHover] = useState<{ d: number; h: number } | null>(null);
  const max = Math.max(1, ...grid.flat());
  const level = (v: number) => (v === 0 ? 0 : Math.ceil((v / max) * 4));
  const fill = (lv: number) => (lv === 0 ? 'var(--color-subtle)' : `color-mix(in oklab, var(--color-brand-600) ${[0, 25, 50, 75, 100][lv]}%, var(--color-surface))`);
  const busiest = grid.flatMap((row, d) => row.map((v, h) => ({ v, d, h }))).sort((a, b) => b.v - a.v)[0];

  return (
    <div className="p-4">
      <div className="relative">
        <div className="grid grid-cols-[2rem_repeat(24,minmax(0,1fr))] gap-0.5" role="img" aria-label={busiest?.v ? `En yoğun: ${WEEKDAYS[busiest.d]} ${busiest.h}:00, ${busiest.v} yayın` : 'Yayın yok'}>
          {grid.map((row, d) => (
            <div key={d} className="contents">
              <span className="self-center text-micro text-faint">{WEEKDAYS[d]}</span>
              {row.map((v, h) => (
                <span
                  key={h}
                  className={cx('aspect-square min-h-3 rounded-[3px]', hover?.d === d && hover.h === h && 'ring-2 ring-ink ring-offset-1')}
                  style={{ background: fill(level(v)) }}
                  onMouseEnter={() => setHover({ d, h })}
                  onMouseLeave={() => setHover(null)}
                />
              ))}
            </div>
          ))}
          <span />
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="text-center text-micro text-faint">
              {h % 6 === 0 ? h : ''}
            </span>
          ))}
        </div>
        {hover && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-control bg-ink px-2.5 py-1.5 text-caption whitespace-nowrap text-white shadow-pop"
            style={{ left: `calc(2rem + (100% - 2rem) * ${(hover.h + 0.5) / 24})`, top: `calc(${(hover.d / 8) * 100}% - 4px)` }}
          >
            {WEEKDAYS[hover.d]} {String(hover.h).padStart(2, '0')}:00–{String(hover.h + 1).padStart(2, '0')}:00 · {grid[hover.d][hover.h]} yayın
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-caption text-muted">
        <span>{busiest?.v ? `En yoğun: ${WEEKDAYS[busiest.d]} ${String(busiest.h).padStart(2, '0')}:00 civarı` : ''}</span>
        <span className="flex items-center gap-1.5">
          Az
          {[1, 2, 3, 4].map((lv) => (
            <span key={lv} className="size-3 rounded-[3px]" style={{ background: fill(lv) }} />
          ))}
          Çok
        </span>
      </div>
    </div>
  );
}

function TopRow({ r }: { r: ReportRowDto }) {
  const m = r.metrics!;
  const parts = [
    m.likes !== undefined && `${fmtNum(m.likes)} beğeni`,
    m.comments !== undefined && `${fmtNum(m.comments)} yorum`,
    m.reach !== undefined && `${fmtNum(m.reach)} erişim`,
  ].filter(Boolean);
  const body: ReactNode = (
    <>
      <PlatformIcon platform={r.platform} size={20} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-small text-ink-2">{r.text || <span className="text-faint">Metin yok</span>}</p>
        <p className="mt-0.5 text-caption text-muted">
          {r.account.name} · {format(new Date(r.at), 'd MMM HH:mm', { locale: tr })} · {parts.join(' · ')}
        </p>
      </div>
      {r.permalink && <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-faint" aria-hidden />}
    </>
  );
  return (
    <li>
      {r.permalink ? (
        <a href={r.permalink} target="_blank" rel="noreferrer" className="flex gap-3 px-4 py-3 hover:bg-subtle">
          {body}
        </a>
      ) : (
        <div className="flex gap-3 px-4 py-3">{body}</div>
      )}
    </li>
  );
}

function BreakdownTable({ items, first, metrics = true }: { items: Breakdown[]; first: string; metrics?: boolean }) {
  const maxPub = Math.max(1, ...items.map((i) => i.published));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-small">
        <thead>
          <tr className="border-b border-line text-left text-caption text-muted">
            <th className="px-4 py-2 font-medium">{first}</th>
            <th className="px-3 py-2 text-right font-medium">Yayın</th>
            <th className="px-3 py-2 text-right font-medium">Başarısız</th>
            {metrics && (
              <>
                <th className="px-3 py-2 text-right font-medium">Beğeni</th>
                <th className="px-3 py-2 text-right font-medium">Yorum</th>
                <th className="py-2 pr-4 pl-3 text-right font-medium">Erişim</th>
              </>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((i) => (
            <tr key={i.key}>
              <td className="px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  {i.avatarUrl !== undefined && i.platform ? (
                    <AccountAvatar name={i.label} url={i.avatarUrl} platform={i.platform} size={24} />
                  ) : (
                    i.platform && <PlatformIcon platform={i.platform} size={18} />
                  )}
                  <span className="min-w-0 truncate">{i.label}</span>
                </div>
                {/* Satır içi oran çubuğu: en çok yayına göre */}
                <div className="mt-1.5 h-1 max-w-40 rounded-full bg-subtle" aria-hidden>
                  <div className="h-1 rounded-full bg-brand-500" style={{ width: `${(i.published / maxPub) * 100}%` }} />
                </div>
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(i.published)}</td>
              <td className={cx('px-3 py-2.5 text-right tabular-nums', i.failed ? 'text-failed-fg' : 'text-faint')}>{i.failed}</td>
              {metrics && (
                <>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(i.likes)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(i.comments)}</td>
                  <td className="py-2.5 pr-4 pl-3 text-right tabular-nums">{fmtNum(i.reach)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
