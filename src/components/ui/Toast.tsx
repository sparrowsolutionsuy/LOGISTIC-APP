import React from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastRecord {
  id: string;
  message: string;
  type: ToastType;
}

export interface ToastStackProps {
  toasts: ToastRecord[];
  onDismiss: (id: string) => void;
}

const TYPE_STYLES: Record<ToastType, string> = {
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100',
  error: 'border-red-500/30 bg-red-500/10 text-red-100',
  info: 'border-blue-500/30 bg-blue-500/10 text-blue-100',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-100',
};

export const ToastStack: React.FC<ToastStackProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[200] flex w-[min(92vw,360px)] flex-col gap-2"
      aria-live="polite"
      aria-relevant="additions text"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto rounded-lg border px-3 py-2 text-sm shadow-md backdrop-blur ${TYPE_STYLES[t.type]}`}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="leading-snug">{t.message}</p>
            <button
              type="button"
              className="shrink-0 text-xs text-white/70 hover:text-white"
              onClick={() => onDismiss(t.id)}
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
