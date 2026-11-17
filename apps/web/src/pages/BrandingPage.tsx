import { DEFAULT_APP_NAME, DEFAULT_BRAND_COLOR, type BrandingDto } from '@oneclick/shared';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Check, ImageUp, LayoutList, RotateCcw, SquarePen, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { useFeedback } from '../components/feedback';
import { Button, Card, Field, Input, Notice, PageHeader } from '../components/ui';
import { api, uploadFile, ws } from '../lib/api';
import { useAuth } from '../lib/auth';
import { brandShades, contrastWithWhite, useBranding } from '../lib/branding';

const HEX = /^#[0-9a-fA-F]{6}$/;
// Hazır tonlar: hepsi beyaz yazıyla AA kontrastı (4.5:1) sağlar
const PRESETS = ['#4b4fe0', '#2563eb', '#0f766e', '#15803d', '#b45309', '#c2410c', '#be123c', '#7e22ce', '#334155'];

export function BrandingPage() {
  const { workspace } = useAuth();

  return (
    <div className="mx-auto max-w-300">
      <PageHeader title="Marka" subtitle="Panelin adı, logosu ve ana rengi. Giriş ekranı dahil kurulumun tamamında geçerlidir." />
      {workspace?.demoExpiresAt ? (
        <Notice tone="info">
          Demo hesabında marka değiştirilemez. Kendi kurulumunuzda paneli kendi adınız, logonuz ve renginizle kullanırsınız; giriş ekranı da dahil her yer bu
          markayla görünür.
        </Notice>
      ) : workspace?.role !== 'OWNER' ? (
        <Notice tone="info">Markayı yalnızca çalışma alanı sahibi değiştirebilir.</Notice>
      ) : (
        <BrandingForm />
      )}
    </div>
  );
}

