import { DEFAULT_APP_NAME, type BrandingDto } from '@oneclick/shared';
import { useEffect } from 'react';
import { useAuthConfig } from './queries';
import { readLocal, writeLocal } from './storage';

/**
 * Beyaz etiket: kurulumun adı, rengi ve logosu GET /auth/config ile gelir.
 * Son marka tarayıcıda da saklanır; böylece açılışta bir an varsayılan renk/ad görünmez.
 */
const CACHE_KEY = 'oneclick.branding';
const DEFAULT_BRANDING: BrandingDto = { appName: DEFAULT_APP_NAME, color: null, logoUrl: null };

export function useBranding(): BrandingDto {
  const fetched = useAuthConfig().data?.branding;
  return fetched ?? readLocal<BrandingDto>(CACHE_KEY, DEFAULT_BRANDING);
}

/**
 * Ana renkten DESIGN.md §2'deki brand tonlarını türetir. Varsayılan indigo ile denendi:
 * oranlar orijinal tonlara (#F0F1FF … #3D3FC2) çok yakın sonuç verir.
 */
export function brandShades(color: string): Record<string, string> {
  const mix = (pct: number, other: 'white' | 'black') => `color-mix(in oklab, ${color} ${pct}%, ${other})`;
  return {
    '50': mix(7, 'white'),
    '100': mix(14, 'white'),
    '200': mix(30, 'white'),
    '500': mix(88, 'white'),
    '600': color,
    '700': mix(80, 'black'),
  };
}

/** Beyaz metnin bu renk üzerindeki WCAG kontrast oranı (birincil düğmeler beyaz yazılı) */
export function contrastWithWhite(hex: string): number {
  const ch = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5);
  return 1.05 / (L + 0.05);
}

/** Markayı sayfaya uygular: CSS renk değişkenleri, sekme başlığı ve favicon. Uygulama kökünde bir kez kullanılır. */
export function BrandingEffects() {
  const b = useBranding();
  const fetched = useAuthConfig().data?.branding;

  useEffect(() => {
    if (fetched) writeLocal(CACHE_KEY, fetched);
  }, [fetched]);

  useEffect(() => {
    const root = document.documentElement.style;
    for (const [k, v] of Object.entries(b.color ? brandShades(b.color) : {})) root.setProperty(`--color-brand-${k}`, v);
    // Renk kaldırılınca index.css'teki varsayılanlara dön
    if (!b.color) for (const k of ['50', '100', '200', '500', '600', '700']) root.removeProperty(`--color-brand-${k}`);
  }, [b.color]);

  useEffect(() => {
    document.title = b.appName;
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (link) {
      link.href = b.logoUrl ?? '/logo.svg';
      link.type = b.logoUrl ? '' : 'image/svg+xml';
    }
  }, [b.appName, b.logoUrl]);

  return null;
}
