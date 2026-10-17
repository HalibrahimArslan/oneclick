import { AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2, X, type LucideIcon } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ');

// --- Düğmeler (DESIGN.md §4.1) ---

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const BUTTON_VARIANT: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-subtle',
  ghost: 'text-muted hover:bg-subtle hover:text-ink',
  danger: 'border border-line-strong bg-surface text-failed-fg hover:border-failed-bg hover:bg-failed-bg',
};
const BUTTON_SIZE: Record<Size, string> = {
  sm: 'h-8 px-3 text-small',
  md: 'h-9 px-3.5 text-body',
  lg: 'h-11 px-4 text-body',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading,
  icon: Icon,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean; icon?: LucideIcon }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-control font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        BUTTON_VARIANT[variant],
        BUTTON_SIZE[size],
        className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : Icon && <Icon className="size-4" strokeWidth={1.75} />}
      {children}
    </button>
  );
}

export function IconButton({
  icon: Icon,
  label,
  size = 'md',
  active,
  primary,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string; size?: 'sm' | 'md'; active?: boolean; primary?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-control transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        primary ? 'bg-brand-600 text-white hover:bg-brand-700' : 'text-muted hover:bg-subtle hover:text-ink',
        size === 'sm' ? 'size-8' : 'size-9',
        active && 'bg-subtle text-ink',
        className,
      )}
    >
      <Icon className="size-4" strokeWidth={1.75} />
    </button>
  );
}

// --- Form öğeleri (DESIGN.md §4.2) ---

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <label className="block" htmlFor={htmlFor}>
      <span className="mb-1.5 block text-small font-medium text-ink">{label}</span>
      {children}
      {error ? (
        <span className="mt-1.5 block text-caption text-failed-fg">{error}</span>
      ) : (
        hint && <span className="mt-1.5 block text-caption text-muted">{hint}</span>
      )}
    </label>
  );
}

const control =
  'rounded-control border border-line-strong bg-surface px-3 text-body text-ink transition-[border-color,box-shadow] placeholder:text-faint focus:border-brand-500 focus:ring-3 focus:ring-brand-100 focus:outline-none disabled:bg-subtle disabled:text-muted';

export const Input = ({ inputSize = 'md', ...p }: InputHTMLAttributes<HTMLInputElement> & { inputSize?: 'md' | 'lg' }) => (
  <input {...p} className={cx(control, 'w-full', inputSize === 'lg' ? 'h-11' : 'h-9', p.className)} />
);

export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...p} className={cx(control, 'w-full py-2.5 leading-relaxed', p.className)} />
);

