import React from 'react';

export interface SkeletonProps {
  className?: string;
  'aria-label'?: string;
}

/** Bloque animado para estados de carga (sin spinner). */
export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  'aria-label': ariaLabel = 'Cargando…',
}) => (
  <div
    className={`animate-pulse rounded-lg bg-[color-mix(in_srgb,var(--bg-elevated)_65%,transparent)] ${className}`.trim()}
    role="status"
    aria-label={ariaLabel}
  />
);

export const AppDataSkeleton: React.FC = () => (
  <div className="flex min-h-[50vh] flex-col gap-6 p-6" aria-busy="true" aria-live="polite">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-10 w-32" />
    </div>
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-24" />
      ))}
    </div>
    <Skeleton className="h-64 w-full" />
    <Skeleton className="h-48 w-full" />
  </div>
);
