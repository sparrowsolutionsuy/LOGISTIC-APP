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
      style={{
        backgroundColor: `var(--status-${cfg.cssVars}-bg)`,
        color: `var(--status-${cfg.cssVars}-text)`,
        borderColor: `var(--status-${cfg.cssVars}-border)`,
      }}
      className={`
        inline-flex items-center gap-1.5 font-medium rounded-full border
        whitespace-nowrap
        ${size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-xs'}
      `}
    >
      <span
        style={{ backgroundColor: `var(--status-${cfg.cssVars}-text)` }}
        className="w-1.5 h-1.5 rounded-full flex-shrink-0 animate-pulse"
      />
      {cfg.label}
    </span>
  );
}
