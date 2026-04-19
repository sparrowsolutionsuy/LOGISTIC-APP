import React from 'react';
import type { TripStatus } from '../../types';

export interface BadgeProps {
  status: TripStatus;
  className?: string;
}

const STATUS_STYLES: Record<
  TripStatus,
  { bg: string; text: string; border: string }
> = {
  Pendiente: {
    bg: 'bg-[color-mix(in_srgb,var(--accent-amber)_18%,transparent)]',
    text: 'text-amber-200',
    border: 'border-[color-mix(in_srgb,var(--accent-amber)_35%,transparent)]',
  },
  'En Tránsito': {
    bg: 'bg-[color-mix(in_srgb,var(--accent-blue)_18%,transparent)]',
    text: 'text-blue-200',
    border: 'border-[color-mix(in_srgb,var(--accent-blue)_35%,transparent)]',
  },
  Completado: {
    bg: 'bg-[color-mix(in_srgb,var(--accent-emerald)_18%,transparent)]',
    text: 'text-emerald-200',
    border: 'border-[color-mix(in_srgb,var(--accent-emerald)_35%,transparent)]',
  },
  Cerrado: {
    bg: 'bg-white/5',
    text: 'text-[var(--text-secondary)]',
    border: 'border-[var(--border)]',
  },
};

export const Badge: React.FC<BadgeProps> = ({ status, className = '' }) => {
  const s = STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${s.bg} ${s.text} ${s.border} ${className}`.trim()}
    >
      {status}
    </span>
  );
};
