import type { PostDto, PostStatus } from '@oneclick/shared';
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { tr } from 'date-fns/locale';
import { CalendarX2, ChevronDown, ChevronLeft, ChevronRight, PanelLeftClose, PanelLeftOpen, Plus, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AccountPicker } from '../components/AccountPicker';
import { useFeedback } from '../components/feedback';
import { PlatformIcon, StatusDot, statusBar } from '../components/identity';
import { MediaThumb } from '../components/MediaLibrary';
import { PostDetailModal } from '../components/PostDetail';
import { Button, Card, cx, EmptyState, IconButton, Notice, PageHeader, Popover, SegmentedControl, Select } from '../components/ui';
import { api, ws } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAccounts, usePostAction, usePosts } from '../lib/queries';
import { readLocal, writeLocal } from '../lib/storage';

type View = 'month' | 'week';
const DAY_NAMES = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const PANEL_KEY = 'oneclick.calendar.panel';
const WEEK = { weekStartsOn: 1 } as const;
const MOVABLE: PostStatus[] = ['DRAFT', 'SCHEDULED', 'FAILED', 'PARTIALLY_FAILED'];
const STATUS_FILTERS: { value: string; label: string; match: PostStatus[] }[] = [
  { value: 'all', label: 'Tüm durumlar', match: [] },
  { value: 'scheduled', label: 'Planlandı', match: ['SCHEDULED', 'PUBLISHING'] },
  { value: 'published', label: 'Yayınlandı', match: ['PUBLISHED', 'PARTIALLY_FAILED'] },
  { value: 'failed', label: 'Başarısız', match: ['FAILED', 'PARTIALLY_FAILED'] },
  { value: 'draft', label: 'Taslak ve onay', match: ['DRAFT', 'PENDING_APPROVAL'] },
];

/** Takvimde yeri olan tarih; tarihsiz taslaklar takvimde gösterilmez (DESIGN.md §5.1). */
const postDate = (p: PostDto) => {
  const iso = p.publishedAt ?? p.scheduledAt;
  return iso ? new Date(iso) : null;
};
const platformsOf = (p: PostDto) => [...new Set(p.targets.map((t) => t.account.platform))];
const cap = (s: string) => s.replace(/^./, (c) => c.toLocaleUpperCase('tr'));

/** Bir güne yeni gönderi için varsayılan saat: 09:00, bugün geçtiyse bir sonraki tam saat. */
function slotFor(day: Date) {
  const at = new Date(day);
  at.setHours(9, 0, 0, 0);
  if (at < new Date()) {
    const next = new Date();
    next.setHours(next.getHours() + 1, 0, 0, 0);
    return next;
  }
  return at;
}

