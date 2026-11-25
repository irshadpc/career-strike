import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

type ToastVariant = 'default' | 'success' | 'destructive';
interface ToastAction {
  label: string;
  onClick: () => void;
}
interface ToastItem {
  id: number;
  title?: string;
  description?: string;
  variant?: ToastVariant;
  action?: ToastAction;
  duration?: number;
}
interface ToastContextValue {
  toast: (t: Omit<ToastItem, 'id'>) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (t: Omit<ToastItem, 'id'>) => {
      const id = ++counter.current;
      const item: ToastItem = { ...t, id, duration: t.duration ?? (t.variant === 'destructive' ? 8000 : 4000) };
      setItems((prev) => [...prev, item]);
      const timer = setTimeout(() => dismiss(id), item.duration);
      timers.current.set(id, timer);
      return id;
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  useEffect(
    () => () => {
      timers.current.forEach((t) => clearTimeout(t));
    },
    [],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[min(360px,calc(100vw-2rem))]">
        {items.map((t) => {
          const isError = t.variant === 'destructive';
          return (
            <div
              key={t.id}
              role={isError ? 'alert' : 'status'}
              aria-live={isError ? 'assertive' : 'polite'}
              className={`rounded-xl border shadow-lg p-4 bg-card text-foreground flex gap-3 items-start ${
                isError ? 'border-destructive/40' : t.variant === 'success' ? 'border-teal-500/40' : 'border-border'
              }`}
            >
              <div className="shrink-0 mt-0.5">
                {isError ? (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                ) : t.variant === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 text-teal-600" />
                ) : null}
              </div>
              <div className="flex-1 min-w-0">
                {t.title && <p className="text-sm font-semibold">{t.title}</p>}
                {t.description && <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>}
                {t.action && (
                  <button
                    type="button"
                    onClick={t.action.onClick}
                    className="mt-2 text-xs font-medium text-primary hover:underline"
                  >
                    {t.action.label}
                  </button>
                )}
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => dismiss(t.id)}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
