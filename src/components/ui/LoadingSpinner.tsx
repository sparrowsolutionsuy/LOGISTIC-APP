import React from 'react';

export type LoadingSpinnerSize = 'sm' | 'md' | 'lg';

export interface LoadingSpinnerProps {
  size?: LoadingSpinnerSize;
  label?: string;
}

const SIZE_MAP: Record<LoadingSpinnerSize, string> = {
  sm: 'h-4 w-4 border-2',
  md: 'h-8 w-8 border-2',
  lg: 'h-12 w-12 border-[3px]',
};

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  label,
}) => {
  const spinner = (
    <div
      role="status"
      aria-label={label ?? 'Cargando'}
      className={`${SIZE_MAP[size]} animate-spin rounded-full border-[var(--border)] border-t-[var(--accent-blue)]`}
    />
  );

  if (!label) {
    return spinner;
  }

  return (
    <div className="inline-flex flex-col items-center gap-2">
      {spinner}
      <span className="text-xs text-[var(--text-muted)]">{label}</span>
    </div>
  );
};
