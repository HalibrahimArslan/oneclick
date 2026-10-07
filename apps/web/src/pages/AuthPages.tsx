import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Field, Input, Notice } from '../components/ui';
import { useAuth } from '../lib/auth';

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-ink">
            <span className="size-3 rounded-full bg-cyan-400" />
          </span>
          <span className="text-lg font-semibold tracking-tight">OneClick</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 mb-6 text-sm text-muted">{subtitle}</p>
        {children}
      </div>
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
    <Shell title="Giriş yap" subtitle="Tüm sosyal hesaplarınız tek ekranda.">
      <form onSubmit={submit} className="space-y-4">
        {error && <Notice tone="error">{error}</Notice>}
        <Field label="E-posta">
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Şifre">
          <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" className="w-full" loading={busy}>
          Giriş yap
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted">
        Hesabınız yok mu?{' '}
        <Link to="/register" className="font-medium text-ink underline underline-offset-2">
          Kayıt olun
        </Link>
      </p>
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
    <Shell title="Hesap oluştur" subtitle="Birkaç saniyede başlayın.">
      <form onSubmit={submit} className="space-y-4">
        {error && <Notice tone="error">{error}</Notice>}
        <Field label="Ad soyad">
          <Input required value={form.name} onChange={set('name')} autoComplete="name" />
        </Field>
        <Field label="E-posta">
          <Input type="email" required value={form.email} onChange={set('email')} autoComplete="email" />
        </Field>
        <Field label="Şifre" hint="En az 8 karakter">
          <Input type="password" required minLength={8} value={form.password} onChange={set('password')} autoComplete="new-password" />
        </Field>
        <Field label="Ajans veya marka adı" hint="İsteğe bağlı, sonra değiştirebilirsiniz">
          <Input value={form.workspaceName} onChange={set('workspaceName')} />
        </Field>
        <Button type="submit" variant="primary" className="w-full" loading={busy}>
          Kayıt ol
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted">
        Zaten hesabınız var mı?{' '}
        <Link to="/login" className="font-medium text-ink underline underline-offset-2">
          Giriş yapın
        </Link>
      </p>
    </Shell>
  );
}
