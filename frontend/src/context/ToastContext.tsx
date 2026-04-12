import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ToastContext, type ToastState } from "./toast-context";

const TOAST_DURATION_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const clearDismissTimer = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const dismissToast = useCallback(() => {
    clearDismissTimer();
    setToast(null);
  }, [clearDismissTimer]);

  const showToast = useCallback(
    (nextToast: { type: "success" | "error"; text: string }) => {
      clearDismissTimer();

      setToast({
        id: Date.now(),
        type: nextToast.type,
        text: nextToast.text,
      });

      timeoutRef.current = window.setTimeout(() => {
        setToast(null);
        timeoutRef.current = null;
      }, TOAST_DURATION_MS);
    },
    [clearDismissTimer],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toast={toast} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  toast,
  onDismiss,
}: {
  toast: ToastState | null;
  onDismiss: () => void;
}) {
  if (!toast) {
    return null;
  }

  const tone =
    toast.type === "success"
      ? "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/40 text-green-800 dark:text-green-200"
      : "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200";

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 max-w-[min(24rem,calc(100vw-2rem))]">
      <div
        key={toast.id}
        role={toast.type === "error" ? "alert" : "status"}
        aria-live={toast.type === "error" ? "assertive" : "polite"}
        className={`pointer-events-auto flex animate-fade-in-up items-start gap-2 rounded-lg border px-3 py-2.5 text-sm shadow-lg ${tone}`}
      >
        <p className="min-w-0 flex-1 leading-snug">{toast.text}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="-m-1 shrink-0 rounded-md p-1 text-current opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-current/40"
          aria-label="Dismiss"
        >
          <span aria-hidden className="block text-lg leading-none">
            &times;
          </span>
        </button>
      </div>
    </div>
  );
}
