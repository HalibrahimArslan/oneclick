import {
  PLATFORM_LABELS,
  PLATFORM_RULES,
  TIKTOK_PRIVACY_LEVELS,
  type MediaAssetDto,
  type Platform,
  type ValidationIssue,
} from '@oneclick/shared';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { AlertCircle, ArrowLeft, ArrowRight, CalendarClock, ImagePlus, Send, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MediaPickerModal, MediaThumb, UploadButton } from '../components/MediaLibrary';
import { AccountAvatar, Button, Card, cx, EmptyState, Input, Notice, PageHeader, PlatformBadge, Spinner, Textarea } from '../components/ui';
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

const PRIVACY_LABEL: Record<string, string> = {
  PUBLIC_TO_EVERYONE: 'Herkes',
  MUTUAL_FOLLOW_FRIENDS: 'Arkadaşlar (karşılıklı takip)',
  FOLLOWER_OF_CREATOR: 'Takipçiler',
  SELF_ONLY: 'Yalnızca ben',
};

const defaultOptions = (p: Platform): Record<string, any> => {
  if (p === 'INSTAGRAM') return { postType: 'FEED' };
  // TikTok kuralı: görünürlük için varsayılan değer olmamalı, kullanıcı seçmeli
  if (p === 'TIKTOK')
    return { privacyLevel: undefined, disableComment: false, disableDuet: false, disableStitch: false, musicConsent: false };
  return {};
};

const toLocalInput = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm");

