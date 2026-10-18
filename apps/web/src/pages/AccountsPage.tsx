import { PLATFORM_LABELS, PLATFORMS, type Platform } from '@oneclick/shared';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Info, Loader2, Lock, MoreHorizontal, Plug, Plus, RefreshCw, Search, Unplug } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useFeedback } from '../components/feedback';
import { AccountAvatar, PlatformIcon } from '../components/identity';
import { Button, Card, cx, EmptyState, IconButton, MenuItem, PageHeader, Popover, Skeleton } from '../components/ui';
import { api, ws } from '../lib/api';
import { useAccounts, usePlatforms, type AccountRow } from '../lib/queries';

const PLATFORM_KIND: Record<Platform, string> = {
  INSTAGRAM: 'Profesyonel hesaplar',
  TIKTOK: 'İçerik üretici hesapları',
  LINKEDIN: 'Profil ve şirket sayfaları',
  MOCK: 'Gerçek platforma gitmeden deneme',
};

const TYPE_LABEL: Record<string, string> = {
  IG_BUSINESS: 'Profesyonel hesap',
  TIKTOK_CREATOR: 'TikTok hesabı',
  LI_MEMBER: 'Kişisel profil',
  LI_ORGANIZATION: 'Şirket sayfası',
  MOCK: 'Test hesabı',
};