export const Select = ({ fit, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { fit?: boolean }) => (
  <select {...p} className={cx(control, fit ? 'w-auto' : 'w-full', 'h-9 pr-8', p.className)} />
);

export function Checkbox({
  checked,
  indeterminate,
  onChange,
  disabled,
  label,
  className,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange(v: boolean): void;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate);
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      onClick={(e) => e.stopPropagation()}
      className={cx('size-4 shrink-0 cursor-pointer rounded accent-brand-600 disabled:cursor-not-allowed', className)}
    />
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange(v: boolean): void; label: ReactNode; disabled?: boolean }) {
  return (
    <label className={cx('inline-flex cursor-pointer items-center gap-2.5 text-small text-ink', disabled && 'cursor-not-allowed opacity-50')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative h-4.5 w-8 shrink-0 rounded-full transition-colors', checked ? 'bg-brand-600' : 'bg-line-strong')}
      >
        <span
          className={cx(
            'absolute top-0.5 left-0.5 size-3.5 rounded-full bg-surface shadow-thumb transition-transform',
            checked && 'translate-x-3.5',
          )}
        />
      </button>
      {label}
    </label>
  );
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  size = 'md',
}: {
  value: T;
  onChange(v: T): void;
  options: { value: T; label: ReactNode; icon?: LucideIcon }[];
  label: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-control bg-subtle p-0.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx(
              'inline-flex items-center gap-1.5 rounded-[6px] px-3 font-medium transition-colors',
              size === 'sm' ? 'h-7 text-caption' : 'h-8 text-small',
              on ? 'bg-surface text-ink shadow-thumb' : 'text-muted hover:text-ink',
            )}
          >
            {o.icon && <o.icon className="size-3.5" strokeWidth={1.75} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
}: {
  value: T;
  onChange(v: T): void;
  tabs: { value: T; label: string; count?: number }[];
}) {
  // Alt çizgi kabın içinde gölgeyle çizilir; sekmenin 2 px çizgisi onun üstüne biner.
  // Negatif margin kullanılmaz, yoksa yatay kaydırılan kap dikeyde de taşar ve kaydırma çubuğu çıkar.
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [value]);
  return (
    <div
      ref={list}
      role="tablist"
      className="flex gap-5 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--color-line)] scrollbar-none max-sm:gap-4 max-sm:mask-r-from-85% [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((t) => {
        const on = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.value)}
            className={cx(
              'flex shrink-0 items-center gap-2 border-b-2 pb-2.5 text-small font-medium whitespace-nowrap transition-colors last:mr-6',
              on ? 'border-brand-600 text-ink' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={cx('rounded-full px-1.5 text-micro tabular-nums', on ? 'bg-brand-50 text-brand-700' : 'bg-subtle text-muted')}>
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// --- Yüzeyler (DESIGN.md §4.3) ---

export function Card({ children, className, title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={cx('rounded-card border border-line bg-surface', className)}>
      {title && (
        <header className="flex h-12 items-center justify-between gap-3 border-b border-line px-4">
          <h2 className="text-heading font-semibold">{title}</h2>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-title font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-small text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const MODAL_W = { sm: 'max-w-[420px]', md: 'max-w-[560px]', lg: 'max-w-[880px]' };

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose(): void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof MODAL_W;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => {
      window.removeEventListener('keydown', h);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-start justify-center overflow-y-auto bg-ink/40 p-4 sm:py-12"
      onMouseDown={onClose}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal
        aria-labelledby={titleId}
        className={cx('w-full animate-modal-in rounded-pop bg-surface shadow-modal outline-none', MODAL_W[size])}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex h-14 items-center justify-between gap-3 border-b border-line pr-3 pl-5">
          <h2 id={titleId} className="min-w-0 truncate text-heading font-semibold">
            {title}
          </h2>
          <IconButton icon={X} label="Kapat" size="sm" onClick={onClose} />
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Dışarı tıklama ve Esc ile kapanan basit açılır katman. */
export function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return { open, setOpen, ref, toggle: useCallback(() => setOpen((o) => !o), []) };
}

export function Popover({
  trigger,
  children,
  align = 'start',
  side = 'bottom',
  className,
  wrapperClassName = 'inline-flex',
}: {
  trigger: (p: { open: boolean; toggle(): void }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: 'start' | 'end';
  side?: 'bottom' | 'top';
  className?: string;
  wrapperClassName?: string;
}) {
  const p = usePopover();
  return (
    <div ref={p.ref} className={cx('relative', wrapperClassName)}>
      {trigger({ open: p.open, toggle: p.toggle })}
      {p.open && (
        <div
          className={cx(
            'absolute z-40 animate-pop-in rounded-pop border border-line bg-surface p-1.5 shadow-pop',
            align === 'end' ? 'right-0' : 'left-0',
            side === 'top' ? 'bottom-full mb-2' : 'top-full mt-1.5',
            className,
          )}
        >
          {typeof children === 'function' ? children(() => p.setOpen(false)) : children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  icon: Icon,
  children,
  onClick,
  danger,
  disabled,
}: {
  icon?: LucideIcon;
  children: ReactNode;
  onClick(): void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'flex h-8 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-left text-small whitespace-nowrap transition-colors disabled:opacity-40',
        danger ? 'text-failed-fg hover:bg-failed-bg' : 'text-ink hover:bg-subtle',
      )}
    >
      {Icon && <Icon className={cx('size-4', danger ? 'text-failed-fg' : 'text-muted')} strokeWidth={1.75} />}
      {children}
    </button>
  );
}

// --- Durum ekranları (DESIGN.md §4.5) ---

export function EmptyState({ icon: Icon, title, body, action, className }: { icon?: LucideIcon; title: string; body?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-col items-center px-6 py-14 text-center', className)}>
      {Icon && (
        <span className="mb-4 flex size-10 items-center justify-center rounded-full bg-subtle text-muted">
          <Icon className="size-5" strokeWidth={1.75} />
        </span>
      )}
      <p className="text-heading font-semibold">{title}</p>
      {body && <p className="mt-1 max-w-sm text-small text-muted">{body}</p>}
      {action && <div className="mt-5 flex justify-center gap-2">{action}</div>}
    </div>
  );
}

export const Skeleton = ({ className }: { className?: string }) => <div className={cx('animate-pulse rounded-control bg-subtle', className)} />;

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cx('flex justify-center py-16 text-faint', className)}>
      <Loader2 className="size-5 animate-spin" />
    </div>
  );
}

const NOTICE = {
  info: { cls: 'bg-scheduled-bg text-scheduled-fg', icon: Info },
  success: { cls: 'bg-published-bg text-published-fg', icon: CheckCircle2 },
  warning: { cls: 'bg-pending-bg text-pending-fg', icon: AlertTriangle },
  error: { cls: 'bg-failed-bg text-failed-fg', icon: AlertCircle },
};

export function Notice({ tone = 'info', children, action }: { tone?: keyof typeof NOTICE; children: ReactNode; action?: ReactNode }) {
  const n = NOTICE[tone];
  return (
    <div className={cx('flex items-start gap-2.5 rounded-control px-3.5 py-2.5 text-small', n.cls)}>
      <n.icon className="mt-px size-4 shrink-0" strokeWidth={1.75} />
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

export const NOTICE_TONES = NOTICE;
