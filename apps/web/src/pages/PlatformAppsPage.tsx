import { PLATFORM_LABELS, type PlatformAppDto } from '@oneclick/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Copy, ExternalLink, KeyRound, ShieldCheck, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useFeedback } from '../components/feedback';
import { PlatformIcon } from '../components/identity';
import { Button, Card, Field, Input, Notice, PageHeader, Skeleton, Switch } from '../components/ui';
import { api, ws } from '../lib/api';
import { useAuth } from '../lib/auth';
import { usePlatformApps } from '../lib/queries';

type RealPlatform = PlatformAppDto['platform'];

const GUIDE: Record<string, { console: string; idLabel: string; secretLabel: string; steps: string[] }> = {
  INSTAGRAM: {
    console: 'https://developers.facebook.com/apps',
    idLabel: 'App ID',
    secretLabel: 'App Secret',
    steps: [
      'Meta for Developers’ta bir uygulama oluşturun ve “Facebook Login for Business” ürününü ekleyin.',
      'Aşağıdaki yönlendirme adresini Facebook Login → Ayarlar → “Geçerli OAuth Yönlendirme URI’leri” alanına ekleyin.',
      'App ID ve App Secret değerlerini Uygulama ayarları → Temel sayfasından kopyalayın.',
      'Instagram hesabınız Professional olmalı ve bir Facebook Sayfasına bağlı olmalı.',
    ],
  },
  LINKEDIN: {
    console: 'https://www.linkedin.com/developers/apps',
    idLabel: 'Client ID',
    secretLabel: 'Client Secret',
    steps: [
      'LinkedIn Developers’ta bir uygulama oluşturun (bir şirket sayfasıyla ilişkilendirmeniz istenir).',
      'Products sekmesinden “Sign In with LinkedIn using OpenID Connect” ve “Share on LinkedIn” ürünlerini ekleyin.',
      'Auth sekmesinde aşağıdaki adresi “Authorized redirect URLs” listesine ekleyin.',
      'Client ID ve Client Secret değerlerini aynı sekmeden kopyalayın.',
    ],
  },
  TIKTOK: {
    console: 'https://developers.tiktok.com/apps',
    idLabel: 'Client Key',
    secretLabel: 'Client Secret',
    steps: [
      'TikTok for Developers’ta bir uygulama oluşturun; Login Kit ve Content Posting API ürünlerini ekleyin.',
      'Login Kit ayarlarında aşağıdaki yönlendirme adresini ekleyin.',
      'Client Key ve Client Secret değerlerini uygulama sayfasından kopyalayın.',
      'Uygulama denetimden geçene kadar gönderiler yalnızca gizli (sadece ben) yayınlanır.',
    ],
  },
};

export function PlatformAppsPage() {
  const { workspace } = useAuth();
  const apps = usePlatformApps();
  const canEdit = workspace?.role === 'OWNER' || workspace?.role === 'ADMIN';

  return (
    <div className="mx-auto max-w-300">
      <PageHeader
        title="Platform uygulamaları"
        subtitle="Hesaplar, sizin oluşturduğunuz geliştirici uygulamaları üzerinden bağlanır. Bilgileriniz şifrelenerek saklanır."
      />

      {!canEdit ? (
        <Notice tone="info">Platform uygulamalarını yalnızca çalışma alanı sahibi veya yöneticisi görebilir ve düzenleyebilir.</Notice>
      ) : apps.isError ? (
        <Notice tone="error">{(apps.error as Error).message}</Notice>
      ) : (
        <>
          <div className="mb-5">
            <Notice tone="info">
              Her platformda kendi uygulamanızı açtığınızda hesaplarınıza yalnızca siz erişirsiniz. Kendi hesaplarınızı ve müşterilerinizin size yetki verdiği
              hesapları yönettiğiniz sürece uygulamanın geliştirme modunda kalması yeterlidir.
            </Notice>
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {apps.isLoading
              ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-96 rounded-card" />)
              : (apps.data ?? []).map((a) => <AppCard key={a.platform} app={a} />)}
          </div>
        </>
      )}
    </div>
  );
}

