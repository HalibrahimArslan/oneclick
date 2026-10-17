import { CalendarCheck2, Eye, Layers } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PlatformIcon } from '../components/identity';
import { Logo } from '../components/Layout';
import { Button, cx, Field, Input, Notice } from '../components/ui';
import { useAuth } from '../lib/auth';

const PROMISES = [
  { icon: Layers, title: 'Bir kez yazın', body: 'Instagram, TikTok ve LinkedIn için tek metin, hesaba göre ince ayar.' },
  { icon: CalendarCheck2, title: 'Takvimde planlayın', body: 'Sürükleyip bırakın, zamanı gelince OneClick yayınlasın.' },
  { icon: Eye, title: 'Yayınlamadan görün', body: 'Her platformda nasıl görüneceğini önceden kontrol edin.' },
];

// Marka paneli için CSS ile çizilmiş küçük takvim önizlemesi (DESIGN.md §5.7)
const MINI = [
  { d: 'Pzt', items: [{ t: '09:30', p: 'INSTAGRAM' as const, w: 'w-16', bar: 'bg-published' }] },
  { d: 'Sal', items: [{ t: '12:00', p: 'LINKEDIN' as const, w: 'w-20', bar: 'bg-published' }] },
  { d: 'Çar', items: [{ t: '17:30', p: 'TIKTOK' as const, w: 'w-14', bar: 'bg-scheduled' }, { t: '19:00', p: 'INSTAGRAM' as const, w: 'w-12', bar: 'bg-scheduled' }] },
  { d: 'Per', items: [{ t: '11:00', p: 'LINKEDIN' as const, w: 'w-16', bar: 'bg-scheduled' }] },
  { d: 'Cum', items: [] },
];

function Shell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="flex min-h-full bg-surface">
      <div className="flex w-full flex-col px-6 py-8 sm:px-12 lg:max-w-130 lg:px-16">
        <div className="flex items-center gap-2.5">
          <Logo size={30} />
          <span className="text-heading font-semibold tracking-tight">OneClick</span>
        </div>
        <div className="my-auto w-full max-w-sm py-12">
          <h1 className="text-[26px] leading-8 font-semibold tracking-tight">{title}</h1>
          <p className="mt-1.5 mb-8 text-body text-muted">{subtitle}</p>
          {children}
          <p className="mt-8 text-small text-muted">{footer}</p>
        </div>
      </div>

      <aside className="relative hidden flex-1 overflow-hidden bg-brand-600 lg:flex lg:flex-col lg:justify-center lg:px-16 xl:px-24">
        <div className="absolute -top-40 -right-40 size-120 rounded-full bg-brand-500/50" aria-hidden />
        <div className="absolute -bottom-48 -left-24 size-105 rounded-full bg-brand-700/40" aria-hidden />
        <div className="relative max-w-lg">
          <ul className="space-y-6">
            {PROMISES.map(({ icon: Icon, title: t, body }) => (
              <li key={t} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-card bg-white/12 text-white">
                  <Icon className="size-5" strokeWidth={1.75} />
                </span>
                <div>
                  <p className="text-heading font-semibold text-white">{t}</p>
                  <p className="mt-0.5 text-small text-brand-100">{body}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-12 rounded-pop bg-surface p-4 shadow-modal" aria-hidden>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-small font-semibold text-ink">Bu hafta</span>
              <span className="flex gap-1">
                <PlatformIcon platform="INSTAGRAM" size={16} />
                <PlatformIcon platform="TIKTOK" size={16} />
                <PlatformIcon platform="LINKEDIN" size={16} />
              </span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {MINI.map((col) => (
                <div key={col.d} className="min-h-28 rounded-control bg-canvas p-1.5">
                  <p className="mb-1.5 text-micro font-medium text-muted">{col.d}</p>
                  <div className="space-y-1.5">
                    {col.items.map((it, i) => (
                      <div key={i} className="relative overflow-hidden rounded-chip border border-line bg-surface p-1.5 pl-2.5">
                        <span className={cx('absolute inset-y-0 left-0 w-0.75', it.bar)} />
                        <div className="flex items-center gap-1">
                          <PlatformIcon platform={it.p} size={12} />
                          <span className="text-[10px] font-medium text-ink-2 tabular-nums">{it.t}</span>
                        </div>
                        <span className={cx('mt-1 block h-1.5 rounded-full bg-line', it.w, 'max-w-full')} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      navigate('/calendar', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell
      title="Tekrar hoş geldiniz"
      subtitle="Tüm sosyal hesaplarınız tek ekranda."
      footer={
        <>
          Hesabınız yok mu?{' '}
          <Link to="/register" className="font-medium text-brand-700 hover:underline">
            Kayıt olun
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Notice tone="error">{error}</Notice>}
        <Field label="E-posta">
          <Input inputSize="lg" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Şifre">
          <Input inputSize="lg" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
          Giriş yap
        </Button>
      </form>
    </Shell>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', workspaceName: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register({ ...form, workspaceName: form.workspaceName || undefined });
      navigate('/accounts', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell
      title="Hesap oluşturun"
      subtitle="Birkaç saniyede başlayın, ilk hesabınızı hemen bağlayın."
      footer={
        <>
          Zaten hesabınız var mı?{' '}
          <Link to="/login" className="font-medium text-brand-700 hover:underline">
            Giriş yapın
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Notice tone="error">{error}</Notice>}
        <Field label="Ad soyad">
          <Input inputSize="lg" required value={form.name} onChange={set('name')} autoComplete="name" />
        </Field>
        <Field label="E-posta">
          <Input inputSize="lg" type="email" required value={form.email} onChange={set('email')} autoComplete="email" />
        </Field>
        <Field label="Şifre" hint="En az 8 karakter">
          <Input inputSize="lg" type="password" required minLength={8} value={form.password} onChange={set('password')} autoComplete="new-password" />
        </Field>
        <Field label="Ajans veya marka adı" hint="İsteğe bağlı, sonra değiştirebilirsiniz">
          <Input inputSize="lg" value={form.workspaceName} onChange={set('workspaceName')} />
        </Field>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
          Kayıt ol
        </Button>
      </form>
    </Shell>
  );
}
