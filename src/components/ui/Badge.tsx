import type { TripStatus } from '../../types';

interface BadgeProps {
  status: TripStatus;
  size?: 'sm' | 'md';
}

const CONFIG: Record<TripStatus, { label: string; cssVars: string }> = {
  Pendiente: { label: 'Pendiente', cssVars: 'pendiente' },
  'En Tránsito': { label: 'En Tránsito', cssVars: 'transito' },
  Completado: { label: 'Completado', cssVars: 'completado' },
  Cerrado: { label: 'Cerrado', cssVars: 'cerrado' },
};

export default function Badge({ status, size = 'md' }: BadgeProps) {
  const cfg = CONFIG[status];

  return (
    <span
      role="status"
      aria-label={`Estado del viaje: ${cfg.label}`}
      style={{
        backgroundColor: `var(--status-${cfg.cssVars}-bg)`,
        color: `var(--status-${cfg.cssVars}-text)`,
        borderColor: `var(--status-${cfg.cssVars}-border)`,
        borderRadius: 'var(--radius-full)',
        boxShadow: 'var(--shadow-inset)',
      }}
      className={`
        inline-flex items-center gap-1.5 border font-medium
        whitespace-nowrap transition-colors
        [transition-duration:var(--duration-fast)] [transition-timing-function:var(--ease-out)]
        ${size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-xs'}
      `}
    >
      <span
        style={{ backgroundColor: `var(--status-${cfg.cssVars}-text)` }}
        className="motion-safe:animate-pulse h-1.5 w-1.5 shrink-0 rounded-full"
        aria-hidden
      />
      {cfg.label}
    </span>
  );
}
