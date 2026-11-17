import { canApprove, canPublishDirectly, type ApprovalDto, type PostDto } from '@oneclick/shared';
import { Check, ExternalLink, Pencil, RotateCcw, Send, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ws } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtLong } from '../lib/format';
import { usePost, usePostAction } from '../lib/queries';
import { useFeedback } from './feedback';
import { AccountAvatar, PlatformIcon, StatusPill } from './identity';
import { MediaThumb } from './MediaLibrary';
import { PostPreview } from './PostPreview';
import { Button, Input, Modal, Notice, SegmentedControl, Skeleton } from './ui';

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

        <ApprovalNote post={post} />

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

/** Onay bekliyor / reddedildi / onaylandı bilgisi */
function ApprovalNote({ post }: { post: PostDto }) {
  const a: ApprovalDto | null = post.approval;
  if (!a) return null;
  if (post.status === 'PENDING_APPROVAL' && a.decision === 'PENDING') {
    return <Notice tone="warning">{a.requestedBy.name} {fmtLong(a.requestedAt)} tarihinde onay istedi. Onaylanınca planlanan zamanda yayınlanır.</Notice>;
  }
  if (post.status === 'DRAFT' && a.decision === 'REJECTED') {
    return (
      <Notice tone="error">
        <strong className="font-semibold">{a.decidedBy?.name ?? 'Onaylayıcı'} reddetti:</strong> {a.comment}
      </Notice>
    );
  }
  if (a.decision === 'APPROVED' && a.decidedBy) {
    return (
      <p className="text-small text-muted">
        {a.decidedBy.name} onayladı · {a.decidedAt && fmtLong(a.decidedAt)}
        {a.comment && <span className="text-ink-2"> · “{a.comment}”</span>}
      </p>
    );
  }
  return null;
}

function DetailActions({ post, onDone }: { post: PostDto; onDone(): void }) {
  const navigate = useNavigate();
  const { confirm, toast } = useFeedback();
  const { workspace } = useAuth();
  const publishNow = usePostAction(() => api(ws(`/posts/${post.id}/publish-now`), { method: 'POST' }));
  const remove = usePostAction(() => api(ws(`/posts/${post.id}`), { method: 'DELETE' }));
  const approve = usePostAction(() => api(ws(`/posts/${post.id}/approve`), { body: {} }));
  const reject = usePostAction((comment: string) => api(ws(`/posts/${post.id}/reject`), { body: { comment } }));
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const role = workspace?.role;
  // Onaylayıcı ve İzleyici gönderi düzenleyemez/silemez (API'de MinRole EDITOR)
  const canEdit = role === 'OWNER' || role === 'ADMIN' || role === 'EDITOR';
  const pendingForMe = post.status === 'PENDING_APPROVAL' && canApprove(role);
  const editable = canEdit && !['PUBLISHING', 'PUBLISHED'].includes(post.status);
  const canPublish = canPublishDirectly(role, workspace?.approvalRequired) && ['DRAFT', 'SCHEDULED', 'PENDING_APPROVAL'].includes(post.status);
  const actionError = publishNow.error ?? remove.error ?? approve.error ?? reject.error;

  if (rejecting) {
    const submitReject = (e: React.FormEvent) => {
      e.preventDefault();
      reject.mutate(reason.trim(), {
        onSuccess: () => {
          toast('Gönderi reddedildi; yazarı gerekçeyi görecek.', 'success');
          setRejecting(false);
          setReason('');
        },
      });
    };
    return (
      <form onSubmit={submitReject} className="flex w-full flex-wrap items-center gap-2">
        <div className="min-w-48 flex-1">
          <Input autoFocus aria-label="Reddetme gerekçesi" placeholder="Reddetme gerekçesi (ör. görseli değiştirin)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
        </div>
        {reject.error && <span className="text-caption text-failed-fg">{(reject.error as Error).message}</span>}
        <Button variant="ghost" onClick={() => setRejecting(false)}>
          Vazgeç
        </Button>
        <Button type="submit" variant="danger" icon={X} loading={reject.isPending} disabled={reason.trim().length < 3}>
          Reddet
        </Button>
      </form>
    );
  }

  const onDelete = async () => {
    const ok = await confirm({
      title: 'Gönderi silinsin mi?',
      body:
        post.status === 'PUBLISHED' || post.status === 'PARTIALLY_FAILED'
          ? 'Gönderi panelden silinir. Platformlarda yayınlanmış paylaşımlar yerinde kalır.'
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
      {canEdit ? (
        <Button variant="danger" icon={Trash2} loading={remove.isPending} disabled={post.status === 'PUBLISHING'} onClick={onDelete} className="mr-auto">
          Sil
        </Button>
      ) : (
        <span className="mr-auto" />
      )}
      {actionError && <span className="text-caption text-failed-fg">{(actionError as Error).message}</span>}
      {editable && (
        <>
          <Button icon={Pencil} variant={canPublish || pendingForMe ? 'secondary' : 'primary'} onClick={() => navigate(`/posts/${post.id}/edit`)}>
            Düzenle
          </Button>
          {canPublish && !pendingForMe && (
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
      {pendingForMe && (
        <>
          <Button icon={X} onClick={() => setRejecting(true)}>
            Reddet
          </Button>
          <Button
            variant="primary"
            icon={Check}
            loading={approve.isPending}
            onClick={() => approve.mutate(undefined, { onSuccess: () => toast('Gönderi onaylandı ve planlandı.', 'success') })}
          >
            Onayla
          </Button>
        </>
      )}
    </>
  );
}
