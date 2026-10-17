import type { PostDto } from '@oneclick/shared';
import { ExternalLink, Pencil, RotateCcw, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ws } from '../lib/api';
import { fmtLong } from '../lib/format';
import { usePost, usePostAction } from '../lib/queries';
import { useFeedback } from './feedback';
import { AccountAvatar, PlatformIcon, StatusPill } from './identity';
import { MediaThumb } from './MediaLibrary';
import { PostPreview } from './PostPreview';
import { Button, Modal, Notice, SegmentedControl, Skeleton } from './ui';

export function PostDetailModal({ postId, onClose }: { postId: string | null; onClose(): void }) {
  const post = usePost(postId ?? undefined);
  const p = post.data;
  return (
    <Modal open={Boolean(postId)} onClose={onClose} title="Gönderi" size="lg" footer={p && <DetailActions post={p} onDone={onClose} />}>
      {post.isLoading || !p ? (
        <div className="space-y-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-24" />
          <Skeleton className="h-32" />
        </div>
      ) : (
        <PostDetail post={p} />
      )}
    </Modal>
  );
}

export function timeLabel(p: PostDto) {
  if (p.publishedAt) return `Yayın: ${fmtLong(p.publishedAt)}`;
  if (p.scheduledAt) return `Plan: ${fmtLong(p.scheduledAt)}`;
  return `Oluşturma: ${fmtLong(p.createdAt)}`;
}

function PostDetail({ post }: { post: PostDto }) {
  const retry = usePostAction((tid: string) => api(ws(`/post-targets/${tid}/retry`), { method: 'POST' }));
  const previewTargets = post.targets.filter((t, i, arr) => arr.findIndex((x) => x.account.platform === t.account.platform) === i);
  const [tab, setTab] = useState(previewTargets[0]?.id ?? '');
  const shown = previewTargets.find((t) => t.id === tab) ?? previewTargets[0];

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-small text-muted">
          <StatusPill status={post.status} />
          <span>{timeLabel(post)}</span>
          <span aria-hidden>·</span>
          <span>{post.author.name}</span>
        </div>

        {post.text ? (
          <p className="text-body leading-relaxed whitespace-pre-wrap text-ink-2">{post.text}</p>
        ) : (
          <p className="text-small text-faint">Metin yok</p>
        )}

        {post.media.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {post.media.map((m) => (
              <MediaThumb key={m.id} m={m} className="size-20 rounded-control border border-line" />
            ))}
          </div>
        )}

        <div>
          <p className="mb-2 text-small font-semibold">Hesaplar</p>
          <div className="divide-y divide-line rounded-card border border-line">
            {post.targets.map((t) => (
              <div key={t.id} className="px-3.5 py-3">
                <div className="flex items-center gap-3">
                  <AccountAvatar name={t.account.name} url={t.account.avatarUrl} platform={t.account.platform} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-small font-medium">{t.account.name}</p>
                    <p className="truncate text-caption text-muted">
                      {t.publishedAt ? fmtLong(t.publishedAt) : t.account.username ? `@${t.account.username}` : ''}
                    </p>
                  </div>
                  <StatusPill status={t.status} kind="target" />
                  {t.permalink && (
                    <a
                      href={t.permalink}
                      target="_blank"
                      rel="noreferrer"
                      className="flex size-8 items-center justify-center rounded-control text-muted hover:bg-subtle hover:text-ink"
                      aria-label="Platformda aç"
                      title="Platformda aç"
                    >
                      <ExternalLink className="size-4" strokeWidth={1.75} />
                    </a>
                  )}
                </div>
                {t.status === 'FAILED' && (
                  <div className="mt-2.5 ml-11">
                    <Notice
                      tone="error"
                      action={
                        <Button size="sm" icon={RotateCcw} onClick={() => retry.mutate(t.id)} loading={retry.isPending && retry.variables === t.id}>
                          Tekrar dene
                        </Button>
                      }
                    >
                      {t.errorMessage ?? 'Yayın başarısız oldu.'}
                    </Notice>
                  </div>
                )}
              </div>
            ))}
          </div>
          {retry.error && (
            <div className="mt-3">
              <Notice tone="error">{(retry.error as Error).message}</Notice>
            </div>
          )}
        </div>
      </div>

      {shown && (
        <div className="min-w-0 rounded-card bg-canvas p-3">
          {previewTargets.length > 1 && (
            <div className="mb-3">
              <SegmentedControl
                label="Önizleme platformu"
                size="sm"
                value={shown.id}
                onChange={setTab}
                options={previewTargets.map((t) => ({ value: t.id, label: <PlatformIcon platform={t.account.platform} size={14} /> }))}
              />
            </div>
          )}
          <PostPreview
            account={shown.account}
            text={shown.textOverride ?? post.text}
            media={post.media}
            postType={(shown.options as { postType?: string } | null)?.postType}
            customized={shown.textOverride !== null}
          />
        </div>
      )}
    </div>
  );
}

function DetailActions({ post, onDone }: { post: PostDto; onDone(): void }) {
  const navigate = useNavigate();
  const { confirm, toast } = useFeedback();
  const publishNow = usePostAction(() => api(ws(`/posts/${post.id}/publish-now`), { method: 'POST' }));
  const remove = usePostAction(() => api(ws(`/posts/${post.id}`), { method: 'DELETE' }));
  const editable = !['PUBLISHING', 'PUBLISHED'].includes(post.status);
  const canPublish = ['DRAFT', 'SCHEDULED', 'PENDING_APPROVAL'].includes(post.status);

  const onDelete = async () => {
    const ok = await confirm({
      title: 'Gönderi silinsin mi?',
      body:
        post.status === 'PUBLISHED' || post.status === 'PARTIALLY_FAILED'
          ? 'Gönderi OneClick’ten silinir. Platformlarda yayınlanmış paylaşımlar yerinde kalır.'
          : 'Bu işlem geri alınamaz.',
      action: 'Sil',
      danger: true,
    });
    if (!ok) return;
    await remove.mutateAsync(undefined);
    toast('Gönderi silindi.', 'success');
    onDone();
  };

  return (
    <>
      <Button variant="danger" icon={Trash2} loading={remove.isPending} disabled={post.status === 'PUBLISHING'} onClick={onDelete} className="mr-auto">
        Sil
      </Button>
      {(publishNow.error || remove.error) && (
        <span className="text-caption text-failed-fg">{((publishNow.error ?? remove.error) as Error).message}</span>
      )}
      {editable && (
        <>
          <Button icon={Pencil} variant={canPublish ? 'secondary' : 'primary'} onClick={() => navigate(`/posts/${post.id}/edit`)}>
            Düzenle
          </Button>
          {canPublish && (
            <Button
              variant="primary"
              icon={Send}
              loading={publishNow.isPending}
              onClick={() => publishNow.mutate(undefined, { onSuccess: () => toast('Gönderi yayın kuyruğuna alındı.', 'success') })}
            >
              Şimdi yayınla
            </Button>
          )}
        </>
      )}
    </>
  );
}