function StatusBadge({ app }: { app: PlatformAppDto }) {
  if (app.source === 'workspace')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-published-bg px-2 py-0.5 text-micro font-medium text-published-fg">
        <ShieldCheck className="size-3" /> Kayıtlı
      </span>
    );
  if (app.source === 'env') return <span className="rounded-full bg-scheduled-bg px-2 py-0.5 text-micro font-medium text-scheduled-fg">Sunucu varsayılanı</span>;
  return <span className="rounded-full bg-subtle px-2 py-0.5 text-micro font-medium text-muted">Tanımlı değil</span>;
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* pano erişimi yoksa kullanıcı elle seçer */
    }
  };
  return (
    <div className="flex items-center gap-1.5 rounded-control border border-line bg-canvas py-1 pr-1 pl-2.5">
      <code className="min-w-0 flex-1 truncate text-caption text-ink-2" title={value}>
        {value}
      </code>
      <Button size="sm" variant="ghost" icon={copied ? Check : Copy} onClick={copy} aria-label="Yönlendirme adresini kopyala">
        {copied ? 'Kopyalandı' : 'Kopyala'}
      </Button>
    </div>
  );
}

function AppCard({ app }: { app: PlatformAppDto }) {
  const qc = useQueryClient();
  const { toast, confirm } = useFeedback();
  const guide = GUIDE[app.platform];
  const saved = app.source === 'workspace';
  const [clientId, setClientId] = useState(app.clientId ?? '');
  const [secret, setSecret] = useState('');
  const [orgs, setOrgs] = useState(Boolean(app.options.organizationsEnabled));
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);

  useEffect(() => {
    setClientId(app.clientId ?? '');
    setOrgs(Boolean(app.options.organizationsEnabled));
    setSecret('');
  }, [app.clientId, app.options.organizationsEnabled, app.updatedAt]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['platform-apps'] });
    qc.invalidateQueries({ queryKey: ['platforms'] });
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy('save');
    try {
      await api(ws(`/platform-apps/${app.platform.toLowerCase()}`), {
        method: 'PUT',
        body: {
          clientId: clientId.trim(),
          ...(secret.trim() ? { clientSecret: secret.trim() } : {}),
          options: app.platform === 'LINKEDIN' ? { organizationsEnabled: orgs } : {},
        },
      });
      refresh();
      toast(`${PLATFORM_LABELS[app.platform]} uygulaması kaydedildi.`, 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `${PLATFORM_LABELS[app.platform]} uygulaması kaldırılsın mı?`,
      body: 'Bağlı hesaplar çalışmaya devam eder, ancak yeni hesap bağlanamaz ve süresi dolan bağlantılar yenilenemez.',
      action: 'Kaldır',
      danger: true,
    });
    if (!ok) return;
    setBusy('remove');
    try {
      await api(ws(`/platform-apps/${app.platform.toLowerCase()}`), { method: 'DELETE' });
      refresh();
      toast(`${PLATFORM_LABELS[app.platform]} uygulaması kaldırıldı.`, 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const id = (s: string) => `${app.platform}-${s}`;

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-3">
        <PlatformIcon platform={app.platform as RealPlatform} size={28} />
        <div className="min-w-0 flex-1">
          <h2 className="text-heading font-semibold">{PLATFORM_LABELS[app.platform]}</h2>
        </div>
        <StatusBadge app={app} />
      </div>

      <ol className="mb-4 list-decimal space-y-1.5 pl-4 text-caption text-muted marker:text-faint">
        {guide.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <a href={guide.console} target="_blank" rel="noreferrer" className="mb-4 inline-flex items-center gap-1 text-caption font-medium text-brand-700 hover:underline">
        Geliştirici konsolunu aç <ExternalLink className="size-3" />
      </a>

      <div className="mb-4">
        <span className="mb-1.5 block text-small font-medium text-ink">Yönlendirme adresi (redirect URI)</span>
        <CopyField value={app.redirectUri} />
      </div>

      <form onSubmit={save} className="space-y-3.5">
        <Field label={guide.idLabel} htmlFor={id('cid')}>
          <Input id={id('cid')} required value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" spellCheck={false} />
        </Field>
        <Field
          label={guide.secretLabel}
          htmlFor={id('secret')}
          hint={saved && app.secretHint ? `Kayıtlı (…${app.secretHint}). Değiştirmek için yenisini girin.` : undefined}
        >
          <Input
            id={id('secret')}
            type="password"
            required={!saved}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder={saved ? '••••••••' : ''}
            autoComplete="new-password"
            spellCheck={false}
          />
        </Field>
        {app.platform === 'LINKEDIN' && (
          <Switch checked={orgs} onChange={setOrgs} label="Şirket sayfaları (Community Management API onayı gerekir)" />
        )}
        <div className="flex items-center gap-2 pt-1">
          <Button type="submit" variant="primary" icon={KeyRound} loading={busy === 'save'} disabled={Boolean(busy)}>
            {saved ? 'Güncelle' : 'Kaydet'}
          </Button>
          {saved && (
            <Button variant="danger" icon={Trash2} onClick={remove} loading={busy === 'remove'} disabled={Boolean(busy)}>
              Kaldır
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
