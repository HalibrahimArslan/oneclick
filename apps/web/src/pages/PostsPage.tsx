import type { PostDto, PostStatus } from '@oneclick/shared';
import { format } from 'date-fns';
import { AlertCircle, CalendarClock, FilePen, MoreHorizontal, Pencil, Plus, Rocket, RotateCcw, Send, Trash2, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useFeedback } from '../components/feedback';
import { AvatarStack, statusBar, StatusPill } from '../components/identity';
import { MediaThumb } from '../components/MediaLibrary';
import { PostDetailModal } from '../components/PostDetail';
import { Button, Card, cx, EmptyState, IconButton, MenuItem, PageHeader, Popover, Skeleton, Tabs } from '../components/ui';
import { api, ws } from '../lib/api';
import { dayHeading, fmtShort } from '../lib/format';
import { usePostAction, usePosts } from '../lib/queries';

type TabKey = 'upcoming' | 'drafts' | 'failed' | 'published';
const TABS: { key: TabKey; label: string; match: PostStatus[]; empty: { icon: LucideIcon; title: string; body: string } }[] = [
  {
    key: 'upcoming',
    label: 'Planlanmış',
    match: ['SCHEDULED', 'PUBLISHING'],
    empty: { icon: CalendarClock, title: 'Planlanmış gönderi yok', body: 'Takvimde bir gün seçerek ya da yeni gönderi oluşturarak başlayın.' },
  },
  {
    key: 'drafts',
    label: 'Taslaklar',
    match: ['DRAFT', 'PENDING_APPROVAL'],
    empty: { icon: FilePen, title: 'Taslak yok', body: 'Kaydettiğiniz taslaklar ve onay bekleyen gönderiler burada görünür.' },
  },
  {
    key: 'failed',
    label: 'Başarısız',
    match: ['FAILED', 'PARTIALLY_FAILED'],
    empty: { icon: Rocket, title: 'Başarısız gönderi yok', body: 'Tüm yayınlar sorunsuz. Bir hata olursa burada düzeltebilirsiniz.' },
  },
  {
    key: 'published',
    label: 'Yayınlanmış',
    match: ['PUBLISHED', 'PARTIALLY_FAILED'],
    empty: { icon: Send, title: 'Henüz yayınlanmış gönderi yok', body: 'Yayınlanan gönderiler burada en yeniden eskiye listelenir.' },
  },
];

const whenOf = (p: PostDto) => p.publishedAt ?? p.scheduledAt;

