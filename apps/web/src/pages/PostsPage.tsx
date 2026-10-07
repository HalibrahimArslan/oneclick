import type { PostDto } from '@oneclick/shared';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MediaThumb } from '../components/MediaLibrary';
import { fmtDate, PostDetailModal } from '../components/PostDetail';
import { Button, Card, cx, EmptyState, PageHeader, PlatformBadge, Spinner, StatusPill } from '../components/ui';
import { usePosts } from '../lib/queries';

const TABS = [
  { key: 'upcoming', label: 'Planlanmış', status: 'SCHEDULED,PUBLISHING' },
  { key: 'published', label: 'Yayınlanmış', status: 'PUBLISHED,PARTIALLY_FAILED' },
  { key: 'failed', label: 'Başarısız', status: 'FAILED,PARTIALLY_FAILED' },
  { key: 'drafts', label: 'Taslaklar', status: 'DRAFT,PENDING_APPROVAL' },
] as const;

export function PostsPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((t) => t.key === params.get('tab')) ?? TABS[0];
  const posts = usePosts({ status: tab.status });
  const [open, setOpen] = useState<string | null>(params.get('highlight'));

  const sorted = [...(posts.data ?? [])].sort((a, b) => {
    const ta = new Date(a.publishedAt ?? a.scheduledAt ?? a.createdAt).getTime();
    const tb = new Date(b.publishedAt ?? b.scheduledAt ?? b.createdAt).getTime();
    return tab.key === 'upcoming' ? ta - tb : tb - ta;
  });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Gönderiler"
        actions={
          <Link to="/compose">
            <Button variant="primary">Gönderi oluştur</Button>
          </Link>
        }
      />
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={t.key === tab.key}
            onClick={() => setParams({ tab: t.key })}
            className={cx(
              '-mb-px shrink-0 border-b-2 px-3 py-2 text-sm',
              t.key === tab.key ? 'border-ink font-medium text-ink' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {posts.isLoading ? (
        <Spinner />
      ) : !sorted.length ? (
        <EmptyState title="Burada gönderi yok" />
      ) : (
        <Card className="divide-y divide-line">
          {sorted.map((p) => (
            <PostRow key={p.id} post={p} onOpen={() => setOpen(p.id)} highlighted={params.get('highlight') === p.id} />
          ))}
        </Card>
      )}

      <PostDetailModal postId={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function PostRow({ post, onOpen, highlighted }: { post: PostDto; onOpen(): void; highlighted: boolean }) {
  return (
    <button
      onClick={onOpen}
      className={cx('flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-gray-50', highlighted && 'bg-accent-soft')}
    >
      {post.media[0] ? (
        <MediaThumb m={post.media[0]} className="size-12 shrink-0 rounded-md" />
      ) : (
        <div className="size-12 shrink-0 rounded-md bg-gray-100" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{post.text || <span className="text-muted">(metin yok)</span>}</p>
        <div className="mt-1 flex items-center gap-1.5">
          {post.targets.map((t) => (
            <span key={t.id} title={`${t.account.name}: ${t.status}`} className={cx(t.status === 'FAILED' && 'rounded ring-2 ring-red-400')}>
              <PlatformBadge platform={t.account.platform} />
            </span>
          ))}
          <span className="ml-1 text-xs text-muted">{fmtDate(post.publishedAt ?? post.scheduledAt ?? post.createdAt)}</span>
        </div>
      </div>
      <StatusPill status={post.status} />
    </button>
  );
}