function BrandingForm() {
  const qc = useQueryClient();
  const { toast } = useFeedback();
  const current = useBranding();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(current.appName === DEFAULT_APP_NAME ? '' : current.appName);
  const [color, setColor] = useState(current.color ?? '');
  const [busy, setBusy] = useState<'save' | 'reset' | 'logo' | 'logo-remove' | null>(null);

  // Sunucudaki marka değişince (kaydet, başka sekme) formu eşitle
  useEffect(() => {
    setName(current.appName === DEFAULT_APP_NAME ? '' : current.appName);
    setColor(current.color ?? '');
  }, [current.appName, current.color]);

  const colorValid = color === '' || HEX.test(color);
  const effectiveColor = colorValid && color ? color.toLowerCase() : DEFAULT_BRAND_COLOR;
  const contrast = contrastWithWhite(effectiveColor);
  const dirty = name.trim() !== (current.appName === DEFAULT_APP_NAME ? '' : current.appName) || (color || null) !== current.color;

  const applied = (b: BrandingDto) => qc.setQueryData(['auth-config'], (old: object | undefined) => (old ? { ...old, branding: b } : old));
  const path = ws('/branding');

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!colorValid) return;
    setBusy('save');
    try {
      applied(await api<BrandingDto>(path, { method: 'PUT', body: { appName: name.trim() || null, color: color ? color.toLowerCase() : null } }));
      toast('Marka kaydedildi.', 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    setBusy('reset');
    try {
      applied(await api<BrandingDto>(path, { method: 'PUT', body: { appName: null, color: null } }));
      toast('Ad ve renk varsayılana döndü.', 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const upload = async (file: File) => {
    setBusy('logo');
    try {
      applied(await uploadFile<BrandingDto>(`${path}/logo`, file));
      toast('Logo yüklendi.', 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeLogo = async () => {
    setBusy('logo-remove');
    try {
      applied(await api<BrandingDto>(`${path}/logo`, { method: 'DELETE' }));
      toast('Logo kaldırıldı.', 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const customized = current.appName !== DEFAULT_APP_NAME || current.color !== null;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <Card className="p-5">
        {/* Logo ayrı yüklenir; seçince hemen kaydedilir */}
        <div className="mb-6">
          <span className="mb-1.5 block text-small font-medium text-ink">Logo</span>
          <div className="flex items-center gap-4">
            <LogoMark url={current.logoUrl} color={effectiveColor} size={56} />
            <div className="min-w-0">
              <div className="flex flex-wrap gap-2">
                <Button icon={ImageUp} loading={busy === 'logo'} disabled={Boolean(busy)} onClick={() => fileRef.current?.click()}>
                  {current.logoUrl ? 'Değiştir' : 'Logo yükle'}
                </Button>
                {current.logoUrl && (
                  <Button variant="danger" icon={Trash2} loading={busy === 'logo-remove'} disabled={Boolean(busy)} onClick={removeLogo}>
                    Kaldır
                  </Button>
                )}
              </div>
              <p className="mt-1.5 text-caption text-muted">Kare PNG, JPEG veya WebP, en fazla 2 MB. Tarayıcı sekmesinde simge olarak da görünür.</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            />
          </div>
        </div>

        <form onSubmit={save} className="space-y-5">
          <Field label="Uygulama adı" htmlFor="brand-name" hint="Kenar çubuğunda, giriş ekranında ve sekme başlığında görünür.">
            <Input id="brand-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={DEFAULT_APP_NAME} maxLength={40} autoComplete="off" />
          </Field>

          <div>
            <span className="mb-1.5 block text-small font-medium text-ink">Ana renk</span>
            <div className="mb-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Hazır renkler">
              {PRESETS.map((p) => {
                const selected = effectiveColor === p;
                return (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={p}
                    title={p}
                    onClick={() => setColor(p === DEFAULT_BRAND_COLOR ? '' : p)}
                    className="flex size-8 items-center justify-center rounded-full ring-offset-2 transition-shadow hover:ring-2 hover:ring-line-strong aria-checked:ring-2 aria-checked:ring-ink"
                    style={{ background: p }}
                  >
                    {selected && <Check className="size-4 text-white" strokeWidth={2.5} />}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Özel renk seç"
                value={effectiveColor}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-11 cursor-pointer rounded-control border border-line-strong bg-surface p-1"
              />
              <div className="w-32">
                <Input
                  aria-label="Renk kodu"
                  value={color}
                  onChange={(e) => setColor(e.target.value.trim())}
                  placeholder={DEFAULT_BRAND_COLOR}
                  maxLength={7}
                  spellCheck={false}
                  className="font-mono"
                />
              </div>
            </div>
            {!colorValid ? (
              <p className="mt-1.5 text-caption text-failed-fg">Renk #RRGGBB biçiminde olmalı (ör. #0f766e).</p>
            ) : (
              contrast < 4.5 && (
                <div className="mt-3">
                  <Notice tone="warning">
                    Düğmelerdeki beyaz yazı bu renk üzerinde zor okunur (kontrast {contrast.toFixed(1)}:1, en az 4.5:1 önerilir). Daha koyu bir ton seçin.
                  </Notice>
                </div>
              )
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <Button type="submit" variant="primary" loading={busy === 'save'} disabled={Boolean(busy) || !dirty || !colorValid}>
              Kaydet
            </Button>
            {customized && (
              <Button variant="ghost" icon={RotateCcw} loading={busy === 'reset'} disabled={Boolean(busy)} onClick={reset}>
                Ad ve rengi varsayılana döndür
              </Button>
            )}
          </div>
        </form>
      </Card>

      <Preview name={name.trim() || DEFAULT_APP_NAME} color={effectiveColor} logoUrl={current.logoUrl} />
    </div>
  );
}

/** Kaydetmeden önce görmek için: CSS değişkenleri yalnızca bu kutuda değişir */
function Preview({ name, color, logoUrl }: { name: string; color: string; logoUrl: string | null }) {
  const vars = Object.fromEntries(Object.entries(brandShades(color)).map(([k, v]) => [`--color-brand-${k}`, v])) as CSSProperties;
  return (
    <Card className="p-4 lg:sticky lg:top-6">
      <p className="mb-3 text-micro font-medium text-faint">Önizleme</p>
      <div style={vars} className="rounded-control border border-line bg-surface p-3" aria-hidden>
        <div className="mb-3 flex items-center gap-2.5 px-1">
          <LogoMark url={logoUrl} color={color} size={28} />
          <span className="min-w-0 truncate text-small font-semibold">{name}</span>
        </div>
        <div className="mb-3 flex h-9 items-center justify-center gap-2 rounded-control bg-brand-600 text-body font-medium text-white">
          <SquarePen className="size-4" strokeWidth={1.75} /> Gönderi oluştur
        </div>
        <div className="mb-0.5 flex h-9 items-center gap-2.5 rounded-control bg-brand-50 px-2.5 text-body font-medium text-brand-700">
          <CalendarDays className="size-4.5" strokeWidth={1.75} /> Takvim
        </div>
        <div className="flex h-9 items-center gap-2.5 rounded-control px-2.5 text-body text-muted">
          <LayoutList className="size-4.5" strokeWidth={1.75} /> Gönderiler
        </div>
      </div>
    </Card>
  );
}

/** Logo önizlemesi: kaydedilmemiş rengi de gösterebilsin diye Layout'taki Logo'dan ayrı */
function LogoMark({ url, color, size }: { url: string | null; color: string; size: number }) {
  if (url) return <img src={url} alt="" className="shrink-0 rounded-control border border-line object-contain" style={{ width: size, height: size }} />;
  return (
    <span className="flex shrink-0 items-center justify-center rounded-control" style={{ width: size, height: size, background: color }}>
      <span className="rounded-full bg-surface" style={{ width: size * 0.36, height: size * 0.36 }} />
    </span>
  );
}