export function PostsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((t) => t.key === params.get('tab')) ?? TABS[0];
  const highlight = params.get('highlight');
  const posts = usePosts({});
  const [open, setOpen] = useState<string | null>(null);

  const counts = useMemo(
    () => Object.fromEntries(TABS.map((t) => [t.key, (posts.data ?? []).filter((p) => t.match.includes(p.status)).length])) as Record<TabKey, number>,
    [posts.data],
  );

  // Gün başlıklarına göre gruplanmış liste; taslaklarda tarihsizler en sonda
  const groups = useMemo(() => {
    const list = (posts.data ?? []).filter((p) => tab.match.includes(p.status));
    const asc = tab.key === 'upcoming' || tab.key === 'drafts';
    list.sort((a, b) => {
      const ta = whenOf(a) ? new Date(whenOf(a)!).getTime() : asc ? Infinity : -Infinity;
      const tb = whenOf(b) ? new Date(whenOf(b)!).getTime() : asc ? Infinity : -Infinity;
      return asc ? ta - tb : tb - ta;
    });
    const out: { key: string; label: string; items: PostDto[] }[] = [];
    for (const p of list) {
      const w = whenOf(p);
      const key = w ? format(new Date(w), 'yyyy-MM-dd') : 'none';
      const last = out.at(-1);
      if (last?.key === key) last.items.push(p);
      else out.push({ key, label: w ? dayHeading(new Date(w)) : 'Tarihsiz', items: [p] });
    }
    return out;
  }, [posts.data, tab]);

  useEffect(() => {
    if (!highlight || posts.isLoading) return;
    document.getElementById(`post-${highlight}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const t = setTimeout(() => setParams((p) => (p.delete('highlight'), p), { replace: true }), 2500);
    return () => clearTimeout(t);
  }, [highlight, posts.isLoading, setParams]);

  return (
    <div className="mx-auto max-w-220">
      <PageHeader title="Gönderiler" actions={<Button icon={Plus} onClick={() => navigate('/compose')}>Gönderi oluştur</Button>} />
      <Tabs
        value={tab.key}
        onChange={(k) => setParams({ tab: k })}
        tabs={TABS.map((t) => ({ value: t.key, label: t.label, count: posts.data ? counts[t.key] : undefined }))}
      />

      <div className="mt-6">
        {posts.isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="h-5 w-12" />
                <Skeleton className="h-36 flex-1 rounded-card" />
              </div>
            ))}
          </div>
        ) : !groups.length ? (
          <Card>
            <EmptyState
              icon={tab.empty.icon}
              title={tab.empty.title}
              body={tab.empty.body}
              action={
                tab.key !== 'published' && (
                  <Button variant="primary" icon={Plus} onClick={() => navigate('/compose')}>
                    Gönderi oluştur
                  </Button>
                )
              }
            />
          </Card>
        ) : (
          <div className="space-y-7">
            {groups.map((g) => (
              <section key={g.key}>
                <h2 className="mb-3 text-small font-semibold text-ink">{g.label}</h2>
                <div className="space-y-3">
                  {g.items.map((p) => (
                    <div key={p.id} id={`post-${p.id}`} className="flex gap-3 sm:gap-4">
                      <span className="w-11 shrink-0 pt-3.5 text-small font-medium text-muted tabular-nums sm:w-14">
                        {whenOf(p) ? format(new Date(whenOf(p)!), 'HH:mm') : '—'}
                      </span>
                      <PostCard post={p} onOpen={() => setOpen(p.id)} highlighted={highlight === p.id} />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <PostDetailModal postId={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function PostCard({ post, onOpen, highlighted }: { post: PostDto; onOpen(): void; highlighted: boolean }) {
  const navigate = useNavigate();
  const { confirm, toast } = useFeedback();
  const publishNow = usePostAction(() => api(ws(`/posts/${post.id}/publish-now`), { method: 'POST' }));
  const retry = usePostAction(async (ids: string[]) => {
    for (const id of ids) await api(ws(`/post-targets/${id}/retry`), { method: 'POST' });
  });
  const remove = usePostAction(() => api(ws(`/posts/${post.id}`), { method: 'DELETE' }));

  const failed = post.targets.filter((t) => t.status === 'FAILED');
  const editable = !['PUBLISHING', 'PUBLISHED'].includes(post.status);
  const canPublish = ['DRAFT', 'SCHEDULED', 'PENDING_APPROVAL'].includes(post.status);
  const accounts = post.targets.map((t) => ({ ...t.account }));
  const first = post.media[0];
  const err = (publishNow.error ?? retry.error ?? remove.error) as Error | null;

  const onDelete = async () => {
    const ok = await confirm({ title: 'Gönderi silinsin mi?', body: 'Bu işlem geri alınamaz.', action: 'Sil', danger: true });
    if (ok) remove.mutate(undefined, { onSuccess: () => toast('Gönderi silindi.', 'success') });
  };

  return (
    <article
      className={cx(
        // overflow-hidden yok: "Diğer işlemler" menüsü kartın dışına taşabilmeli
        'relative min-w-0 flex-1 rounded-card border bg-surface transition-colors',
        highlighted ? 'border-brand-200 bg-brand-50' : 'border-line hover:border-line-strong',
      )}
    >
      <span className={cx('absolute inset-y-0 left-0 w-0.75 rounded-l-[11px]', statusBar(post.status))} />
      <button type="button" onClick={onOpen} className="flex w-full gap-4 p-4 pl-5 text-left">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2.5">
            <AvatarStack accounts={accounts} size={24} />
            <span className="truncate text-small font-medium">
              {accounts[0]?.name}
              {accounts.length > 1 && <span className="font-normal text-muted"> +{accounts.length - 1}</span>}
            </span>
          </div>
          <p className="line-clamp-3 text-body text-ink-2">{post.text || <span className="text-faint">Metin yok</span>}</p>
        </div>
        {first && (
          <span className="relative shrink-0">
            <MediaThumb m={first} className="size-20 rounded-control border border-line sm:size-22" />
            {post.media.length > 1 && (
              <span className="absolute top-1 right-1 rounded-full bg-ink/70 px-1.5 text-micro font-medium text-white">1/{post.media.length}</span>
            )}
          </span>
        )}
      </button>

      <div className="flex flex-wrap items-center gap-2 border-t border-line py-2.5 pr-2.5 pl-5">
        <StatusPill status={post.status} />
        {failed.length > 0 && (
          <span className="flex min-w-0 items-center gap-1 text-caption text-failed-fg" title={failed.map((t) => `${t.account.name}: ${t.errorMessage}`).join('\n')}>
            <AlertCircle className="size-3.5 shrink-0" />
            <span className="truncate">
              {failed[0].account.name}: {failed[0].errorMessage ?? 'Yayın başarısız'}
              {failed.length > 1 && ` (+${failed.length - 1})`}
            </span>
          </span>
        )}
        {!post.scheduledAt && post.status === 'DRAFT' && (
          <span className="flex items-center gap-1 text-caption text-muted">
            <TriangleAlert className="size-3.5" /> Tarih seçilmedi
          </span>
        )}
        {post.status === 'DRAFT' && post.scheduledAt && <span className="text-caption text-muted">{fmtShort(post.scheduledAt)} için taslak</span>}
        {err && <span className="text-caption text-failed-fg">{err.message}</span>}
        <span className="flex-1" />
        {failed.length > 0 && (
          <Button size="sm" icon={RotateCcw} loading={retry.isPending} onClick={() => retry.mutate(failed.map((t) => t.id))}>
            Tekrar dene
          </Button>
        )}
        {editable && (
          <Button size="sm" variant="ghost" icon={Pencil} onClick={() => navigate(`/posts/${post.id}/edit`)}>
            Düzenle
          </Button>
        )}
        {canPublish && (
          <Button
            size="sm"
            icon={Send}
            loading={publishNow.isPending}
            onClick={() => publishNow.mutate(undefined, { onSuccess: () => toast('Gönderi yayın kuyruğuna alındı.', 'success') })}
          >
            Şimdi yayınla
          </Button>
        )}
        <Popover align="end" className="w-44" trigger={({ toggle }) => <IconButton icon={MoreHorizontal} size="sm" label="Diğer işlemler" onClick={toggle} />}>
          {(close) => (
            <div role="menu">
              <MenuItem
                icon={Trash2}
                danger
                disabled={post.status === 'PUBLISHING'}
                onClick={() => {
                  close();
                  onDelete();
                }}
              >
                Sil
              </MenuItem>
            </div>
          )}
        </Popover>
      </div>
    </article>
  );
}
