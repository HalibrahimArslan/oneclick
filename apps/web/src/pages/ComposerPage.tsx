import {
  PLATFORM_LABELS,
  PLATFORM_RULES,
  TIKTOK_PRIVACY_LEVELS,
  type MediaAssetDto,
  type Platform,
  type ValidationIssue,
} from '@oneclick/shared';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Eye,
  ImagePlus,
  Plug,
  Plus,
  Send,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AccountPicker } from '../components/AccountPicker';
import { DateTimePicker } from '../components/DateTimePicker';
import { useFeedback } from '../components/feedback';
import { AccountAvatar, PlatformIcon } from '../components/identity';
import { MediaPickerModal, MediaThumb, useUploader } from '../components/MediaLibrary';
import { PostPreview } from '../components/PostPreview';
import {
  Button,
  Card,
  Checkbox,
  cx,
  EmptyState,
  IconButton,
  MenuItem,
  Notice,
  Popover,
  SegmentedControl,
  Select,
  Spinner,
  Switch,
  Textarea,
} from '../components/ui';
import { api, ApiError, ws } from '../lib/api';
import { useAccounts, usePost, type AccountRow } from '../lib/queries';

interface TargetDraft {
  textOverride: string | null;
  options: Record<string, any>;
}

interface TargetCheck {
  socialAccountId: string;
  platform: Platform;
  issues: ValidationIssue[];
}

type Mode = 'draft' | 'schedule' | 'now';

const PRIVACY_LABEL: Record<string, string> = {
  PUBLIC_TO_EVERYONE: 'Herkes',
  MUTUAL_FOLLOW_FRIENDS: 'Arkadaşlar (karşılıklı takip)',
  FOLLOWER_OF_CREATOR: 'Takipçiler',
  SELF_ONLY: 'Yalnızca ben',
};

const MIME_LABEL: Record<string, string> = {
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WebP',
  'image/gif': 'GIF',
};

const defaultOptions = (p: Platform): Record<string, any> => {
  if (p === 'INSTAGRAM') return { postType: 'FEED' };
  // TikTok kuralı: görünürlük için varsayılan değer olmamalı, kullanıcı seçmeli
  if (p === 'TIKTOK') return { privacyLevel: undefined, disableComment: false, disableDuet: false, disableStitch: false, musicConsent: false };
  return {};
};

const nextHour = () => {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return d;
};

