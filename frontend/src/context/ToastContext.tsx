import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ToastContext, type ToastState } from "./toast-context";

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const showToast = useCallback(
    (nextToast: { type: "success" | "error"; text: string }) => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }

      setToast({
        id: Date.now(),
        type: nextToast.type,
        text: nextToast.text,
      });

      timeoutRef.current = window.setTimeout(() => {
        setToast(null);
        timeoutRef.current = null;
      }, 3000);
    },
    [],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toast={toast} />
    </ToastContext.Provider>
  );
}

function ToastViewport({ toast }: { toast: ToastState | null }) {
  if (!toast) {
    return null;
  }

  const tone =
    toast.type === "success"
      ? "border-green-200 bg-green-50 text-green-800"
      : "border-red-200 bg-red-50 text-red-800";

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50">
      <div
        key={toast.id}
        className={`min-w-72 rounded-lg border px-4 py-3 text-sm shadow-lg ${tone}`}
      >
        {toast.text}
      </div>
    </div>
  );
}
