import { type ConversationDetailDto, type ConversationDto, type InboxDto, type InboxMessageDto } from '@oneclick/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, CheckCheck, ExternalLink, EyeOff, Inbox, MessageCircle, RefreshCw, RotateCcw, Send, Tag } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useFeedback } from '../components/feedback';
import { AccountAvatar } from '../components/identity';
import { Button, Card, Checkbox, cx, EmptyState, IconButton, Input, Notice, PageHeader, Popover, SegmentedControl, Select, Skeleton, Textarea } from '../components/ui';
import { api, ws } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtAgo, fmtLong } from '../lib/format';
import { useConversation, useInbox, useLabels, useMembers, type InboxFilters } from '../lib/queries';

const MAX_REPLY = 2200;
const canAct = (role: string | undefined) => role === 'OWNER' || role === 'ADMIN' || role === 'EDITOR';

export function InboxPage() {
  const [params, setParams] = useSearchParams();
  const selected = params.get('c');
  const [filters, setFilters] = useState<InboxFilters>({ status: 'OPEN' });
  const inbox = useInbox(filters);
  const qc = useQueryClient();
  const { toast } = useFeedback();
  const [syncing, setSyncing] = useState(false);
  const data = inbox.data;

  const select = (id: string | null) => setParams((p) => (id ? p.set('c', id) : p.delete('c'), p), { replace: !id });

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await api<{ newMessages: number; failed: number }>(ws('/inbox/sync'), { method: 'POST' });
      await qc.invalidateQueries({ queryKey: ['inbox'] });
      toast(r.failed ? 'Bazı hesapların yorumları alınamadı.' : r.newMessages ? `${r.newMessages} yeni yorum geldi.` : 'Yeni yorum yok.', r.failed ? 'error' : 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="mx-auto max-w-300">
      <PageHeader
        title="Gelen kutusu"
        subtitle="Instagram gönderilerinize gelen yorumlar. Birkaç dakikada bir kendiliğinden yenilenir."
        actions={
          <Button variant="ghost" icon={RefreshCw} loading={syncing} onClick={sync}>
            Yenile
          </Button>
        }
      />
      {data && data.needsReconnect.length > 0 && (
        <div className="mb-4">
          <Notice
            tone="info"
            action={
              <Link to="/accounts" className="font-medium whitespace-nowrap underline">
                Hesaplara git
              </Link>
            }
          >
            {data.needsReconnect.map((a) => a.name).join(', ')} için yorum izni yok. Yorumları görmek ve yanıtlamak için hesabı Hesaplar sayfasından yeniden
            bağlayın.
          </Notice>
        </div>
      )}

      {inbox.isError ? (
        <Notice tone="error">{(inbox.error as Error).message}</Notice>
      ) : data && !data.hasSupportedAccounts && !data.counts.open && !data.counts.done ? (
        <Card>
          <EmptyState
            icon={Inbox}
            title="Yorumları okunabilen hesap yok"
            body="Gelen kutusu Instagram yorumlarıyla çalışır. LinkedIn ve TikTok yorum okumaya izin vermiyor. Bir Instagram hesabı bağlayın ya da yeniden bağlayıp yorum iznini onaylayın."
            action={
              <Link to="/accounts">
                <Button variant="primary">Hesaplara git</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
          <div className={cx('min-w-0', selected && 'max-lg:hidden')}>
            <ConversationList data={data} loading={inbox.isLoading} filters={filters} setFilters={setFilters} selected={selected} onSelect={select} />
          </div>
          <div className={cx('min-w-0', !selected && 'max-lg:hidden')}>
            {selected ? (
              <ConversationView id={selected} onBack={() => select(null)} />
            ) : (
              <Card className="max-lg:hidden">
                <EmptyState icon={MessageCircle} title="Bir konuşma seçin" body="Soldaki listeden bir yorumu açarak yanıtlayabilir, atayabilir ya da gizleyebilirsiniz." />
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ConversationList({
  data,
  loading,
  filters,
  setFilters,
  selected,
  onSelect,
}: {
  data: InboxDto | undefined;
  loading: boolean;
  filters: InboxFilters;
  setFilters(f: InboxFilters): void;
  selected: string | null;
  onSelect(id: string): void;
}) {
  const labels = useLabels();
  const set = (patch: Partial<InboxFilters>) => setFilters({ ...filters, ...patch });

  return (
    <Card>
      <div className="space-y-2.5 border-b border-line p-3">
        <SegmentedControl
          label="Durum"
          size="sm"
          value={filters.status}
          onChange={(status) => set({ status })}
          options={[
            { value: 'OPEN', label: `Açık${data ? ` ${data.counts.open}` : ''}` },
            { value: 'DONE', label: `Bitti${data ? ` ${data.counts.done}` : ''}` },
          ]}
        />
        <div className="flex flex-wrap gap-2">
          <Select fit aria-label="Atanan" value={filters.assignee ?? ''} onChange={(e) => set({ assignee: (e.target.value || undefined) as InboxFilters['assignee'] })} className="h-8 text-small font-medium">
            <option value="">Herkes</option>
            <option value="me">Bana atanan{data?.counts.mine ? ` (${data.counts.mine})` : ''}</option>
            <option value="unassigned">Atanmamış</option>
          </Select>
          {(labels.data?.length ?? 0) > 0 && (
            <Select fit aria-label="Etiket" value={filters.labelId ?? ''} onChange={(e) => set({ labelId: e.target.value || undefined })} className="h-8 text-small font-medium">
              <option value="">Tüm etiketler</option>
              {labels.data!.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          )}
        </div>
      </div>
      {loading ? (
        <div className="space-y-3 p-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : !data?.conversations.length ? (
        <EmptyState
          icon={filters.status === 'OPEN' ? CheckCheck : Inbox}
          title={filters.status === 'OPEN' ? 'Bekleyen yorum yok' : 'Burada henüz bir şey yok'}
          body={filters.status === 'OPEN' ? 'Tüm yorumlar yanıtlandı ya da bitti olarak işaretlendi.' : 'Yanıtladığınız ya da bitti olarak işaretlediğiniz yorumlar burada görünür.'}
        />
      ) : (
        <ul className="max-h-[calc(100dvh-260px)] divide-y divide-line overflow-y-auto">
          {data.conversations.map((c) => (
            <li key={c.id}>
              <ConversationItem c={c} active={c.id === selected} onClick={() => onSelect(c.id)} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ConversationItem({ c, active, onClick }: { c: ConversationDto; active: boolean; onClick(): void }) {
  const p = c.preview;
  return (
    <button type="button" onClick={onClick} aria-current={active || undefined} className={cx('flex w-full gap-3 px-3 py-3 text-left transition-colors', active ? 'bg-brand-50' : 'hover:bg-subtle')}>
      <AccountAvatar name={c.account.name} url={c.account.avatarUrl} platform={c.account.platform} size={32} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-small font-medium">{p?.direction === 'OUT' ? 'Siz' : p?.authorName ? `@${p.authorName}` : c.account.name}</span>
          {c.lastMessageAt && <span className="shrink-0 text-caption text-faint">{fmtAgo(c.lastMessageAt)}</span>}
        </div>
        <p className={cx('mt-0.5 line-clamp-2 text-small', c.status === 'OPEN' && p?.direction === 'IN' ? 'text-ink-2' : 'text-muted')}>{p?.body}</p>
        {(c.labels.length > 0 || c.assignee) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {c.labels.map((l) => (
              <span key={l.id} className="rounded-full bg-subtle px-2 py-0.5 text-micro font-medium text-ink-2">
                {l.name}
              </span>
            ))}
            {c.assignee && <span className="text-micro text-muted">→ {c.assignee.name}</span>}
          </div>
        )}
      </div>
      {c.context?.thumbnailUrl && <img src={c.context.thumbnailUrl} alt="" className="size-10 shrink-0 rounded-[6px] border border-line object-cover" />}
    </button>
  );
}

function ConversationView({ id, onBack }: { id: string; onBack(): void }) {
  const conv = useConversation(id);
  const { workspace } = useAuth();
  const editable = canAct(workspace?.role);
  const c = conv.data;

  if (conv.isError) {
    return (
      <Card className="p-4">
        <Notice tone="error">{(conv.error as Error).message}</Notice>
      </Card>
    );
  }
  if (!c) {
    return (
      <Card className="space-y-3 p-4">
        <Skeleton className="h-14" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </Card>
    );
  }
  return (
    <Card>
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
        <IconButton icon={ArrowLeft} label="Listeye dön" size="sm" onClick={onBack} className="lg:hidden" />
        <AccountAvatar name={c.account.name} url={c.account.avatarUrl} platform={c.account.platform} size={24} />
        <span className="min-w-0 flex-1 truncate text-small font-medium">{c.account.name}</span>
        {editable && <ConversationActions c={c} />}
      </header>
      {c.context && <PostContext ctx={c.context} />}
      <ol className="space-y-3 px-4 py-4" aria-label="Yorumlar">
        {c.messages.map((m) => (
          <MessageBubble key={m.id} m={m} editable={editable} />
        ))}
      </ol>
      {editable ? (
        <ReplyBox c={c} />
      ) : (
        <p className="border-t border-line px-4 py-3 text-small text-muted">Yanıtlamak için Editör, Yönetici ya da Sahip rolü gerekir.</p>
      )}
    </Card>
  );
}

function PostContext({ ctx }: { ctx: NonNullable<ConversationDto['context']> }) {
  return (
    <div className="flex items-start gap-3 border-b border-line bg-canvas px-4 py-3">
      {ctx.thumbnailUrl && <img src={ctx.thumbnailUrl} alt="" className="size-12 shrink-0 rounded-[6px] border border-line object-cover" />}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-caption text-muted">{ctx.caption || 'Açıklamasız gönderi'}</p>
        {ctx.permalink && (
          <a href={ctx.permalink} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-caption font-medium text-brand-700 hover:underline">
            Instagram'da aç <ExternalLink className="size-3" />
          </a>
        )}
      </div>
    </div>
  );
}

/** Önbellekteki konuşmayı ve listeyi API'nin döndürdüğü güncel hâlle eşitler */
function useApply() {
  const qc = useQueryClient();
  const wsId = useAuth().workspace?.id ?? 'none';
  return (c: ConversationDetailDto) => {
    qc.setQueryData(['conversation', wsId, c.id], c);
    qc.invalidateQueries({ queryKey: ['inbox'] });
  };
}

function MessageBubble({ m, editable }: { m: InboxMessageDto; editable: boolean }) {
  const { toast } = useFeedback();
  const apply = useApply();
  const [busy, setBusy] = useState(false);
  const out = m.direction === 'OUT';

  const toggleHidden = async () => {
    // Bildirim, istek sonrası yeniden çizilen değere değil istenen duruma göre yazılır
    const hide = !m.hidden;
    setBusy(true);
    try {
      apply(await api<ConversationDetailDto>(ws(`/inbox/messages/${m.id}/hide`), { body: { hidden: hide } }));
      toast(hide ? 'Yorum gizlendi; yalnızca yazan kişi ve siz görürsünüz.' : 'Yorum yeniden görünür.', 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={cx('flex flex-col', out ? 'items-end' : 'items-start')}>
      <div
        className={cx(
          'max-w-[85%] rounded-card px-3.5 py-2.5 text-body whitespace-pre-wrap',
          out ? 'rounded-br-[4px] bg-brand-50 text-ink' : 'rounded-bl-[4px] bg-subtle text-ink',
          m.hidden && 'opacity-60',
        )}
      >
        {!out && <p className="mb-0.5 text-caption font-medium text-ink-2">@{m.authorName ?? 'bilinmiyor'}</p>}
        {m.body}
      </div>
      <div className={cx('mt-1 flex items-center gap-2 px-1 text-caption text-faint', out && 'flex-row-reverse')}>
        <time dateTime={m.sentAt} title={fmtLong(m.sentAt)}>
          {fmtAgo(m.sentAt)}
        </time>
        {out && m.sentBy && <span>{m.sentBy.name} yanıtladı</span>}
        {m.hidden && (
          <span className="inline-flex items-center gap-1 text-muted">
            <EyeOff className="size-3" /> Gizli
          </span>
        )}
        {!out && editable && (
          <button type="button" disabled={busy} onClick={toggleHidden} className="font-medium text-muted hover:text-ink hover:underline disabled:opacity-50">
            {m.hidden ? 'Göster' : 'Gizle'}
          </button>
        )}
      </div>
    </li>
  );
}

function ConversationActions({ c }: { c: ConversationDetailDto }) {
  const members = useMembers();
  const labels = useLabels();
  const qc = useQueryClient();
  const apply = useApply();
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const [newLabel, setNewLabel] = useState('');

  const patch = async (body: Record<string, unknown>, done?: string) => {
    setBusy(true);
    try {
      apply(await api<ConversationDetailDto>(ws(`/inbox/${c.id}`), { method: 'PATCH', body }));
      if (done) toast(done, 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const labelIds = c.labels.map((l) => l.id);
  const toggleLabel = (id: string, on: boolean) => patch({ labelIds: on ? [...labelIds, id] : labelIds.filter((x) => x !== id) });

  const addLabel = async (e: FormEvent) => {
    e.preventDefault();
    const name = newLabel.trim();
    if (!name) return;
    try {
      const l = await api<{ id: string }>(ws('/labels'), { body: { name } });
      setNewLabel('');
      await qc.invalidateQueries({ queryKey: ['labels'] });
      if (!labelIds.includes(l.id)) await patch({ labelIds: [...labelIds, l.id] });
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  return (
    <>
      <Select
        fit
        aria-label="Atanan kişi"
        value={c.assignee?.id ?? ''}
        disabled={busy}
        onChange={(e) => patch({ assigneeId: e.target.value || null })}
        className="h-8 max-w-40 text-small font-medium"
      >
        <option value="">Atanmamış</option>
        {members.data?.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </Select>
      <Popover
        align="end"
        className="w-60"
        trigger={({ toggle }) => (
          <Button size="sm" icon={Tag} onClick={toggle}>
            Etiket{c.labels.length ? ` (${c.labels.length})` : ''}
          </Button>
        )}
      >
        {() => (
          <div className="space-y-1 p-1">
            {labels.data?.map((l) => (
              <Checkbox key={l.id} label={l.name} checked={labelIds.includes(l.id)} disabled={busy} onChange={(v) => toggleLabel(l.id, v)} className="w-full px-1.5 py-1" />
            ))}
            <form onSubmit={addLabel} className="flex gap-1.5 border-t border-line pt-2">
              <Input aria-label="Yeni etiket" placeholder="Yeni etiket" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} maxLength={40} className="h-8 text-small" />
              <Button size="sm" type="submit" disabled={!newLabel.trim()}>
                Ekle
              </Button>
            </form>
          </div>
        )}
      </Popover>
      {c.status === 'OPEN' ? (
        <Button size="sm" icon={Check} loading={busy} onClick={() => patch({ status: 'DONE' }, 'Bitti olarak işaretlendi.')}>
          Bitti
        </Button>
      ) : (
        <Button size="sm" icon={RotateCcw} loading={busy} onClick={() => patch({ status: 'OPEN' }, 'Konuşma yeniden açıldı.')}>
          Yeniden aç
        </Button>
      )}
    </>
  );
}

function ReplyBox({ c }: { c: ConversationDetailDto }) {
  const apply = useApply();
  const { toast } = useFeedback();
  const lastIn = useMemo(() => [...c.messages].reverse().find((m) => m.direction === 'IN'), [c.messages]);
  const mention = lastIn?.authorName ? `@${lastIn.authorName} ` : '';
  const [text, setText] = useState(mention);
  const [busy, setBusy] = useState(false);

  // Başka konuşmaya geçince taslak, o konuşmanın yazarına hitapla yeniden başlar
  useEffect(() => setText(mention), [c.id, mention]);

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body || body === mention.trim()) return;
    setBusy(true);
    try {
      apply(await api<ConversationDetailDto>(ws(`/inbox/${c.id}/reply`), { body: { text: body } }));
      setText('');
      toast('Yanıt gönderildi; konuşma bitti olarak işaretlendi.', 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
  };

  return (
    <form onSubmit={send} className="border-t border-line p-3">
      <Textarea
        aria-label="Yanıt"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        maxLength={MAX_REPLY}
        placeholder="Herkese açık yanıt yazın…"
      />
      <div className="mt-2 flex items-center gap-3">
        <span className="flex-1 text-caption text-faint">
          Yanıt Instagram'da herkese açık görünür · {text.length}/{MAX_REPLY} · ⌘/Ctrl + Enter
        </span>
        <Button type="submit" variant="primary" icon={Send} loading={busy} disabled={!text.trim() || text.trim() === mention.trim()}>
          Yanıtla
        </Button>
      </div>
    </form>
  );
}