export function CalendarPage() {
  const navigate = useNavigate();
  const { workspace } = useAuth();
  const { toast } = useFeedback();
  const [params, setParams] = useSearchParams();
  const view: View = (params.get('view') as View) ?? (window.innerWidth < 768 ? 'week' : 'month');
  const anchor = params.get('d') ? parseISO(params.get('d')!) : new Date();
  const [status, setStatus] = useState('all');
  const [open, setOpen] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  // Hesap paneli Agorapulse'taki gibi daraltılabilir; geniş ekranda varsayılan açık
  const [panel, setPanel] = useState(() => readLocal(PANEL_KEY, window.innerWidth >= 1536));
  const togglePanel = () => {
    writeLocal(PANEL_KEY, !panel);
    setPanel(!panel);
  };

  const setNav = (v: View, d: Date) => setParams({ view: v, d: format(d, 'yyyy-MM-dd') }, { replace: true });

  // Hesap filtresi: gizlenen hesaplar saklanır, böylece yeni bağlanan hesap varsayılan olarak görünür
  const accounts = useAccounts();
  const activeAccounts = (accounts.data ?? []).filter((a) => a.status !== 'DISCONNECTED');
  const hiddenKey = `oneclick.calendar.hidden.${workspace?.id}`;
  const [hidden, setHidden] = useState<string[]>(() => readLocal(hiddenKey, []));
  const selected = activeAccounts.filter((a) => !hidden.includes(a.id)).map((a) => a.id);
  const setSelected = (ids: string[]) => {
    const next = activeAccounts.filter((a) => !ids.includes(a.id)).map((a) => a.id);
    setHidden(next);
    writeLocal(hiddenKey, next);
  };

  const range =
    view === 'month'
      ? { start: startOfWeek(startOfMonth(anchor), WEEK), end: endOfWeek(endOfMonth(anchor), WEEK) }
      : { start: startOfWeek(anchor, WEEK), end: endOfWeek(anchor, WEEK) };
  const days = useMemo(() => {
    const out: Date[] = [];
    for (let d = range.start; d <= range.end; d = addDays(d, 1)) out.push(d);
    return out;
  }, [range.start.getTime(), range.end.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps

  const posts = usePosts({ from: range.start.toISOString(), to: addDays(range.end, 1).toISOString() });
  const move = usePostAction(({ id, at }: { id: string; at: Date }) =>
    api(ws(`/posts/${id}/schedule`), { method: 'PATCH', body: { scheduledAt: at.toISOString() } }),
  );

  const statusMatch = STATUS_FILTERS.find((s) => s.value === status)!.match;
  const visible = useMemo(() => {
    const sel = new Set(selected);
    return (posts.data ?? []).filter(
      (p) =>
        postDate(p) &&
        (!statusMatch.length || statusMatch.includes(p.status)) &&
        (!activeAccounts.length || p.targets.some((t) => sel.has(t.socialAccountId))),
    );
  }, [posts.data, statusMatch, selected.join(), activeAccounts.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const byDay = useMemo(() => {
    const map = new Map<string, PostDto[]>();
    for (const p of visible) {
      const k = format(postDate(p)!, 'yyyy-MM-dd');
      map.set(k, [...(map.get(k) ?? []), p]);
    }
    for (const list of map.values()) list.sort((a, b) => postDate(a)!.getTime() - postDate(b)!.getTime());
    return map;
  }, [visible]);

  const onDrop = (day: Date, e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData('text/post-id');
    const post = posts.data?.find((p) => p.id === id);
    const old = post && postDate(post);
    if (!post || !old) return;
    const at = new Date(day);
    at.setHours(old.getHours(), old.getMinutes(), 0, 0);
    if (isSameDay(old, at)) return;
    if (at < new Date()) return toast('Gönderi geçmiş bir zamana taşınamaz.', 'warning');
    move.mutate({ id, at }, { onSuccess: () => toast(`Gönderi ${format(at, 'd MMMM HH:mm', { locale: tr })} tarihine taşındı.`, 'success') });
  };

  const dropProps = (day: Date, key: string) => {
    const past = startOfDay(day) < startOfDay(new Date());
    return {
      onDragOver: (e: React.DragEvent) => {
        if (past) return;
        e.preventDefault();
        setDragOver(key);
      },
      onDragLeave: () => setDragOver((k) => (k === key ? null : k)),
      onDrop: (e: React.DragEvent) => onDrop(day, e),
    };
  };
  const compose = (day: Date) => navigate(`/compose?at=${encodeURIComponent(slotFor(day).toISOString())}`);

  const period =
    view === 'month'
      ? cap(format(anchor, 'LLLL yyyy', { locale: tr }))
      : isSameMonth(range.start, range.end)
        ? `${format(range.start, 'd')}–${format(range.end, 'd MMMM yyyy', { locale: tr })}`
        : `${format(range.start, 'd MMM', { locale: tr })} – ${format(range.end, 'd MMM yyyy', { locale: tr })}`;
  const step = (n: number) => setNav(view, view === 'month' ? addMonths(anchor, n) : addWeeks(anchor, n));

  const picker = (
    <AccountPicker accounts={activeAccounts} selected={selected} onChange={setSelected} only className="max-h-[calc(100dvh-220px)]" />
  );

  return (
    <div className="mx-auto max-w-360">
      <PageHeader
        title="Takvim"
        actions={
          <>
            <SegmentedControl
              label="Görünüm"
              value={view}
              onChange={(v) => setNav(v, anchor)}
              options={[
                { value: 'month', label: 'Ay' },
                { value: 'week', label: 'Hafta' },
              ]}
            />
            <Button icon={Plus} onClick={() => compose(new Date())} className="max-sm:hidden">
              Gönderi oluştur
            </Button>
          </>
        }
      />

      <div className="flex items-start gap-5">
        {/* Hesap filtresi (DESIGN.md §5.1) */}
        <Card className={cx('sticky top-7 hidden w-64 shrink-0 pt-2', panel && 'lg:block')}>
          <p className="mb-2 flex items-center gap-2 pr-2 pl-4 text-small font-semibold">
            <span className="flex-1">Hesaplar</span>
            <span className="text-caption font-normal text-muted tabular-nums">
              {selected.length}/{activeAccounts.length}
            </span>
            <IconButton icon={PanelLeftClose} size="sm" label="Hesap panelini gizle" onClick={togglePanel} />
          </p>
          {picker}
        </Card>

        <Card className="min-w-0 flex-1 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
            {!panel && <IconButton icon={PanelLeftOpen} size="sm" label="Hesap panelini göster" onClick={togglePanel} className="max-lg:hidden" />}
            <Button size="sm" onClick={() => setNav(view, new Date())}>
              Bugün
            </Button>
            <IconButton icon={ChevronLeft} size="sm" label={view === 'month' ? 'Önceki ay' : 'Önceki hafta'} onClick={() => step(-1)} />
            <IconButton icon={ChevronRight} size="sm" label={view === 'month' ? 'Sonraki ay' : 'Sonraki hafta'} onClick={() => step(1)} />
            <h2 className="ml-1 text-heading font-semibold tabular-nums">{period}</h2>
            <span className="flex-1" />
            <Popover
              align="end"
              wrapperClassName={cx('inline-flex', panel && 'lg:hidden')}
              className="w-72 pt-3"
              trigger={({ toggle }) => (
                <Button size="sm" icon={Users} onClick={toggle}>
                  Hesaplar {selected.length}/{activeAccounts.length}
                  <ChevronDown className="size-3.5 text-faint" />
                </Button>
              )}
            >
              {picker}
            </Popover>
            <Select fit aria-label="Durum filtresi" value={status} onChange={(e) => setStatus(e.target.value)} className="h-8 text-small">
              {STATUS_FILTERS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>

          {move.error && (
            <div className="border-b border-line p-3">
              <Notice tone="error">{(move.error as Error).message}</Notice>
            </div>
          )}

          {activeAccounts.length > 0 && !selected.length ? (
            <EmptyState
              icon={Users}
              title="Hiç hesap seçilmedi"
              body="Takvimde gönderi görmek için en az bir hesap seçin."
              action={<Button onClick={() => setSelected(activeAccounts.map((a) => a.id))}>Tüm hesapları göster</Button>}
            />
          ) : view === 'month' ? (
            <MonthGrid
              days={days}
              month={anchor}
              byDay={byDay}
              dragOver={dragOver}
              dropProps={dropProps}
              onOpen={setOpen}
              onCompose={compose}
              onMore={(d) => setNav('week', d)}
            />
          ) : (
            <WeekGrid days={days} byDay={byDay} dragOver={dragOver} dropProps={dropProps} onOpen={setOpen} onCompose={compose} />
          )}
          {!posts.isLoading && !visible.length && selected.length > 0 && (
            <p className="flex items-center justify-center gap-2 border-t border-line px-4 py-3 text-small text-muted">
              <CalendarX2 className="size-4" strokeWidth={1.75} /> Bu dönemde gösterilecek gönderi yok.
            </p>
          )}
        </Card>
      </div>

      <PostDetailModal postId={open} onClose={() => setOpen(null)} />
    </div>
  );
}

type DropProps = (day: Date, key: string) => Record<string, unknown>;

function MonthGrid({
  days,
  month,
  byDay,
  dragOver,
  dropProps,
  onOpen,
  onCompose,
  onMore,
}: {
  days: Date[];
  month: Date;
  byDay: Map<string, PostDto[]>;
  dragOver: string | null;
  dropProps: DropProps;
  onOpen(id: string): void;
  onCompose(d: Date): void;
  onMore(d: Date): void;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-190">
        <div className="grid grid-cols-7 border-b border-line">
          {DAY_NAMES.map((d) => (
            <div key={d} className="px-3 py-2 text-caption font-medium text-muted">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const key = format(day, 'yyyy-MM-dd');
            const list = byDay.get(key) ?? [];
            const past = startOfDay(day) < startOfDay(new Date());
            const inMonth = isSameMonth(day, month);
            return (
              <div
                key={key}
                {...dropProps(day, key)}
                className={cx(
                  'group relative min-h-32 border-r border-b border-line p-1.5 transition-colors nth-[7n]:border-r-0 nth-last-[-n+7]:border-b-0',
                  (past || !inMonth) && 'bg-canvas',
                  dragOver === key && 'bg-brand-50 outline-1 -outline-offset-1 outline-brand-200 outline-dashed',
                )}
              >
                <div className="mb-1 flex h-6 items-center justify-between pl-1">
                  <span
                    className={cx(
                      'flex h-5.5 min-w-5.5 items-center justify-center rounded-full px-1 text-caption font-medium tabular-nums',
                      isToday(day) ? 'bg-brand-600 text-white' : inMonth ? 'text-ink-2' : 'text-faint',
                    )}
                  >
                    {format(day, 'd')}
                  </span>
                  {!past && (
                    <IconButton
                      icon={Plus}
                      size="sm"
                      label={`${format(day, 'd MMMM', { locale: tr })} için gönderi oluştur`}
                      onClick={() => onCompose(day)}
                      className="size-6 opacity-0 group-hover:opacity-100 focus:opacity-100"
                    />
                  )}
                </div>
                <div className="space-y-1">
                  {list.slice(0, 3).map((p) => (
                    <MonthChip key={p.id} post={p} onOpen={() => onOpen(p.id)} />
                  ))}
                  {list.length > 3 && (
                    <button onClick={() => onMore(day)} className="px-1.5 text-caption font-medium text-brand-700 hover:underline">
                      +{list.length - 3} gönderi
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MonthChip({ post, onOpen }: { post: PostDto; onOpen(): void }) {
  const at = postDate(post)!;
  const movable = MOVABLE.includes(post.status);
  return (
    <button
      draggable={movable}
      onDragStart={(e) => e.dataTransfer.setData('text/post-id', post.id)}
      onClick={onOpen}
      title={post.text}
      className={cx(
        'relative flex h-6 w-full items-center gap-1.5 overflow-hidden rounded-chip border border-line bg-surface pr-1.5 pl-2.5 text-left transition-colors hover:border-line-strong',
        movable && 'cursor-grab active:cursor-grabbing',
      )}
    >
      <span className={cx('absolute inset-y-0 left-0 w-0.75', statusBar(post.status))} />
      <span className="shrink-0 text-micro text-muted tabular-nums">{format(at, 'HH:mm')}</span>
      <span className="min-w-0 flex-1 truncate text-caption font-medium text-ink-2">{post.text || 'Medya'}</span>
      <span className="flex shrink-0 -space-x-1">
        {platformsOf(post)
          .slice(0, 3)
          .map((pl) => (
            <PlatformIcon key={pl} platform={pl} size={14} className="ring-1 ring-surface" />
          ))}
      </span>
    </button>
  );
}

function WeekGrid({
  days,
  byDay,
  dragOver,
  dropProps,
  onOpen,
  onCompose,
}: {
  days: Date[];
  byDay: Map<string, PostDto[]>;
  dragOver: string | null;
  dropProps: DropProps;
  onOpen(id: string): void;
  onCompose(d: Date): void;
}) {
  return (
    <div className="grid md:grid-cols-7">
      {days.map((day) => {
        const key = format(day, 'yyyy-MM-dd');
        const list = byDay.get(key) ?? [];
        const past = startOfDay(day) < startOfDay(new Date());
        const today = isToday(day);
        return (
          <div
            key={key}
            {...dropProps(day, key)}
            className={cx(
              'group flex min-h-[calc(100dvh-260px)] flex-col border-b border-line md:border-r md:border-b-0 md:last:border-r-0 max-md:min-h-0',
              past && 'bg-canvas',
              dragOver === key && 'bg-brand-50 outline-1 -outline-offset-1 outline-brand-200 outline-dashed',
            )}
          >
            <div className={cx('flex items-baseline gap-1.5 border-b-2 px-3 py-2.5', today ? 'border-brand-600' : 'border-transparent')}>
              <span className={cx('text-caption font-medium', today ? 'text-brand-700' : 'text-muted')}>
                {DAY_NAMES[(day.getDay() + 6) % 7]}
              </span>
              <span className={cx('text-heading font-semibold tabular-nums', today ? 'text-brand-700' : past ? 'text-muted' : 'text-ink')}>
                {format(day, 'd')}
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-2 p-2">
              {list.map((p) => (
                <WeekCard key={p.id} post={p} onOpen={() => onOpen(p.id)} />
              ))}
              {!past && (
                <button
                  onClick={() => onCompose(day)}
                  className={cx(
                    'flex h-9 items-center justify-center gap-1.5 rounded-control border border-dashed border-line-strong text-caption font-medium text-muted transition-opacity hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700',
                    list.length ? 'opacity-0 group-hover:opacity-100 focus:opacity-100' : 'md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100',
                  )}
                >
                  <Plus className="size-3.5" /> Gönderi ekle
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WeekCard({ post, onOpen }: { post: PostDto; onOpen(): void }) {
  const at = postDate(post)!;
  const movable = MOVABLE.includes(post.status);
  const first = post.media[0];
  return (
    <button
      draggable={movable}
      onDragStart={(e) => e.dataTransfer.setData('text/post-id', post.id)}
      onClick={onOpen}
      className={cx(
        'relative w-full overflow-hidden rounded-control border border-line bg-surface p-2.5 pl-3.5 text-left transition-colors hover:border-line-strong',
        movable && 'cursor-grab active:cursor-grabbing',
      )}
    >
      <span className={cx('absolute inset-y-0 left-0 w-0.75', statusBar(post.status))} />
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="flex -space-x-1">
          {platformsOf(post).map((pl) => (
            <PlatformIcon key={pl} platform={pl} size={16} className="ring-1 ring-surface" />
          ))}
        </span>
        <span className="flex-1 text-small font-medium tabular-nums">{format(at, 'HH:mm')}</span>
        <StatusDot status={post.status} />
      </div>
      <p className="line-clamp-3 text-caption text-ink-2">{post.text || <span className="text-faint">Metin yok</span>}</p>
      {first && (
        <span className="relative mt-2 block">
          <MediaThumb m={first} className="h-20 w-full rounded-chip" />
          {post.media.length > 1 && (
            <span className="absolute top-1 right-1 rounded-full bg-ink/70 px-1.5 text-micro font-medium text-white">1/{post.media.length}</span>
          )}
        </span>
      )}
    </button>
  );
}

