import type { MediaAssetDto } from '@oneclick/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Film, ImageOff, Upload } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { uploadFile, ws } from '../lib/api';
import { useMedia } from '../lib/queries';
import { useFeedback } from './feedback';
import { Button, cx, EmptyState, Modal, SegmentedControl, Skeleton } from './ui';

export const fmtBytes = (b: number) => (b >= 1e6 ? `${(b / 1e6).toLocaleString('tr', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
export const isVideo = (m: MediaAssetDto) => m.mime.startsWith('video/');

export function MediaThumb({ m, className }: { m: MediaAssetDto; className?: string }) {
  if (isVideo(m)) {
    return (
      <div className={cx('relative overflow-hidden bg-ink', className)}>
        <video src={m.url} className="size-full object-cover" muted preload="metadata" />
        <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-sm bg-ink/70 px-1.5 py-0.5 text-micro font-medium text-white">
          <Film className="size-3" />
          {m.durationS ? `${Math.round(m.durationS)} sn` : 'Video'}
        </span>
      </div>
    );
  }
  return <img src={m.url} alt={m.fileName} className={cx('bg-subtle object-cover', className)} loading="lazy" />;
}

/** Dosyaları sırayla yükler; ilerlemeyi ve hataları yönetir. */
export function useUploader(onUploaded?: (m: MediaAssetDto) => void) {
  const qc = useQueryClient();
  const { toast } = useFeedback();
  const [progress, setProgress] = useState<number | null>(null);
  const upload = useCallback(
    async (files: FileList | File[] | null) => {
      const list = Array.from(files ?? []);
      if (!list.length) return;
      for (const f of list) {
        try {
          setProgress(0);
          const m = await uploadFile<MediaAssetDto>(ws('/media'), f, setProgress);
          onUploaded?.(m);
        } catch (err) {
          toast(`${f.name} yüklenemedi: ${(err as Error).message}`, 'error');
        }
      }
      setProgress(null);
      qc.invalidateQueries({ queryKey: ['media'] });
    },
    [onUploaded, qc, toast],
  );
  return { upload, progress, busy: progress !== null };
}

export function UploadButton({
  onUploaded,
  label = 'Yükle',
  variant = 'secondary',
}: {
  onUploaded?(m: MediaAssetDto): void;
  label?: string;
  variant?: 'primary' | 'secondary';
}) {
  const input = useRef<HTMLInputElement>(null);
  const { upload, progress } = useUploader(onUploaded);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={async (e) => {
          await upload(e.target.files);
          e.target.value = '';
        }}
      />
      <Button variant={variant} icon={Upload} onClick={() => input.current?.click()} loading={progress !== null}>
        {progress !== null ? `%${progress}` : label}
      </Button>
    </>
  );
}

export type MediaKind = 'all' | 'image' | 'video';
type Kind = MediaKind;
export const MEDIA_KINDS: { value: Kind; label: string }[] = [
  { value: 'all', label: 'Tümü' },
  { value: 'image', label: 'Görseller' },
  { value: 'video', label: 'Videolar' },
];
export const matchesKind = (m: MediaAssetDto, k: Kind) => k === 'all' || (k === 'video' ? isVideo(m) : !isVideo(m));

export function MediaPickerModal({
  open,
  onClose,
  onPick,
  selectedIds,
}: {
  open: boolean;
  onClose(): void;
  onPick(items: MediaAssetDto[]): void;
  selectedIds: string[];
}) {
  const media = useMedia();
  const [picked, setPicked] = useState<string[]>([]);
  const [kind, setKind] = useState<Kind>('all');
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const items = (media.data ?? []).filter((m) => matchesKind(m, kind));

  const confirm = () => {
    onPick(picked.map((id) => media.data!.find((m) => m.id === id)!).filter(Boolean));
    setPicked([]);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Medya kütüphanesi"
      size="lg"
      footer={
        <>
          <span className="mr-auto text-caption text-muted">Sıra, seçim sırasına göre belirlenir.</span>
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button variant="primary" disabled={!picked.length} onClick={confirm}>
            {picked.length ? `${picked.length} öğe ekle` : 'Ekle'}
          </Button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl<Kind> label="Medya türü" value={kind} onChange={setKind} options={MEDIA_KINDS} size="sm" />
        <UploadButton onUploaded={(m) => setPicked((p) => [...p, m.id])} />
      </div>
      {media.isLoading ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="aspect-square rounded-card" />
          ))}
        </div>
      ) : !items.length ? (
        <EmptyState icon={ImageOff} title="Kütüphane boş" body="Görsel veya video yükleyerek başlayın." />
      ) : (
        <div className="grid max-h-[55vh] grid-cols-3 gap-3 overflow-y-auto p-0.5 sm:grid-cols-4">
          {items.map((m) => {
            const already = selectedIds.includes(m.id);
            const idx = picked.indexOf(m.id);
            return (
              <button
                key={m.id}
                type="button"
                disabled={already}
                onClick={() => toggle(m.id)}
                className={cx(
                  'relative aspect-square overflow-hidden rounded-card border border-line transition',
                  idx >= 0 ? 'ring-2 ring-brand-600 ring-offset-2' : 'hover:border-line-strong',
                  already && 'cursor-not-allowed opacity-40',
                )}
                title={m.fileName}
              >
                <MediaThumb m={m} className="size-full" />
                {idx >= 0 && (
                  <span className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-brand-600 text-caption font-semibold text-white shadow-thumb">
                    {idx + 1}
                  </span>
                )}
                {already && (
                  <span className="absolute inset-0 flex items-center justify-center bg-ink/30">
                    <Check className="size-6 text-white" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
