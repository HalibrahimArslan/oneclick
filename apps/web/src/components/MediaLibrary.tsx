import type { MediaAssetDto } from '@oneclick/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Film, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { uploadFile, ws } from '../lib/api';
import { useMedia } from '../lib/queries';
import { Button, cx, EmptyState, Modal, Notice, Spinner } from './ui';

export function MediaThumb({ m, className }: { m: MediaAssetDto; className?: string }) {
  if (m.mime.startsWith('video/')) {
    return (
      <div className={cx('relative overflow-hidden bg-gray-900', className)}>
        <video src={m.url} className="size-full object-cover" muted preload="metadata" />
        <span className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
          <Film className="size-3" />
          {m.durationS ? `${Math.round(m.durationS)} sn` : 'video'}
        </span>
      </div>
    );
  }
  return <img src={m.url} alt={m.fileName} className={cx('bg-gray-100 object-cover', className)} loading="lazy" />;
}

/** Dosya seçip yükler; her biri tamamlandığında onUploaded çağrılır. */
export function UploadButton({ onUploaded, label = 'Yükle' }: { onUploaded?(m: MediaAssetDto): void; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    for (const f of Array.from(files)) {
      try {
        setProgress(0);
        const m = await uploadFile<MediaAssetDto>(ws('/media'), f, setProgress);
        onUploaded?.(m);
      } catch (err) {
        setError(`${f.name}: ${(err as Error).message}`);
      }
    }
    setProgress(null);
    qc.invalidateQueries({ queryKey: ['media'] });
    if (input.current) input.current.value = '';
  };

  return (
    <div>
      <input ref={input} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
      <Button onClick={() => input.current?.click()} loading={progress !== null}>
        <Upload className="size-4" /> {progress !== null ? `%${progress}` : label}
      </Button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

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
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const confirm = () => {
    const items = picked.map((id) => media.data!.find((m) => m.id === id)!).filter(Boolean);
    onPick(items);
    setPicked([]);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Medya kütüphanesi" wide>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted">Gönderiye eklemek için seçin. Sıra, seçim sırasına göre olur.</p>
        <UploadButton onUploaded={(m) => setPicked((p) => [...p, m.id])} />
      </div>
      {media.isLoading ? (
        <Spinner />
      ) : !media.data?.length ? (
        <EmptyState title="Kütüphane boş" body="Görsel veya video yükleyerek başlayın." />
      ) : (
        <div className="grid max-h-[55vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
          {media.data.map((m) => {
            const already = selectedIds.includes(m.id);
            const idx = picked.indexOf(m.id);
            return (
              <button
                key={m.id}
                type="button"
                disabled={already}
                onClick={() => toggle(m.id)}
                className={cx(
                  'relative aspect-square overflow-hidden rounded-lg ring-2 ring-offset-1 transition',
                  idx >= 0 ? 'ring-accent' : 'ring-transparent hover:ring-gray-300',
                  already && 'opacity-40',
                )}
                title={m.fileName}
              >
                <MediaThumb m={m} className="size-full" />
                {idx >= 0 && (
                  <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-white">
                    {idx + 1}
                  </span>
                )}
                {already && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Check className="size-5 text-white drop-shadow" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      {media.error && <Notice tone="error">{(media.error as Error).message}</Notice>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Vazgeç
        </Button>
        <Button variant="primary" disabled={!picked.length} onClick={confirm}>
          {picked.length ? `${picked.length} öğe ekle` : 'Ekle'}
        </Button>
      </div>
    </Modal>
  );
}