export function ComposerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const accounts = useAccounts();
  const existing = usePost(id);

  const [text, setText] = useState('');
  const [media, setMedia] = useState<MediaAssetDto[]>([]);
  const [targets, setTargets] = useState<Record<string, TargetDraft>>({});
  const [when, setWhen] = useState(() => toLocalInput(new Date(Date.now() + 60 * 60_000)));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [checks, setChecks] = useState<TargetCheck[]>([]);
  const [saving, setSaving] = useState<null | 'draft' | 'schedule' | 'now'>(null);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  // Düzenleme modunda mevcut gönderiyi yükle
  useEffect(() => {
    if (!existing.data || initialized.current) return;
    initialized.current = true;
    const p = existing.data;
    setText(p.text);
    setMedia(p.media);
    setTargets(Object.fromEntries(p.targets.map((t) => [t.socialAccountId, { textOverride: t.textOverride, options: t.options ?? {} }])));
    if (p.scheduledAt && new Date(p.scheduledAt) > new Date()) setWhen(toLocalInput(new Date(p.scheduledAt)));
  }, [existing.data]);

  const activeAccounts = (accounts.data ?? []).filter((a) => a.status !== 'DISCONNECTED');
  const selected = activeAccounts.filter((a) => targets[a.id]);
  const selectedPlatforms = [...new Set(selected.map((a) => a.platform))];

  const toggleAccount = (a: AccountRow) =>
    setTargets((t) => {
      const next = { ...t };
      if (next[a.id]) delete next[a.id];
      else next[a.id] = { textOverride: null, options: defaultOptions(a.platform) };
      return next;
    });

  const patchTarget = (accountId: string, patch: Partial<TargetDraft>) =>
    setTargets((t) => ({ ...t, [accountId]: { ...t[accountId], ...patch } }));
  const patchOptions = (accountId: string, patch: Record<string, any>) =>
    setTargets((t) => ({ ...t, [accountId]: { ...t[accountId], options: { ...t[accountId].options, ...patch } } }));

  const payload = (mode: 'draft' | 'schedule' | 'now') => ({
    text,
    mediaIds: media.map((m) => m.id),
    targets: Object.entries(targets).map(([socialAccountId, t]) => ({ socialAccountId, textOverride: t.textOverride, options: t.options })),
    mode,
    scheduledAt: mode === 'schedule' ? new Date(when).toISOString() : null,
  });

  // Değişikliklerde sunucu tarafı doğrulama (gecikmeli)
  const payloadKey = JSON.stringify(payload('draft'));
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

  const errorCount = checks.reduce((n, c) => n + c.issues.filter((i) => i.level === 'error').length, 0);

  const submit = async (mode: 'draft' | 'schedule' | 'now') => {
    setError(null);
    setSaving(mode);
    try {
      const body = payload(mode);
      const post = id
        ? await api<{ id: string }>(ws(`/posts/${id}`), { method: 'PUT', body })
        : await api<{ id: string }>(ws('/posts'), { body });
      navigate(mode === 'draft' ? '/posts?tab=drafts' : `/posts?highlight=${post.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.data?.targets) setChecks(err.data.targets);
      setError((err as Error).message);
    } finally {
      setSaving(null);
    }
  };

  const strictestLimit = selectedPlatforms.length
    ? Math.min(...selectedPlatforms.map((p) => PLATFORM_RULES[p].maxTextLength))
    : null;

  if (accounts.isLoading || (id && existing.isLoading)) return <Spinner />;
  if (id && existing.data && ['PUBLISHING', 'PUBLISHED'].includes(existing.data.status)) {
    return <EmptyState title="Bu gönderi artık düzenlenemez" body="Yayınlanmış veya yayınlanmakta olan gönderiler değiştirilemez." />;
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={id ? 'Gönderiyi düzenle' : 'Gönderi oluştur'}
        subtitle="Bir kez yazın, seçtiğiniz tüm hesaplarda yayınlayın."
      />

      {!activeAccounts.length ? (
        <EmptyState
          title="Önce bir hesap bağlayın"
          body="Gönderi oluşturmak için en az bir bağlı sosyal hesap gerekir."
          action={
            <Link to="/accounts">
              <Button variant="primary">Hesap bağla</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            {/* Hesap seçimi */}
            <Card className="p-4">
              <p className="mb-3 text-[13px] font-medium">Hesaplar</p>
              <div className="flex flex-wrap gap-2">
                {activeAccounts.map((a) => {
                  const on = Boolean(targets[a.id]);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => toggleAccount(a)}
                      disabled={a.status === 'NEEDS_REAUTH'}
                      aria-pressed={on}
                      className={cx(
                        'flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm transition',
                        on ? 'border-ink bg-ink text-white' : 'border-line bg-white hover:border-gray-400',
                        a.status === 'NEEDS_REAUTH' && 'opacity-50',
                      )}
                      title={a.status === 'NEEDS_REAUTH' ? 'Yeniden bağlanması gerekiyor' : undefined}
                    >
                      <AccountAvatar name={a.name} url={a.avatarUrl} platform={a.platform} size={26} />
                      <span className="max-w-[160px] truncate">{a.name}</span>
                    </button>
                  );
                })}
              </div>
            </Card>

            {/* Metin */}
            <Card className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[13px] font-medium">Metin</p>
                {strictestLimit && (
                  <span className={cx('text-xs tabular-nums', text.length > strictestLimit ? 'text-red-600' : 'text-muted')}>
                    {text.length} / {strictestLimit}
                  </span>
                )}
              </div>
              <Textarea
                rows={7}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Ne paylaşmak istiyorsunuz?"
                className="resize-y"
              />

              {/* Medya */}
              <div className="mt-4">
                {media.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {media.map((m, i) => (
                      <div key={m.id} className="group relative size-24 overflow-hidden rounded-lg">
                        <MediaThumb m={m} className="size-full" />
                        <div className="absolute inset-x-0 bottom-0 flex justify-between bg-gradient-to-t from-black/60 p-1 opacity-0 transition group-hover:opacity-100">
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
                        <button
                          type="button"
                          onClick={() => setMedia((xs) => xs.filter((x) => x.id !== m.id))}
                          className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white"
                          aria-label="Kaldır"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <UploadButton label="Dosya yükle" onUploaded={(m) => setMedia((xs) => [...xs, m])} />
                  <Button onClick={() => setPickerOpen(true)}>
                    <ImagePlus className="size-4" /> Kütüphaneden seç
                  </Button>
                </div>
              </div>
            </Card>

            {/* Hesaba özel ayarlar */}
            {selected.map((a) => (
              <TargetSettings
                key={a.id}
                account={a}
                draft={targets[a.id]}
                baseText={text}
                check={checks.find((c) => c.socialAccountId === a.id)}
                onText={(v) => patchTarget(a.id, { textOverride: v })}
                onOptions={(o) => patchOptions(a.id, o)}
              />
            ))}
          </div>

          {/* Sağ sütun: önizleme ve yayın */}
          <div className="space-y-5 lg:sticky lg:top-6 lg:self-start">
            <Card className="p-4">
              <p className="mb-3 text-[13px] font-medium">Yayınla</p>
              {error && (
                <div className="mb-3">
                  <Notice tone="error">{error}</Notice>
                </div>
              )}
              {errorCount > 0 && (
                <p className="mb-3 flex items-start gap-1.5 text-xs text-red-700">
                  <AlertCircle className="mt-px size-3.5 shrink-0" /> {errorCount} sorun düzeltilmeden yayınlanamaz. Ayrıntılar
                  hesap kartlarında.
                </p>
              )}
              <label className="mb-1.5 block text-xs text-muted" htmlFor="when">
                Yayın zamanı
              </label>
              <Input id="when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
              <div className="mt-3 grid gap-2">
                <Button
                  variant="primary"
                  onClick={() => submit('schedule')}
                  loading={saving === 'schedule'}
                  disabled={!selected.length || errorCount > 0 || !!saving}
                >
                  <CalendarClock className="size-4" /> Planla
                </Button>
                <Button onClick={() => submit('now')} loading={saving === 'now'} disabled={!selected.length || errorCount > 0 || !!saving}>
                  <Send className="size-4" /> Şimdi yayınla
                </Button>
                <Button variant="ghost" onClick={() => submit('draft')} loading={saving === 'draft'} disabled={!selected.length || !!saving}>
                  Taslak olarak kaydet
                </Button>
              </div>
            </Card>

            {selectedPlatforms.length > 0 && (
              <Card className="p-4">
                <p className="mb-3 text-[13px] font-medium">Önizleme</p>
                <div className="space-y-4">
                  {selected
                    .filter((a, i, arr) => arr.findIndex((b) => b.platform === a.platform) === i)
                    .map((a) => (
                      <Preview key={a.id} account={a} text={targets[a.id]?.textOverride ?? text} media={media} />
                    ))}
                </div>
              </Card>
            )}
          </div>
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

function swap<T>(xs: T[], a: number, b: number) {
  const copy = [...xs];
  [copy[a], copy[b]] = [copy[b], copy[a]];
  return copy;
}

function TargetSettings({
  account,
  draft,
  baseText,
  check,
  onText,
  onOptions,
}: {
  account: AccountRow;
  draft: TargetDraft;
  baseText: string;
  check?: TargetCheck;
  onText(v: string | null): void;
  onOptions(o: Record<string, any>): void;
}) {
  const custom = draft.textOverride !== null;
  const issues = check?.issues ?? [];
  const o = draft.options;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2.5">
        <AccountAvatar name={account.name} url={account.avatarUrl} platform={account.platform} size={28} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{account.name}</p>
          <p className="text-xs text-muted">{PLATFORM_LABELS[account.platform]}</p>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" checked={custom} onChange={(e) => onText(e.target.checked ? baseText : null)} />
          Bu hesap için metni özelleştir
        </label>
      </div>

      {custom && (
        <Textarea className="mt-3" rows={4} value={draft.textOverride ?? ''} onChange={(e) => onText(e.target.value)} />
      )}

      {account.platform === 'INSTAGRAM' && (
        <div className="mt-3 flex flex-wrap gap-2">
          {(['FEED', 'REEL', 'STORY'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onOptions({ postType: t })}
              className={cx(
                'rounded-full border px-3 py-1 text-xs',
                (o.postType ?? 'FEED') === t ? 'border-ink bg-ink text-white' : 'border-line hover:border-gray-400',
              )}
            >
              {t === 'FEED' ? 'Gönderi' : t === 'REEL' ? 'Reel' : 'Hikâye'}
            </button>
          ))}
        </div>
      )}

      {account.platform === 'TIKTOK' && <TikTokSettings account={account} o={o} onOptions={onOptions} />}

      {issues.length > 0 && (
        <ul className="mt-3 space-y-1">
          {issues.map((i, n) => (
            <li key={n} className={cx('flex items-start gap-1.5 text-xs', i.level === 'error' ? 'text-red-700' : 'text-amber-700')}>
              <AlertCircle className="mt-px size-3.5 shrink-0" /> {i.message}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** TikTok Content Posting API'nin zorunlu kıldığı arayüz öğeleri. */
function TikTokSettings({ account, o, onOptions }: { account: AccountRow; o: Record<string, any>; onOptions(o: Record<string, any>): void }) {
  const caps = useQuery({
    queryKey: ['tiktok-caps', account.id],
    queryFn: () => api<any>(ws(`/accounts/${account.id}/capabilities`)),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const levels: string[] = caps.data?.privacy_level_options ?? [...TIKTOK_PRIVACY_LEVELS];
  const commercial = Boolean(o.brandOrganicToggle || o.brandContentToggle || o._commercial);

  return (
    <div className="mt-3 space-y-3 text-sm">
      {caps.data?.creator_nickname && (
        <p className="text-xs text-muted">
          Paylaşılacak hesap: <span className="font-medium text-ink">{caps.data.creator_nickname}</span>
        </p>
      )}
      {caps.error && <p className="text-xs text-amber-700">Hesap bilgisi alınamadı: {(caps.error as Error).message}</p>}

      <label className="block">
        <span className="mb-1 block text-xs text-muted">Kimler görebilir?</span>
        <select
          className="h-9 w-full rounded-lg border border-line bg-white px-2 text-sm"
          value={o.privacyLevel ?? ''}
          onChange={(e) => onOptions({ privacyLevel: e.target.value || undefined })}
        >
          <option value="">Seçin…</option>
          {levels.map((l) => (
            <option key={l} value={l} disabled={l === 'SELF_ONLY' && o.brandContentToggle}>
              {PRIVACY_LABEL[l] ?? l}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={!o.disableComment} disabled={caps.data?.comment_disabled} onChange={(e) => onOptions({ disableComment: !e.target.checked })} />
          Yorumlara izin ver
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={!o.disableDuet} disabled={caps.data?.duet_disabled} onChange={(e) => onOptions({ disableDuet: !e.target.checked })} />
          Duet
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={!o.disableStitch} disabled={caps.data?.stitch_disabled} onChange={(e) => onOptions({ disableStitch: !e.target.checked })} />
          Stitch
        </label>
      </div>

      <div className="rounded-lg border border-line p-3">
        <label className="flex items-center gap-2 text-xs font-medium">
          <input
            type="checkbox"
            checked={commercial}
            onChange={(e) =>
              onOptions(e.target.checked ? { _commercial: true } : { _commercial: false, brandOrganicToggle: false, brandContentToggle: false })
            }
          />
          Bu içerik bir markayı, ürünü veya hizmeti tanıtıyor
        </label>
        {commercial && (
          <div className="mt-2 space-y-1.5 pl-5 text-xs">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={Boolean(o.brandOrganicToggle)} onChange={(e) => onOptions({ brandOrganicToggle: e.target.checked })} />
              Kendi markam
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={Boolean(o.brandContentToggle)} onChange={(e) => onOptions({ brandContentToggle: e.target.checked })} />
              Markalı içerik (ücretli iş birliği)
            </label>
            {commercial && !o.brandOrganicToggle && !o.brandContentToggle && (
              <p className="text-amber-700">En az bir seçenek işaretleyin.</p>
            )}
          </div>
        )}
      </div>

      <label className="flex items-start gap-2 text-xs text-muted">
        <input type="checkbox" className="mt-0.5" checked={Boolean(o.musicConsent)} onChange={(e) => onOptions({ musicConsent: e.target.checked })} />
        <span>
          Paylaşarak TikTok'un{' '}
          {o.brandContentToggle && (
            <>
              <a className="underline" href="https://www.tiktok.com/legal/page/global/bc-policy/en" target="_blank" rel="noreferrer">
                Markalı İçerik Politikası
              </a>{' '}
              ve{' '}
            </>
          )}
          <a className="underline" href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noreferrer">
            Müzik Kullanım Onayı
          </a>
          'nı kabul ediyorum.
        </span>
      </label>
    </div>
  );
}

function Preview({ account, text, media }: { account: AccountRow; text: string; media: MediaAssetDto[] }) {
  const first = media[0];
  const short = useMemo(() => (text.length > 220 ? `${text.slice(0, 220)}…` : text), [text]);
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <div className="flex items-center gap-2 px-3 py-2">
        <PlatformBadge platform={account.platform} />
        <span className="truncate text-xs font-medium">{account.username ?? account.name}</span>
      </div>
      {account.platform === 'LINKEDIN' && short && <p className="px-3 pb-2 text-xs whitespace-pre-wrap">{short}</p>}
      {first && (
        <div className={cx('relative bg-gray-100', account.platform === 'TIKTOK' ? 'aspect-[9/16] max-h-80' : 'aspect-square')}>
          <MediaThumb m={first} className="size-full" />
          {media.length > 1 && (
            <span className="absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white">1/{media.length}</span>
          )}
        </div>
      )}
      {account.platform !== 'LINKEDIN' && short && (
        <p className="px-3 py-2 text-xs whitespace-pre-wrap">
          <span className="font-semibold">{account.username ?? account.name}</span> {short}
        </p>
      )}
    </div>
  );
}
