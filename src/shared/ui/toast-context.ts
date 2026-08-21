import { createContext, useContext } from 'react';

export type ToastTone = 'info' | 'success' | 'danger';

export interface ToastMessage {
  title: string;
  message?: string;
  tone: ToastTone;
}

export interface ToastContextValue {
  notify: (toast: ToastMessage) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast ToastProvider ichida ishlatilishi kerak.');
  return context;
}
