import type { MediaAssetDto } from '@oneclick/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ImageOff, Search, Trash2, UploadCloud } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { useFeedback } from '../components/feedback';
import { fmtBytes, MEDIA_KINDS, MediaThumb, matchesKind, UploadButton, useUploader, type MediaKind } from '../components/MediaLibrary';
import { Card, cx, EmptyState, PageHeader, SegmentedControl, Skeleton } from '../components/ui';
import { api, ws } from '../lib/api';
import { useMedia } from '../lib/queries';

export function MediaPage() {
  const media = useMedia();
  const qc = useQueryClient();
  const { confirm, toast } = useFeedback();
  const [kind, setKind] = useState<MediaKind>('all');
  const [q, setQ] = useState('');
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const { upload, progress } = useUploader();

  const items = (media.data ?? []).filter((m) => matchesKind(m, kind) && m.fileName.toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr')));

  const remove = async (m: MediaAssetDto) => {
    const ok = await confirm({ title: 'Medya silinsin mi?', body: `${m.fileName} kütüphaneden kalıcı olarak silinir.`, action: 'Sil', danger: true });
    if (!ok) return;
    try {
      await api(ws(`/media/${m.id}`), { method: 'DELETE' });
      qc.invalidateQueries({ queryKey: ['media'] });
      toast('Medya silindi.', 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  // Sayfaya dosya sürüklenince tüm alanı kaplayan bırakma katmanı
  const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes('Files');
  const dnd = {
    onDragEnter: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current++;
      setOver(true);
    },
    onDragLeave: () => {
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) setOver(false);
    },
    onDragOver: (e: DragEvent) => hasFiles(e) && e.preventDefault(),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      upload(e.dataTransfer.files);
    },
  };

  return (
    <div className="relative mx-auto min-h-[calc(100dvh-120px)] max-w-360" {...dnd}>
      <PageHeader
        title="Medya"
        subtitle="Görsel ve videolarınızı bir kez yükleyin, gönderilerde tekrar kullanın."
        actions={<UploadButton variant="primary" />}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SegmentedControl<MediaKind> label="Medya türü" value={kind} onChange={setKind} options={MEDIA_KINDS} />
        <div className="relative w-56">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" strokeWidth={1.75} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Dosya adı ara"
            aria-label="Dosya adı ara"
            className="h-9 w-full rounded-control border border-line-strong bg-surface pr-2 pl-8.5 text-small placeholder:text-faint focus:border-brand-500 focus:ring-3 focus:ring-brand-100 focus:outline-none"
          />
        </div>
        <span className="flex-1" />
        {media.data && <span className="text-small text-muted tabular-nums">{items.length} öğe</span>}
      </div>

      {media.isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} className="aspect-4/5 rounded-card" />
          ))}
        </div>
      ) : !media.data?.length && progress === null ? (
        <Card>
          <EmptyState
            icon={UploadCloud}
            title="Henüz medya yok"
            body="Dosyaları buraya sürükleyin ya da yükle düğmesini kullanın. Instagram için JPEG görsel, TikTok ve Reels için MP4 video önerilir."
            action={<UploadButton variant="primary" label="Dosya yükle" />}
          />
        </Card>
      ) : !items.length && progress === null ? (
        <Card>
          <EmptyState icon={ImageOff} title="Eşleşen medya yok" body="Filtreyi ya da aramayı değiştirin." />
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">
          {progress !== null && (
            <div className="flex aspect-square flex-col items-center justify-center gap-2 rounded-card border border-dashed border-brand-200 bg-brand-50 text-caption font-medium text-brand-700">
              Yükleniyor %{progress}
              <span className="h-1 w-2/3 overflow-hidden rounded-full bg-brand-100">
                <span className="block h-full bg-brand-600 transition-[width]" style={{ width: `${progress}%` }} />
              </span>
            </div>
          )}
          {items.map((m) => (
            <figure key={m.id} className="group min-w-0">
              <div className="relative overflow-hidden rounded-card border border-line">
                <MediaThumb m={m} className="aspect-square w-full" />
                <div className="absolute inset-0 bg-linear-to-b from-ink/40 to-transparent to-40% opacity-0 transition group-hover:opacity-100" />
                <button
                  onClick={() => remove(m)}
                  className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-control bg-surface text-muted opacity-0 shadow-thumb transition group-hover:opacity-100 hover:text-failed-fg focus:opacity-100"
                  aria-label={`${m.fileName} sil`}
                  title="Sil"
                >
                  <Trash2 className="size-4" strokeWidth={1.75} />
                </button>
              </div>
              <figcaption className="mt-2 px-0.5">
                <p className="truncate text-caption font-medium text-ink-2" title={m.fileName}>
                  {m.fileName}
                </p>
                <p className="text-micro text-muted tabular-nums">
                  {m.width && m.height ? `${m.width}×${m.height} · ` : ''}
                  {fmtBytes(m.sizeBytes)}
                </p>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {over && (
        <div className="pointer-events-none absolute inset-0 z-30 flex animate-fade-in items-center justify-center rounded-card border-2 border-dashed border-brand-200 bg-brand-50/90">
          <p className={cx('flex items-center gap-2 text-heading font-semibold text-brand-700')}>
            <UploadCloud className="size-5" /> Yüklemek için bırakın
          </p>
        </div>
      )}
    </div>
  );
}
