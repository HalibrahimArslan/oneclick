import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { MediaThumb, UploadButton } from '../components/MediaLibrary';
import { EmptyState, Notice, PageHeader, Spinner } from '../components/ui';
import { api, ws } from '../lib/api';
import { useMedia } from '../lib/queries';

const size = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`);

export function MediaPage() {
  const media = useMedia();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const remove = async (id: string) => {
    setError(null);
    try {
      await api(ws(`/media/${id}`), { method: 'DELETE' });
      qc.invalidateQueries({ queryKey: ['media'] });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Medya" subtitle="Görsel ve videolarınız; gönderilerde tekrar kullanabilirsiniz." actions={<UploadButton />} />
      {error && (
        <div className="mb-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      {media.isLoading ? (
        <Spinner />
      ) : !media.data?.length ? (
        <EmptyState title="Henüz medya yok" body="Instagram için JPEG, TikTok ve Reels için MP4 video önerilir." />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {media.data.map((m) => (
            <figure key={m.id} className="group overflow-hidden rounded-xl border border-line bg-white">
              <MediaThumb m={m} className="aspect-square w-full" />
              <figcaption className="flex items-center gap-2 px-2.5 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{m.fileName}</p>
                  <p className="text-[11px] text-muted">
                    {m.width && m.height ? `${m.width}×${m.height} · ` : ''}
                    {size(m.sizeBytes)}
                  </p>
                </div>
                <button
                  onClick={() => remove(m.id)}
                  className="rounded p-1 text-muted opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-700"
                  aria-label={`${m.fileName} sil`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
