import { PLATFORM_LABELS, type Platform } from '@oneclick/shared';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw, Unplug } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AccountAvatar, Button, Card, EmptyState, Notice, PageHeader, PlatformBadge, Spinner } from '../components/ui';
import { api, ws } from '../lib/api';
import { useAccounts, usePlatforms, type AccountRow } from '../lib/queries';

const PLATFORM_HELP: Record<Platform, string> = {
  INSTAGRAM: 'Business veya Creator hesabı gerekir.',
  TIKTOK: 'Uygulama denetimden geçene kadar gönderiler gizli yayınlanır.',
  LINKEDIN: 'Kişisel profil; onay varsa yönettiğiniz şirket sayfaları da gelir.',
  MOCK: 'Gerçek platforma gitmeden akışı denemek için.',
};

const TYPE_LABEL: Record<string, string> = {
  IG_BUSINESS: 'Instagram profesyonel hesap',
  TIKTOK_CREATOR: 'TikTok hesabı',
  LI_MEMBER: 'LinkedIn kişisel profil',
  LI_ORGANIZATION: 'LinkedIn şirket sayfası',
  MOCK: 'Test hesabı',
};

export function AccountsPage() {
  const accounts = useAccounts();
  const platforms = usePlatforms();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [connecting, setConnecting] = useState<Platform | null>(null);
  const [error, setError] = useState<string | null>(params.get('error'));
  const connected = params.get('connected');

  useEffect(() => {
    if (connected || params.get('error')) {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      const t = setTimeout(() => setParams({}, { replace: true }), 6000);
      return () => clearTimeout(t);
    }
  }, [connected, params, qc, setParams]);

  const connect = async (platform: Platform) => {
    setConnecting(platform);
    setError(null);
    try {
      const { url } = await api<{ url: string }>(ws(`/accounts/connect/${platform.toLowerCase()}`));
      window.location.assign(url);
    } catch (err) {
      setError((err as Error).message);
      setConnecting(null);
    }
  };

  const disconnect = async (a: AccountRow) => {
    if (!window.confirm(`${a.name} hesabının bağlantısı kaldırılsın mı? Planlanmış gönderileri bu hesapta yayınlanmaz.`)) return;
    await api(ws(`/accounts/${a.id}`), { method: 'DELETE' });
    qc.invalidateQueries({ queryKey: ['accounts'] });
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Hesaplar" subtitle="Sosyal hesaplarınızı bağlayın; giriş ve izin işlemi platformun kendi ekranında yapılır." />

      <div className="space-y-3">
        {connected && (
          <Notice tone="success">
            {PLATFORM_LABELS[connected.toUpperCase() as Platform] ?? connected} bağlandı
            {Number(params.get('count')) > 1 ? ` (${params.get('count')} hesap)` : ''}.
          </Notice>
        )}
        {error && <Notice tone="error">{error}</Notice>}
      </div>

      <h2 className="mt-6 mb-3 text-sm font-semibold text-muted">Yeni hesap bağla</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(platforms.data ?? []).map(({ platform, configured }) => (
          <Card key={platform} className="flex flex-col p-4">
            <div className="flex items-center gap-2.5">
              <PlatformBadge platform={platform} size={28} />
              <span className="font-medium">{PLATFORM_LABELS[platform]}</span>
            </div>
            <p className="mt-2 flex-1 text-[13px] leading-snug text-muted">{PLATFORM_HELP[platform]}</p>
            {configured ? (
              <Button className="mt-4" onClick={() => connect(platform)} loading={connecting === platform}>
                Bağla
              </Button>
            ) : (
              <p className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-xs text-muted">
                Uygulama anahtarları .env dosyasında tanımlı değil.
              </p>
            )}
          </Card>
        ))}
      </div>

      <h2 className="mt-8 mb-3 text-sm font-semibold text-muted">Bağlı hesaplar</h2>
      {accounts.isLoading ? (
        <Spinner />
      ) : !accounts.data?.length ? (
        <EmptyState title="Henüz bağlı hesap yok" body="Yukarıdan bir platform seçerek başlayın." />
      ) : (
        <Card className="divide-y divide-line">
          {accounts.data.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <AccountAvatar name={a.name} url={a.avatarUrl} platform={a.platform} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {a.name}
                  {a.username && <span className="ml-1.5 font-normal text-muted">@{a.username}</span>}
                </p>
                <p className="text-xs text-muted">{TYPE_LABEL[a.accountType]}</p>
                {a.status === 'NEEDS_REAUTH' && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
                    <AlertTriangle className="size-3.5" /> {a.lastError ?? 'Yeniden bağlanması gerekiyor'}
                  </p>
                )}
              </div>
              {a.status === 'NEEDS_REAUTH' && (
                <Button size="sm" variant="primary" onClick={() => connect(a.platform)}>
                  <RefreshCw className="size-3.5" /> Yeniden bağla
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => disconnect(a)} aria-label={`${a.name} bağlantısını kaldır`}>
                <Unplug className="size-3.5" /> Kaldır
              </Button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
