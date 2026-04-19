import React from 'react';
import { Button } from './Button';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastRecord {
  id: string;
  message: string;
  type: ToastType;
  /** Si es true, muestra botón explícito de cerrar (p. ej. errores). */
  closable?: boolean;
}

export interface ToastStackProps {
  toasts: ToastRecord[];
  onDismiss: (id: string) => void;
}

const TYPE_STYLES: Record<ToastType, string> = {
  success:
    'border-[color-mix(in_srgb,var(--accent-emerald)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent-emerald)_12%,var(--bg-surface))] text-[var(--text-primary)]',
  error:
    'border-[color-mix(in_srgb,var(--accent-red)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent-red)_12%,var(--bg-surface))] text-[var(--text-primary)]',
  info:
    'border-[color-mix(in_srgb,var(--accent-blue)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent-blue)_12%,var(--bg-surface))] text-[var(--text-primary)]',
  warning:
    'border-[color-mix(in_srgb,var(--accent-amber)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent-amber)_12%,var(--bg-surface))] text-[var(--text-primary)]',
};

export const ToastStack: React.FC<ToastStackProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[200] flex w-[min(92vw,360px)] flex-col gap-4"
      aria-live="polite"
      aria-relevant="additions text"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto rounded-lg border px-4 py-3 text-sm shadow-md backdrop-blur transition-colors duration-150 ${TYPE_STYLES[t.type]}`}
        >
          <div className="flex items-start justify-between gap-4">
            <p className="min-w-0 flex-1 leading-snug">{t.message}</p>
            {t.closable || t.type === 'error' ? (
              <Button
                variant="ghost"
                size="sm"
                className="!shrink-0 !px-2 !py-1 text-xs"
                onClick={() => onDismiss(t.id)}
                aria-label="Cerrar notificación"
              >
                Cerrar
              </Button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
};