const hashtagCount = (t: string) => t.match(/#[\p{L}\p{N}_]+/gu)?.length ?? 0;

export function ComposerPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const accounts = useAccounts();
  const existing = usePost(id);

  const [text, setText] = useState('');
  const [media, setMedia] = useState<MediaAssetDto[]>([]);
  const [targets, setTargets] = useState<Record<string, TargetDraft>>({});
  const [when, setWhen] = useState(() => {
    const p = params.get('at');
    return p && new Date(p) > new Date() ? new Date(p) : nextHour();
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [checks, setChecks] = useState<TargetCheck[]>([]);
  const [saving, setSaving] = useState<Mode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openPanels, setOpenPanels] = useState<string[]>([]);
  const [mobilePreview, setMobilePreview] = useState(false);
  const initialKey = useRef<string | null>(null);

  // Düzenleme modunda mevcut gönderiyi yükle
  useEffect(() => {
    if (!existing.data || initialKey.current !== null) return;
    const p = existing.data;
    setText(p.text);
    setMedia(p.media);
    setTargets(Object.fromEntries(p.targets.map((t) => [t.socialAccountId, { textOverride: t.textOverride, options: t.options ?? {} }])));
    if (p.scheduledAt && new Date(p.scheduledAt) > new Date()) setWhen(new Date(p.scheduledAt));
  }, [existing.data]);

  const activeAccounts = (accounts.data ?? []).filter((a) => a.status !== 'DISCONNECTED');
  const selected = activeAccounts.filter((a) => targets[a.id]);
  const selectedPlatforms = [...new Set(selected.map((a) => a.platform))];

  const setSelectedIds = (ids: string[]) =>
    setTargets((t) => {
      const next: Record<string, TargetDraft> = {};
      for (const a of activeAccounts) if (ids.includes(a.id)) next[a.id] = t[a.id] ?? { textOverride: null, options: defaultOptions(a.platform) };
      return next;
    });
  const patchTarget = (accountId: string, patch: Partial<TargetDraft>) => setTargets((t) => ({ ...t, [accountId]: { ...t[accountId], ...patch } }));
  const patchOptions = (accountId: string, patch: Record<string, any>) =>
    setTargets((t) => ({ ...t, [accountId]: { ...t[accountId], options: { ...t[accountId].options, ...patch } } }));
  const togglePanel = (aid: string, force?: boolean) =>
    setOpenPanels((o) => ((force ?? !o.includes(aid)) ? [...new Set([...o, aid])] : o.filter((x) => x !== aid)));

  const payload = (mode: Mode) => ({
    text,
    mediaIds: media.map((m) => m.id),
    targets: Object.entries(targets).map(([socialAccountId, t]) => ({ socialAccountId, textOverride: t.textOverride, options: t.options })),
    mode,
    scheduledAt: mode === 'schedule' ? when.toISOString() : null,
  });
  const payloadKey = JSON.stringify(payload('draft'));

  // Kaydedilmemiş değişiklik takibi: ilk yüklenen hâl referans alınır
  const ready = !accounts.isLoading && (!id || Boolean(existing.data));
  useEffect(() => {
    if (ready && initialKey.current === null) initialKey.current = payloadKey;
  }, [ready, payloadKey]);
  const dirty = initialKey.current !== null && initialKey.current !== payloadKey;

  // Değişikliklerde sunucu tarafı doğrulama (gecikmeli)
  useEffect(() => {
    if (!Object.keys(targets).length) {
      setChecks([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await api<{ targets: TargetCheck[] }>(ws('/posts/validate'), { body: payload('draft') });
        setChecks(r.targets);
      } catch {
        /* doğrulama hatası kaydetmeyi engellemez */
      }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payloadKey]);

  const issuesOf = (aid: string) => checks.find((c) => c.socialAccountId === aid)?.issues ?? [];
  const errorCount = checks.reduce((n, c) => n + c.issues.filter((i) => i.level === 'error').length, 0);
  const firstErrorAccount = checks.find((c) => c.issues.some((i) => i.level === 'error'))?.socialAccountId;

  // Sorunu olan paneller kendiliğinden açılır
  useEffect(() => {
    const withErrors = checks.filter((c) => c.issues.some((i) => i.level === 'error')).map((c) => c.socialAccountId);
    if (withErrors.length) setOpenPanels((o) => [...new Set([...o, ...withErrors])]);
  }, [checks]);

  const submit = async (mode: Mode) => {
    setError(null);
    setSaving(mode);
    try {
      const body = payload(mode);
      const post = id
        ? await api<{ id: string }>(ws(`/posts/${id}`), { method: 'PUT', body })
        : await api<{ id: string }>(ws('/posts'), { body });
      initialKey.current = payloadKey;
      toast(mode === 'draft' ? 'Taslak kaydedildi.' : mode === 'now' ? 'Gönderi yayın kuyruğuna alındı.' : 'Gönderi planlandı.', 'success');
      navigate(mode === 'draft' ? '/posts?tab=drafts' : `/posts?highlight=${post.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.data?.targets) setChecks(err.data.targets);
      setError((err as Error).message);
    } finally {
      setSaving(null);
    }
  };

  const close = async () => {
    if (dirty && !(await confirm({ title: 'Değişiklikler kaydedilmedi', body: 'Çıkarsanız yazdıklarınız kaybolur.', action: 'Çık', danger: true }))) return;
    if (window.history.length > 1) navigate(-1);
    else navigate('/calendar');
  };

  const editPreview = (aid: string) => {
    if (targets[aid]?.textOverride === null) patchTarget(aid, { textOverride: text });
    togglePanel(aid, true);
    setTimeout(() => {
      document.getElementById(`panel-${aid}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      document.getElementById(`override-${aid}`)?.focus();
    }, 50);
  };

  if (!ready) return <Spinner className="h-dvh items-center" />;
  if (id && existing.data && ['PUBLISHING', 'PUBLISHED'].includes(existing.data.status)) {
    return (
      <div className="flex h-dvh items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <EmptyState
            title="Bu gönderi artık düzenlenemez"
            body="Yayınlanmış veya yayınlanmakta olan gönderiler değiştirilemez."
            action={<Button onClick={() => navigate('/posts')}>Gönderilere dön</Button>}
          />
        </Card>
      </div>
    );
  }

  const blocked = !selected.length || errorCount > 0 || Boolean(saving);
  const blockedReason = !selected.length ? 'Önce en az bir hesap seçin' : errorCount ? `${errorCount} sorun düzeltilmeli` : undefined;

  const previews = selected.length ? (
    <div className="space-y-6">
      {selected.map((a) => (
        <PostPreview
          key={a.id}
          account={a}
          text={targets[a.id]?.textOverride ?? text}
          media={media}
          postType={targets[a.id]?.options.postType}
          customized={targets[a.id]?.textOverride != null}
          onEdit={() => {
            setMobilePreview(false);
            editPreview(a.id);
          }}
        />
      ))}
    </div>
  ) : (
    <EmptyState icon={Eye} title="Önizleme" body="Gönderinin nasıl görüneceğini görmek için soldan hesap seçin." />
  );

  return (
    <div className="flex h-dvh flex-col bg-canvas">
      {/* Üst çubuk */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-3 sm:px-4">
        <IconButton icon={X} label="Kapat" onClick={close} />
        <h1 className="flex-1 truncate text-heading font-semibold">{id ? 'Gönderiyi düzenle' : 'Gönderi oluştur'}</h1>
        {dirty && <span className="hidden text-caption text-muted sm:inline">Kaydedilmemiş değişiklikler</span>}
        <Button size="sm" icon={Eye} className="xl:hidden" onClick={() => setMobilePreview(true)}>
          Önizleme
        </Button>
      </header>

      {!activeAccounts.length ? (
        <div className="flex flex-1 items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <EmptyState
              icon={Plug}
              title="Önce bir hesap bağlayın"
              body="Gönderi oluşturmak için en az bir bağlı sosyal hesap gerekir."
              action={
                <Button variant="primary" onClick={() => navigate('/accounts')}>
                  Hesap bağla
                </Button>
              }
            />
          </Card>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* Sol: hesaplar */}
          <aside className="shrink-0 border-b border-line bg-surface pt-3 lg:w-68 lg:border-r lg:border-b-0">
            <p className="mb-2.5 flex items-center justify-between px-4 text-small font-semibold">
              <span className="flex items-center gap-2">
                <Users className="size-4 text-muted" strokeWidth={1.75} /> Hesaplar
              </span>
              <span className="text-caption font-normal text-muted tabular-nums">
                {selected.length}/{activeAccounts.length}
              </span>
            </p>
            <AccountPicker
              accounts={activeAccounts}
              selected={selected.map((a) => a.id)}
              onChange={setSelectedIds}
              disabledReason={(a) => (a.status === 'NEEDS_REAUTH' ? 'Yeniden bağlanması gerekiyor' : undefined)}
              className="max-h-64 lg:max-h-[calc(100dvh-56px-64px-48px)]"
            />
          </aside>

          {/* Orta: editör */}
          <main className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-170 space-y-4 p-4 sm:p-6">
              {error && <Notice tone="error">{error}</Notice>}

              <Card title="Gönderi">
                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Ne paylaşmak istiyorsunuz?"
                  aria-label="Gönderi metni"
                  className="field-sizing-content min-h-44 resize-none rounded-none border-0 px-4 py-3.5 text-[15px] leading-6 focus:ring-0"
                  autoFocus={!id}
                />
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-2.5 text-caption text-muted">
                  <span className="tabular-nums">{hashtagCount(text)} hashtag</span>
                  <span className="flex-1" />
                  {selectedPlatforms.map((p) => (
                    <Counter key={p} platform={p} length={text.length} />
                  ))}
                </div>
              </Card>

              <MediaCard media={media} setMedia={setMedia} platforms={selectedPlatforms} onPick={() => setPickerOpen(true)} />

              {selected.length > 0 && (
                <section className="space-y-2.5">
                  <h2 className="px-1 pt-2 text-small font-semibold text-muted">Hesaba özel ayarlar</h2>
                  {selected.map((a) => (
                    <TargetPanel
                      key={a.id}
                      account={a}
                      draft={targets[a.id]}
                      baseText={text}
                      issues={issuesOf(a.id)}
                      open={openPanels.includes(a.id)}
                      onToggle={() => togglePanel(a.id)}
                      onText={(v) => patchTarget(a.id, { textOverride: v })}
                      onOptions={(o) => patchOptions(a.id, o)}
                    />
                  ))}
                </section>
              )}
            </div>
          </main>

          {/* Sağ: önizleme */}
          <aside className="hidden w-100 shrink-0 overflow-y-auto border-l border-line bg-canvas p-5 xl:block">
            <h2 className="mb-4 text-heading font-semibold">Önizleme</h2>
            {previews}
          </aside>
        </div>
      )}

      {/* Alt eylem çubuğu */}
      {activeAccounts.length > 0 && (
        <footer className="z-30 flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-surface px-3 py-3 sm:px-4">
          {errorCount > 0 ? (
            <button
              type="button"
              onClick={() => firstErrorAccount && document.getElementById(`panel-${firstErrorAccount}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })}
              className="flex items-center gap-1.5 rounded-control px-2 py-1 text-small font-medium text-failed-fg hover:bg-failed-bg"
            >
              <AlertCircle className="size-4" /> {errorCount} sorun düzeltilmeli
            </button>
          ) : (
            !selected.length && <span className="px-2 text-small text-muted">Yayınlanacak hesapları seçin</span>
          )}
          <span className="flex-1" />
          <Button variant="ghost" onClick={() => submit('draft')} loading={saving === 'draft'} disabled={!selected.length || Boolean(saving)}>
            Taslak kaydet
          </Button>
          <DateTimePicker value={when} onChange={setWhen} />
          <div className="flex" title={blockedReason}>
            <Button
              variant="primary"
              className="rounded-r-none"
              onClick={() => submit('schedule')}
              loading={saving === 'schedule' || saving === 'now'}
              disabled={blocked || when < new Date()}
            >
              Planla
            </Button>
            <Popover
              side="top"
              align="end"
              className="w-48"
              trigger={({ toggle }) => (
                <button
                  type="button"
                  onClick={toggle}
                  disabled={blocked}
                  aria-label="Diğer yayın seçenekleri"
                  className="flex h-9 items-center rounded-r-control border-l border-brand-700 bg-brand-600 px-2 text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronDown className="size-4" />
                </button>
              )}
            >
              {(closeMenu) => (
                <div role="menu">
                  <MenuItem
                    icon={Send}
                    onClick={() => {
                      closeMenu();
                      submit('now');
                    }}
                  >
                    Şimdi yayınla
                  </MenuItem>
                </div>
              )}
            </Popover>
          </div>
        </footer>
      )}

      {/* Mobil ve dar ekran önizlemesi */}
      {mobilePreview && (
        <div className="fixed inset-0 z-50 flex animate-fade-in flex-col bg-canvas xl:hidden">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-3">
            <IconButton icon={X} label="Önizlemeyi kapat" onClick={() => setMobilePreview(false)} />
            <h2 className="text-heading font-semibold">Önizleme</h2>
          </header>
          <div className="mx-auto w-full max-w-md flex-1 overflow-y-auto p-4">{previews}</div>
        </div>
      )}

      <MediaPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        selectedIds={media.map((m) => m.id)}
        onPick={(items) => setMedia((xs) => [...xs, ...items])}
      />
    </div>
  );
}

function Counter({ platform, length }: { platform: Platform; length: number }) {
  const left = PLATFORM_RULES[platform].maxTextLength - length;
  return (
    <span
      className={cx('flex items-center gap-1 tabular-nums', left < 0 ? 'font-medium text-failed-fg' : left < 100 ? 'text-pending-fg' : 'text-muted')}
      title={`${PLATFORM_LABELS[platform]}: ${PLATFORM_RULES[platform].maxTextLength.toLocaleString('tr')} karakter sınırı`}
    >
      <PlatformIcon platform={platform} size={14} />
      {left.toLocaleString('tr')}
    </span>
  );
}

function swap<T>(xs: T[], a: number, b: number) {
  const copy = [...xs];
  [copy[a], copy[b]] = [copy[b], copy[a]];
  return copy;
}

function MediaCard({
  media,
  setMedia,
  platforms,
  onPick,
}: {
  media: MediaAssetDto[];
  setMedia: React.Dispatch<React.SetStateAction<MediaAssetDto[]>>;
  platforms: Platform[];
  onPick(): void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const { upload, progress } = useUploader((m) => setMedia((xs) => [...xs, m]));
  const [over, setOver] = useState(false);
  const hints = useMemo(
    () =>
      platforms
        .filter((p) => p !== 'MOCK')
        .map((p) => {
          const r = PLATFORM_RULES[p];
          const imgs = r.imageMimes.map((m) => MIME_LABEL[m] ?? m).join(', ');
          return `${PLATFORM_LABELS[p]}: ${imgs} görsel veya video, en fazla ${r.maxImages} öğe${r.mediaRequired ? ', medya zorunlu' : ''}`;
        }),
    [platforms],
  );
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    upload(e.dataTransfer.files);
  };

  return (
    <Card
      title="Medya"
      actions={
        <Button size="sm" variant="ghost" icon={ImagePlus} onClick={onPick}>
          Kütüphaneden seç
        </Button>
      }
    >
      <div className="flex flex-wrap gap-2.5 p-4">
        {media.map((m, i) => (
          <div key={m.id} className="group relative size-24 overflow-hidden rounded-control border border-line">
            <MediaThumb m={m} className="size-full" />
            <span className="absolute top-1 left-1 flex size-5 items-center justify-center rounded-full bg-ink/70 text-micro font-semibold text-white">{i + 1}</span>
            <button
              type="button"
              onClick={() => setMedia((xs) => xs.filter((x) => x.id !== m.id))}
              className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-ink/70 text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100"
              aria-label={`${m.fileName} kaldır`}
            >
              <X className="size-3.5" />
            </button>
            <div className="absolute inset-x-0 bottom-0 flex justify-between bg-linear-to-t from-black/60 p-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
              <button
                type="button"
                className="rounded p-0.5 text-white disabled:opacity-30"
                disabled={i === 0}
                onClick={() => setMedia((xs) => swap(xs, i, i - 1))}
                aria-label="Sola taşı"
              >
                <ArrowLeft className="size-3.5" />
              </button>
              <button
                type="button"
                className="rounded p-0.5 text-white disabled:opacity-30"
                disabled={i === media.length - 1}
                onClick={() => setMedia((xs) => swap(xs, i, i + 1))}
                aria-label="Sağa taşı"
              >
                <ArrowRight className="size-3.5" />
              </button>
            </div>
          </div>
        ))}
        <input
          ref={input}
          type="file"
          accept="image/*,video/*"
          multiple
          hidden
          onChange={async (e) => {
            await upload(e.target.files);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          disabled={progress !== null}
          className={cx(
            'flex size-24 flex-col items-center justify-center gap-1 rounded-control border border-dashed text-caption font-medium transition-colors',
            over ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-line-strong text-muted hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700',
          )}
        >
          {progress !== null ? (
            <span className="tabular-nums">%{progress}</span>
          ) : (
            <>
              <Plus className="size-5" strokeWidth={1.75} />
              Yükle
            </>
          )}
        </button>
      </div>
      {hints.length > 0 && (
        <ul className="space-y-0.5 border-t border-line px-4 py-2.5 text-caption text-muted">
          {hints.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function TargetPanel({
  account,
  draft,
  baseText,
  issues,
  open,
  onToggle,
  onText,
  onOptions,
}: {
  account: AccountRow;
  draft: TargetDraft;
  baseText: string;
  issues: ValidationIssue[];
  open: boolean;
  onToggle(): void;
  onText(v: string | null): void;
  onOptions(o: Record<string, any>): void;
}) {
  const custom = draft.textOverride !== null;
  const errors = issues.filter((i) => i.level === 'error').length;
  const o = draft.options;

  return (
    <section id={`panel-${account.id}`} className={cx('rounded-card border bg-surface', errors ? 'border-failed/40' : 'border-line')}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex h-14 w-full items-center gap-3 px-4 text-left">
        <AccountAvatar name={account.name} url={account.avatarUrl} platform={account.platform} size={28} />
        <span className="min-w-0 flex-1 truncate text-small">
          <span className="font-medium">{PLATFORM_LABELS[account.platform]}</span>
          <span className="text-muted"> · {account.name}</span>
        </span>
        {custom && <span className="hidden rounded-full bg-brand-50 px-2 py-0.5 text-micro font-medium text-brand-700 sm:inline">Özelleştirildi</span>}
        {issues.length > 0 && (
          <span
            className={cx(
              'flex items-center gap-1 rounded-full px-2 py-0.5 text-micro font-medium',
              errors ? 'bg-failed-bg text-failed-fg' : 'bg-pending-bg text-pending-fg',
            )}
          >
            {errors ? <AlertCircle className="size-3" /> : <AlertTriangle className="size-3" />}
            {issues.length}
          </span>
        )}
        <ChevronDown className={cx('size-4 text-faint transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-line px-4 py-4">
          <div>
            <Switch checked={custom} onChange={(v) => onText(v ? baseText : null)} label="Bu hesap için metni özelleştir" />
            {custom && (
              <>
                <Textarea
                  id={`override-${account.id}`}
                  className="mt-3 field-sizing-content min-h-28 resize-none"
                  value={draft.textOverride ?? ''}
                  onChange={(e) => onText(e.target.value)}
                  aria-label={`${account.name} için metin`}
                />
                <div className="mt-1.5 flex justify-end text-caption">
                  <Counter platform={account.platform} length={draft.textOverride?.length ?? 0} />
                </div>
              </>
            )}
          </div>

          {account.platform === 'INSTAGRAM' && (
            <div>
              <p className="mb-1.5 text-small font-medium">Gönderi türü</p>
              <SegmentedControl
                label="Instagram gönderi türü"
                value={(o.postType ?? 'FEED') as string}
                onChange={(v) => onOptions({ postType: v })}
                options={[
                  { value: 'FEED', label: 'Gönderi' },
                  { value: 'REEL', label: 'Reel' },
                  { value: 'STORY', label: 'Hikâye' },
                ]}
              />
            </div>
          )}

          {account.platform === 'TIKTOK' && <TikTokSettings account={account} o={o} onOptions={onOptions} />}

          {issues.length > 0 && (
            <ul className="space-y-1.5">
              {issues.map((i, n) => (
                <li key={n} className={cx('flex items-start gap-2 text-small', i.level === 'error' ? 'text-failed-fg' : 'text-pending-fg')}>
                  {i.level === 'error' ? <AlertCircle className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
                  {i.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/** TikTok Content Posting API'nin zorunlu kıldığı arayüz öğeleri; sıra ve metinler korunur. */
function TikTokSettings({ account, o, onOptions }: { account: AccountRow; o: Record<string, any>; onOptions(o: Record<string, any>): void }) {
  const caps = useQuery({
    queryKey: ['tiktok-caps', account.id],
    queryFn: () => api<any>(ws(`/accounts/${account.id}/capabilities`)),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const levels: string[] = caps.data?.privacy_level_options ?? [...TIKTOK_PRIVACY_LEVELS];
  const commercial = Boolean(o.brandOrganicToggle || o.brandContentToggle || o._commercial);
  const check = (label: string, checked: boolean, onChange: (v: boolean) => void, disabled?: boolean) => (
    <label className={cx('flex items-center gap-2 text-small', disabled && 'opacity-50')}>
      <Checkbox checked={checked} onChange={onChange} disabled={disabled} label={label} />
      {label}
    </label>
  );

  return (
    <div className="space-y-4">
      {caps.data?.creator_nickname && (
        <p className="text-small text-muted">
          Paylaşılacak hesap: <span className="font-medium text-ink">{caps.data.creator_nickname}</span>
        </p>
      )}
      {caps.error && <Notice tone="warning">Hesap bilgisi alınamadı: {(caps.error as Error).message}</Notice>}

      <label className="block">
        <span className="mb-1.5 block text-small font-medium">Kimler görebilir?</span>
        <Select value={o.privacyLevel ?? ''} onChange={(e) => onOptions({ privacyLevel: e.target.value || undefined })}>
          <option value="">Seçin…</option>
          {levels.map((l) => (
            <option key={l} value={l} disabled={l === 'SELF_ONLY' && o.brandContentToggle}>
              {PRIVACY_LABEL[l] ?? l}
            </option>
          ))}
        </Select>
      </label>

      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {check('Yorumlara izin ver', !o.disableComment, (v) => onOptions({ disableComment: !v }), caps.data?.comment_disabled)}
        {check('Duet', !o.disableDuet, (v) => onOptions({ disableDuet: !v }), caps.data?.duet_disabled)}
        {check('Stitch', !o.disableStitch, (v) => onOptions({ disableStitch: !v }), caps.data?.stitch_disabled)}
      </div>

      <div className="rounded-control border border-line p-3">
        {check('Bu içerik bir markayı, ürünü veya hizmeti tanıtıyor', commercial, (v) =>
          onOptions(v ? { _commercial: true } : { _commercial: false, brandOrganicToggle: false, brandContentToggle: false }),
        )}
        {commercial && (
          <div className="mt-2.5 space-y-2 pl-6">
            {check('Kendi markam', Boolean(o.brandOrganicToggle), (v) => onOptions({ brandOrganicToggle: v }))}
            {check('Markalı içerik (ücretli iş birliği)', Boolean(o.brandContentToggle), (v) => onOptions({ brandContentToggle: v }))}
            {!o.brandOrganicToggle && !o.brandContentToggle && <p className="text-caption text-pending-fg">En az bir seçenek işaretleyin.</p>}
          </div>
        )}
      </div>

      <label className="flex items-start gap-2 text-small text-muted">
        <Checkbox className="mt-0.5" checked={Boolean(o.musicConsent)} onChange={(v) => onOptions({ musicConsent: v })} label="TikTok politikalarını kabul ediyorum" />
        <span>
          Paylaşarak TikTok'un{' '}
          {o.brandContentToggle && (
            <>
              <a className="text-brand-700 underline" href="https://www.tiktok.com/legal/page/global/bc-policy/en" target="_blank" rel="noreferrer">
                Markalı İçerik Politikası
              </a>{' '}
              ve{' '}
            </>
          )}
          <a className="text-brand-700 underline" href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noreferrer">
            Müzik Kullanım Onayı
          </a>
          'nı kabul ediyorum.
        </span>
      </label>
    </div>
  );
}
