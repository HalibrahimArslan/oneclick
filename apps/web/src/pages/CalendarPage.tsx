import type { PostDto } from '@oneclick/shared';
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { tr } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PostDetailModal } from '../components/PostDetail';
import { Button, cx, Notice, PageHeader, PlatformBadge, STATUS_DOT } from '../components/ui';
import { api, ws } from '../lib/api';
import { usePostAction, usePosts } from '../lib/queries';

const postDate = (p: PostDto) => new Date(p.scheduledAt ?? p.publishedAt ?? p.createdAt);
const MOVABLE = ['DRAFT', 'SCHEDULED', 'FAILED', 'PARTIALLY_FAILED'];

export function CalendarPage() {
  const navigate = useNavigate();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [open, setOpen] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days = useMemo(() => {
    const out: Date[] = [];
    for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) out.push(d);
    return out;
  }, [gridStart.getTime(), gridEnd.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps

  const posts = usePosts({ from: gridStart.toISOString(), to: addDays(gridEnd, 1).toISOString() });
  const move = usePostAction(({ id, at }: { id: string; at: Date }) =>
    api(ws(`/posts/${id}/schedule`), { method: 'PATCH', body: { scheduledAt: at.toISOString() } }),
  );

  const byDay = useMemo(() => {
    const map = new Map<string, PostDto[]>();
    for (const p of posts.data ?? []) {
      const k = format(postDate(p), 'yyyy-MM-dd');
      map.set(k, [...(map.get(k) ?? []), p]);
    }
    for (const list of map.values()) list.sort((a, b) => postDate(a).getTime() - postDate(b).getTime());
    return map;
  }, [posts.data]);

  const onDrop = (day: Date, e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData('text/post-id');
    const post = posts.data?.find((p) => p.id === id);
    if (!post) return;
    const old = postDate(post);
    const at = new Date(day);
    at.setHours(old.getHours(), old.getMinutes(), 0, 0);
    if (isSameDay(old, at)) return;
    if (at < new Date()) {
      move.reset();
      window.alert('Gönderi geçmiş bir güne taşınamaz.');
      return;
    }
    move.mutate({ id, at });
  };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={format(month, 'LLLL yyyy', { locale: tr }).replace(/^./, (c) => c.toUpperCase())}
        subtitle="Gönderileri sürükleyip başka bir güne taşıyabilirsiniz; saat korunur."
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => setMonth(startOfMonth(new Date()))}>
              Bugün
            </Button>
            <Button size="sm" onClick={() => setMonth((m) => addMonths(m, -1))} aria-label="Önceki ay">
              <ChevronLeft className="size-4" />
            </Button>
            <Button size="sm" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Sonraki ay">
              <ChevronRight className="size-4" />
            </Button>
          </>
        }
      />

      {move.error && (
        <div className="mb-3">
          <Notice tone="error">{(move.error as Error).message}</Notice>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <div className="grid min-w-[760px] grid-cols-7 border-b border-line text-xs font-medium text-muted">
          {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((d) => (
            <div key={d} className="px-2 py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid min-w-[760px] grid-cols-7">
          {days.map((day) => {
            const key = format(day, 'yyyy-MM-dd');
            const list = byDay.get(key) ?? [];
            const past = startOfDay(day) < startOfDay(new Date());
            return (
              <div
                key={key}
                onDragOver={(e) => {
                  if (past) return;
                  e.preventDefault();
                  setDragOver(key);
                }}
                onDragLeave={() => setDragOver((k) => (k === key ? null : k))}
                onDrop={(e) => onDrop(day, e)}
                className={cx(
                  'group relative min-h-28 border-r border-b border-line p-1.5 [&:nth-child(7n)]:border-r-0',
                  !isSameMonth(day, month) && 'bg-gray-50/70',
                  dragOver === key && 'bg-accent-soft',
                )}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className={cx(
                      'flex size-6 items-center justify-center rounded-full text-xs',
                      isToday(day) ? 'bg-ink font-semibold text-white' : isSameMonth(day, month) ? 'text-ink' : 'text-gray-400',
                    )}
                  >
                    {format(day, 'd')}
                  </span>
                  {!past && (
                    <button
                      onClick={() => navigate('/compose')}
                      className="rounded p-0.5 text-muted opacity-0 group-hover:opacity-100 hover:bg-gray-100"
                      aria-label="Bu güne gönderi oluştur"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  )}
                </div>
                <div className="space-y-1">
                  {list.slice(0, 4).map((p) => (
                    <button
                      key={p.id}
                      draggable={MOVABLE.includes(p.status)}
                      onDragStart={(e) => e.dataTransfer.setData('text/post-id', p.id)}
                      onClick={() => setOpen(p.id)}
                      className="flex w-full items-center gap-1.5 rounded-md border border-line bg-white px-1.5 py-1 text-left text-[11px] hover:border-gray-400"
                      title={p.text}
                    >
                      <span className={cx('size-1.5 shrink-0 rounded-full', STATUS_DOT[p.status])} />
                      <span className="shrink-0 text-muted tabular-nums">{format(postDate(p), 'HH:mm')}</span>
                      <span className="flex shrink-0 -space-x-1">
                        {[...new Set(p.targets.map((t) => t.account.platform))].map((pl) => (
                          <PlatformBadge key={pl} platform={pl} size={12} />
                        ))}
                      </span>
                      <span className="truncate">{p.text || 'Medya'}</span>
                    </button>
                  ))}
                  {list.length > 4 && <p className="px-1 text-[11px] text-muted">+{list.length - 4} daha</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <PostDetailModal postId={open} onClose={() => setOpen(null)} />
    </div>
  );
}
