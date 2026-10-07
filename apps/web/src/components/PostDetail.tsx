import type { PostDto } from '@oneclick/shared';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { ExternalLink, Pencil, RotateCcw, Send, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, ws } from '../lib/api';
import { usePost, usePostAction } from '../lib/queries';
import { MediaThumb } from './MediaLibrary';
import { AccountAvatar, Button, Modal, Notice, Spinner, StatusPill } from './ui';

export const fmtDate = (iso: string | null) => (iso ? format(new Date(iso), 'd MMMM yyyy, HH:mm', { locale: tr }) : '—');

export function PostDetailModal({ postId, onClose }: { postId: string | null; onClose(): void }) {
  const post = usePost(postId ?? undefined);
  return (
    <Modal open={Boolean(postId)} onClose={onClose} title="Gönderi" wide>
      {post.isLoading || !post.data ? <Spinner /> : <PostDetail post={post.data} onDone={onClose} />}
    </Modal>
  );
}

function PostDetail({ post, onDone }: { post: PostDto; onDone(): void }) {
  const navigate = useNavigate();
  const retry = usePostAction((tid: string) => api(ws(`/post-targets/${tid}/retry`), { method: 'POST' }));
  const publishNow = usePostAction(() => api(ws(`/posts/${post.id}/publish-now`), { method: 'POST' }));
  const remove = usePostAction(() => api(ws(`/posts/${post.id}`), { method: 'DELETE' }));
  const editable = !['PUBLISHING', 'PUBLISHED'].includes(post.status);
  const actionError = (retry.error ?? publishNow.error ?? remove.error) as Error | null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <StatusPill status={post.status} />
        <span className="text-muted">
          {post.status === 'PUBLISHED' ? 'Yayın: ' : post.scheduledAt ? 'Plan: ' : 'Oluşturma: '}
          {fmtDate(post.publishedAt ?? post.scheduledAt ?? post.createdAt)}
        </span>
        <span className="text-muted">· {post.author.name}</span>
      </div>

      {post.text && <p className="text-sm leading-relaxed whitespace-pre-wrap">{post.text}</p>}

      {post.media.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {post.media.map((m) => (
            <MediaThumb key={m.id} m={m} className="size-20 rounded-lg" />
          ))}
        </div>
      )}

      <div>
        <p className="mb-2 text-[13px] font-medium">Hesaplar</p>
        <div className="divide-y divide-line rounded-lg border border-line">
          {post.targets.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <AccountAvatar name={t.account.name} url={t.account.avatarUrl} platform={t.account.platform} size={30} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{t.account.name}</p>
                {t.errorMessage && <p className="text-xs text-red-700">{t.errorMessage}</p>}
                {t.publishedAt && <p className="text-xs text-muted">{fmtDate(t.publishedAt)}</p>}
              </div>
              <StatusPill status={t.status} kind="target" />
              {t.permalink && (
                <a href={t.permalink} target="_blank" rel="noreferrer" className="text-muted hover:text-ink" aria-label="Platformda aç">
                  <ExternalLink className="size-4" />
                </a>
              )}
              {t.status === 'FAILED' && (
                <Button size="sm" onClick={() => retry.mutate(t.id)} loading={retry.isPending && retry.variables === t.id}>
                  <RotateCcw className="size-3.5" /> Tekrar dene
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>

      {actionError && <Notice tone="error">{actionError.message}</Notice>}

      <div className="flex flex-wrap justify-between gap-2 border-t border-line pt-4">
        <Button
          variant="danger"
          loading={remove.isPending}
          disabled={post.status === 'PUBLISHING'}
          onClick={async () => {
            const msg =
              post.status === 'PUBLISHED'
                ? 'Gönderi OneClick’ten silinsin mi? Platformlardaki paylaşımlar silinmez.'
                : 'Gönderi silinsin mi?';
            if (window.confirm(msg)) {
              await remove.mutateAsync(undefined);
              onDone();
            }
          }}
        >
          <Trash2 className="size-4" /> Sil
        </Button>
        {editable && (
          <div className="flex gap-2">
            <Button onClick={() => navigate(`/posts/${post.id}/edit`)}>
              <Pencil className="size-4" /> Düzenle
            </Button>
            <Button variant="primary" loading={publishNow.isPending} onClick={() => publishNow.mutate(undefined)}>
              <Send className="size-4" /> Şimdi yayınla
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