export function AccountsPage() {
  const accounts = useAccounts();
  const platforms = usePlatforms();
  const qc = useQueryClient();
  const { toast, confirm } = useFeedback();
  const [params, setParams] = useSearchParams();
  const [connecting, setConnecting] = useState<Platform | null>(null);
  const [q, setQ] = useState('');

  // OAuth dönüşü: sonucu toast ile göster, parametreyi temizle
  useEffect(() => {
    const connected = params.get('connected');
    const error = params.get('error');
    if (!connected && !error) return;
    qc.invalidateQueries({ queryKey: ['accounts'] });
    if (connected) {
      const n = Number(params.get('count'));
      toast(`${PLATFORM_LABELS[connected.toUpperCase() as Platform] ?? connected} bağlandı${n > 1 ? ` (${n} hesap)` : ''}.`, 'success');
    }
    if (error) toast(error, 'error');
    setParams({}, { replace: true });
  }, [params, qc, setParams, toast]);

  const connect = async (platform: Platform) => {
    setConnecting(platform);
    try {
      const { url } = await api<{ url: string }>(ws(`/accounts/connect/${platform.toLowerCase()}`));
      window.location.assign(url);
    } catch (err) {
      toast((err as Error).message, 'error');
      setConnecting(null);
    }
  };

  const disconnect = async (a: AccountRow) => {
    const ok = await confirm({
      title: `${a.name} bağlantısı kaldırılsın mı?`,
      body: 'Bu hesaba planlanmış gönderiler yayınlanmaz. Geçmiş gönderiler OneClick’te kalır.',
      action: 'Bağlantıyı kaldır',
      danger: true,
    });
    if (!ok) return;
    try {
      await api(ws(`/accounts/${a.id}`), { method: 'DELETE' });
      qc.invalidateQueries({ queryKey: ['accounts'] });
      toast(`${a.name} bağlantısı kaldırıldı.`, 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  const list = (accounts.data ?? []).filter((a) => `${a.name} ${a.username ?? ''}`.toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr')));
  const groups = PLATFORMS.map((p) => ({ platform: p, items: list.filter((a) => a.platform === p) })).filter((g) => g.items.length);

  return (
    <div className="mx-auto max-w-300">
      <PageHeader title="Hesaplar" subtitle="Sosyal hesaplarınızı bağlayın. Giriş ve izin işlemi platformun kendi ekranında yapılır." />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section>
          <h2 className="mb-3 text-small font-semibold text-muted">Hesap bağla</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {platforms.isLoading
              ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-card" />)
              : (platforms.data ?? []).map(({ platform, configured }) => {
                  const busy = connecting === platform;
                  return (
                    <button
                      key={platform}
                      type="button"
                      disabled={!configured || Boolean(connecting)}
                      onClick={() => connect(platform)}
                      title={configured ? `${PLATFORM_LABELS[platform]} hesabı bağla` : 'Uygulama anahtarları henüz girilmedi.'}
                      className={cx(
                        'group relative flex h-28 flex-col items-center justify-center gap-1 rounded-card border px-4 text-center transition-colors',
                        configured ? 'border-line bg-surface hover:border-brand-200' : 'cursor-not-allowed border-line bg-canvas',
                        connecting && !busy && configured && 'opacity-60',
                      )}
                    >
                      <span className="absolute top-3 right-3">
                        {busy ? (
                          <Loader2 className="size-4 animate-spin text-brand-600" />
                        ) : configured ? (
                          <Plus className="size-4 text-faint group-hover:text-brand-600" />
                        ) : (
                          <Lock className="size-3.5 text-faint" />
                        )}
                      </span>
                      <span className={cx(!configured && 'opacity-50 grayscale')}>
                        <PlatformIcon platform={platform} size={28} />
                      </span>
                      <span className={cx('mt-1.5 text-small font-semibold', !configured && 'text-muted')}>{PLATFORM_LABELS[platform]}</span>
                      <span className="text-caption text-muted">
                        {busy ? 'Yönlendiriliyor…' : configured ? PLATFORM_KIND[platform] : <span className="rounded-full bg-subtle px-2 py-0.5 text-micro font-medium">Yapılandırılmadı</span>}
                      </span>
                    </button>
                  );
                })}
          </div>
          <p className="mt-4 flex items-start gap-2 text-caption text-muted">
            <Info className="mt-px size-3.5 shrink-0" />
            Instagram'da bir Facebook Sayfasına bağlı Business veya Creator hesabı gerekir. TikTok uygulaması denetimden geçene kadar gönderiler gizli yayınlanır. LinkedIn'de kişisel profil ve,
            onay varsa, yönettiğiniz şirket sayfaları bağlanır.
          </p>
        </section>

        <Card className="overflow-hidden">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <h2 className="flex-1 text-heading font-semibold">
              Bağlı hesaplar <span className="font-normal text-muted tabular-nums">({accounts.data?.length ?? 0})</span>
            </h2>
            <div className="relative w-40">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Ara"
                aria-label="Bağlı hesaplarda ara"
                className="h-8 w-full rounded-control border border-line-strong pr-2 pl-8 text-small placeholder:text-faint focus:border-brand-500 focus:ring-3 focus:ring-brand-100 focus:outline-none"
              />
            </div>
          </div>

          {accounts.isLoading ? (
            <div className="space-y-3 p-4">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : !accounts.data?.length ? (
            <EmptyState icon={Plug} title="Henüz bağlı hesap yok" body="Soldan bir platform seçerek ilk hesabınızı bağlayın." />
          ) : !groups.length ? (
            <p className="px-4 py-8 text-center text-small text-muted">Eşleşen hesap yok.</p>
          ) : (
            groups.map(({ platform, items }) => (
              <div key={platform} className="border-b border-line last:border-b-0">
                <p className="flex items-center gap-2 bg-canvas px-4 py-2 text-caption font-semibold text-ink-2">
                  <PlatformIcon platform={platform} size={16} />
                  {PLATFORM_LABELS[platform]}
                  <span className="font-normal text-muted tabular-nums">{items.length}</span>
                </p>
                {items.map((a) => (
                  <div key={a.id} className="border-t border-line px-4 py-2.5 first:border-t-0">
                    <div className="flex items-center gap-3">
                      <AccountAvatar name={a.name} url={a.avatarUrl} platform={a.platform} size={32} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-small font-medium">{a.name}</p>
                        <p className="truncate text-caption text-muted">
                          {a.username && `@${a.username} · `}
                          {TYPE_LABEL[a.accountType]}
                        </p>
                      </div>
                      <Popover align="end" className="w-52" trigger={({ toggle }) => <IconButton icon={MoreHorizontal} size="sm" label={`${a.name} işlemleri`} onClick={toggle} />}>
                        {(close) => (
                          <div role="menu">
                            <MenuItem
                              icon={RefreshCw}
                              onClick={() => {
                                close();
                                connect(a.platform);
                              }}
                            >
                              Yeniden bağla
                            </MenuItem>
                            <MenuItem
                              icon={Unplug}
                              danger
                              onClick={() => {
                                close();
                                disconnect(a);
                              }}
                            >
                              Bağlantıyı kaldır
                            </MenuItem>
                          </div>
                        )}
                      </Popover>
                    </div>
                    {a.status === 'NEEDS_REAUTH' && (
                      <div className="mt-2 ml-11 flex flex-wrap items-center gap-2 rounded-control bg-pending-bg px-3 py-2 text-caption text-pending-fg">
                        <AlertTriangle className="size-3.5 shrink-0" />
                        <span className="min-w-0 flex-1">{a.lastError ?? 'Yeniden bağlanması gerekiyor.'}</span>
                        <Button size="sm" variant="primary" icon={RefreshCw} onClick={() => connect(a.platform)} loading={connecting === a.platform}>
                          Yeniden bağla
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}
        </Card>
      </div>
    </div>
  );
}
