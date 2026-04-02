import { createContext } from "react";

type ToastType = "success" | "error";

export interface ToastState {
  id: number;
  type: ToastType;
  text: string;
}

export interface ToastContextValue {
  showToast: (toast: { type: ToastType; text: string }) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);
