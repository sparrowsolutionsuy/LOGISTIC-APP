import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from './Button';

export type ModalSize = 'sm' | 'md' | 'lg';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  size?: ModalSize;
  children: React.ReactNode;
}

const SIZE_WIDTH: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-3xl',
};

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  size = 'md',
  children,
}) => {
  useEffect(() => {
    if (!open) {
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Cerrar modal"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`relative z-[101] w-full ${SIZE_WIDTH[size]} rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-lg`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <h2 id="modal-title" className="text-sm font-semibold text-[var(--text-primary)]">
            {title}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Cerrar" className="!p-1">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="max-h-[min(70vh,720px)] overflow-y-auto p-4">{children}</div>
      </div>
    </div>,
    document.body
  );
};
