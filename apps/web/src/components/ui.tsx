import type { Platform, PostStatus, TargetStatus } from '@oneclick/shared';
import { Loader2, X } from 'lucide-react';
import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'secondary',
  size = 'md',
  loading,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-10 px-4 text-sm',
        variant === 'primary' && 'bg-ink text-white hover:bg-black',
        variant === 'secondary' && 'border border-line bg-white text-ink hover:bg-gray-50',
        variant === 'ghost' && 'text-muted hover:bg-gray-100 hover:text-ink',
        variant === 'danger' && 'border border-red-200 bg-white text-red-700 hover:bg-red-50',
        className,
      )}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-ink">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

const inputBase =
  'w-full rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-gray-400 focus:border-accent focus:outline-none';

export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(inputBase, 'h-10', p.className)} />;

export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...p} className={cx(inputBase, 'py-2.5 leading-relaxed', p.className)} />
);

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-xl border border-line bg-white', className)}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export const PLATFORM_COLOR: Record<Platform, string> = {
  INSTAGRAM: 'bg-instagram',
  TIKTOK: 'bg-tiktok',
  LINKEDIN: 'bg-linkedin',
  MOCK: 'bg-mock',
};

const PLATFORM_GLYPH: Record<Platform, string> = { INSTAGRAM: 'IG', TIKTOK: 'TT', LINKEDIN: 'in', MOCK: 'T' };

export function PlatformBadge({ platform, size = 16 }: { platform: Platform; size?: number }) {
  return (
    <span
      className={cx('inline-flex shrink-0 items-center justify-center rounded font-bold text-white', PLATFORM_COLOR[platform])}
      style={{ width: size, height: size, fontSize: size * 0.48 }}
      aria-hidden
    >
      {PLATFORM_GLYPH[platform]}
    </span>
  );
}

export function AccountAvatar({ name, url, platform, size = 36 }: { name: string; url: string | null; platform: Platform; size?: number }) {
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      {url ? (
        <img src={url} alt="" className="size-full rounded-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <span className="flex size-full items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-600">
          {name.slice(0, 2).toUpperCase()}
        </span>
      )}
      <span className="absolute -right-0.5 -bottom-0.5 rounded ring-2 ring-white">
        <PlatformBadge platform={platform} size={Math.round(size * 0.42)} />
      </span>
    </span>
  );
}

const POST_STATUS: Record<PostStatus, { label: string; cls: string }> = {
  DRAFT: { label: 'Taslak', cls: 'bg-gray-100 text-gray-700' },
  PENDING_APPROVAL: { label: 'Onay bekliyor', cls: 'bg-amber-50 text-amber-800' },
  SCHEDULED: { label: 'Planlandı', cls: 'bg-sky-50 text-sky-800' },
  PUBLISHING: { label: 'Yayınlanıyor', cls: 'bg-indigo-50 text-indigo-800' },
  PUBLISHED: { label: 'Yayınlandı', cls: 'bg-emerald-50 text-emerald-800' },
  PARTIALLY_FAILED: { label: 'Kısmen başarısız', cls: 'bg-orange-50 text-orange-800' },
  FAILED: { label: 'Başarısız', cls: 'bg-red-50 text-red-700' },
};

const TARGET_STATUS: Record<TargetStatus, { label: string; cls: string }> = {
  PENDING: { label: 'Bekliyor', cls: 'bg-gray-100 text-gray-700' },
  QUEUED: { label: 'Sırada', cls: 'bg-sky-50 text-sky-800' },
  PUBLISHING: { label: 'Yayınlanıyor', cls: 'bg-indigo-50 text-indigo-800' },
  PUBLISHED: { label: 'Yayınlandı', cls: 'bg-emerald-50 text-emerald-800' },
  FAILED: { label: 'Başarısız', cls: 'bg-red-50 text-red-700' },
};

export const postStatusLabel = (s: PostStatus) => POST_STATUS[s].label;

export function StatusPill({ status, kind = 'post' }: { status: PostStatus | TargetStatus; kind?: 'post' | 'target' }) {
  const s = kind === 'post' ? POST_STATUS[status as PostStatus] : TARGET_STATUS[status as TargetStatus];
  return <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', s.cls)}>{s.label}</span>;
}

export const STATUS_DOT: Record<PostStatus, string> = {
  DRAFT: 'bg-gray-400',
  PENDING_APPROVAL: 'bg-amber-500',
  SCHEDULED: 'bg-sky-500',
  PUBLISHING: 'bg-indigo-500',
  PUBLISHED: 'bg-emerald-500',
  PARTIALLY_FAILED: 'bg-orange-500',
  FAILED: 'bg-red-500',
};

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose(): void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 sm:p-10" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal
        aria-label={title}
        className={cx('w-full rounded-xl bg-white shadow-xl', wide ? 'max-w-3xl' : 'max-w-lg')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <button className="rounded p-1 text-muted hover:bg-gray-100" onClick={onClose} aria-label="Kapat">
            <X className="size-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-white px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-16 text-muted">
      <Loader2 className="size-5 animate-spin" />
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'error' | 'success' | 'warning'; children: ReactNode }) {
  return (
    <div
      className={cx(
        'rounded-lg border px-3.5 py-2.5 text-sm',
        tone === 'info' && 'border-sky-200 bg-sky-50 text-sky-900',
        tone === 'error' && 'border-red-200 bg-red-50 text-red-800',
        tone === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-900',
        tone === 'warning' && 'border-amber-200 bg-amber-50 text-amber-900',
      )}
    >
      {children}
    </div>
  );
}
