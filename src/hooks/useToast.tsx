import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { ToastStack, type ToastRecord, type ToastType } from '../components/ui/Toast';

interface ToastContextValue {
  showToast: (message: string, type: ToastType) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showInfo: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export interface ToastProviderProps {
  children: React.ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timers = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t !== undefined) {
      window.clearTimeout(t);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const scheduleDismiss = useCallback(
    (id: string, ms: number) => {
      const existing = timers.current.get(id);
      if (existing !== undefined) {
        window.clearTimeout(existing);
      }
      const handle = window.setTimeout(() => dismiss(id), ms);
      timers.current.set(id, handle);
    },
    [dismiss]
  );

  const push = useCallback(
    (message: string, type: ToastType, options: { dismissMs: number; closable: boolean }) => {
      const id = createId();
      const record: ToastRecord = { id, message, type, closable: options.closable };
      setToasts((prev) => [...prev, record]);
      scheduleDismiss(id, options.dismissMs);
    },
    [scheduleDismiss]
  );

  const showToast = useCallback(
    (message: string, type: ToastType) => {
      const dismissMs = type === 'error' ? 5000 : 3000;
      const closable = type === 'error';
      push(message, type, { dismissMs, closable });
    },
    [push]
  );

  const showSuccess = useCallback((message: string) => push(message, 'success', { dismissMs: 3000, closable: false }), [push]);
  const showError = useCallback((message: string) => push(message, 'error', { dismissMs: 5000, closable: true }), [push]);
  const showInfo = useCallback((message: string) => push(message, 'info', { dismissMs: 3000, closable: false }), [push]);

  const value = useMemo(
    () => ({ showToast, showSuccess, showError, showInfo }),
    [showToast, showSuccess, showError, showInfo]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast debe usarse dentro de ToastProvider');
  }
  return ctx;
}
