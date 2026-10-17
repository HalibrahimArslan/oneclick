import { X } from 'lucide-react';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button, cx, Modal, NOTICE_TONES } from './ui';

type Tone = keyof typeof NOTICE_TONES;
interface ToastItem {
  id: number;
  message: ReactNode;
  tone: Tone;
}
interface ConfirmOpts {
  title: string;
  body?: ReactNode;
  action: string;
  danger?: boolean;
}

const Ctx = createContext<{ toast(message: ReactNode, tone?: Tone): void; confirm(o: ConfirmOpts): Promise<boolean> } | null>(null);

/** Tarayıcının alert/confirm pencereleri yerine toast ve onay penceresi (DESIGN.md §4.3). */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dialog, setDialog] = useState<ConfirmOpts | null>(null);
  const resolver = useRef<(v: boolean) => void>(undefined);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (message: ReactNode, tone: Tone = 'info') => {
      const id = ++seq.current;
      setToasts((t) => [...t.slice(-3), { id, message, tone }]);
      setTimeout(() => dismiss(id), 4000);
    },
    [dismiss],
  );
  const confirm = useCallback(
    (o: ConfirmOpts) =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setDialog(o);
      }),
    [],
  );
  const close = (v: boolean) => {
    resolver.current?.(v);
    setDialog(null);
  };

  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}
      <Modal
        open={Boolean(dialog)}
        onClose={() => close(false)}
        title={dialog?.title}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => close(false)}>
              Vazgeç
            </Button>
            <Button variant={dialog?.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
              {dialog?.action}
            </Button>
          </>
        }
      >
        <div className="text-body text-ink-2">{dialog?.body}</div>
      </Modal>
      {createPortal(
        <div className="pointer-events-none fixed right-4 bottom-4 z-60 flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
          {toasts.map((t) => {
            const n = NOTICE_TONES[t.tone];
            return (
              <div
                key={t.id}
                className="pointer-events-auto flex animate-pop-in items-start gap-2.5 rounded-card border border-line bg-surface px-3.5 py-3 text-small shadow-pop"
              >
                <span className={cx('flex size-5 shrink-0 items-center justify-center rounded-full', n.cls)}>
                  <n.icon className="size-3.5" strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1 pt-px text-ink">{t.message}</div>
                <button onClick={() => dismiss(t.id)} className="text-faint hover:text-ink" aria-label="Kapat">
                  <X className="size-4" />
                </button>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </Ctx.Provider>
  );
}

export function useFeedback() {
  const c = useContext(Ctx);
  if (!c) throw new Error('FeedbackProvider eksik');
  return c;
}
