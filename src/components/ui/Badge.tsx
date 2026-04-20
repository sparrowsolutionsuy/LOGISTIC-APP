import type { BillingStatus, TripStatus } from '../../types';
import { getBillingStatusLabel } from '../../utils/billing';

interface BadgeProps {
  status?: TripStatus;
  billingStatus?: BillingStatus;
  size?: 'sm' | 'md';
}

const CONFIG: Record<TripStatus, { label: string; cssVars: string }> = {
  Pendiente: { label: 'Pendiente', cssVars: 'pendiente' },
  'En Tránsito': { label: 'En Tránsito', cssVars: 'transito' },
  Completado: { label: 'Completado', cssVars: 'completado' },
  Cerrado: { label: 'Cerrado', cssVars: 'cerrado' },
};

/** Tokens de badge de viaje reutilizados para pipeline de facturación. */
const BILLING_BADGE_MAP: Record<BillingStatus, string> = {
  pendiente: 'pendiente',
  generada: 'cerrado',
  solicitada: 'transito',
  cobrada: 'completado',
};

export default function Badge({ status, billingStatus, size = 'md' }: BadgeProps) {
  if (billingStatus != null) {
    const cssVars = BILLING_BADGE_MAP[billingStatus];
    const label = getBillingStatusLabel(billingStatus);
    return (
      <span
        role="status"
        aria-label={`Estado de facturación: ${label}`}
        style={{
          backgroundColor: `var(--status-${cssVars}-bg)`,
          color: `var(--status-${cssVars}-text)`,
          borderColor: `var(--status-${cssVars}-border)`,
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
          style={{ backgroundColor: `var(--status-${cssVars}-text)` }}
          className="motion-safe:animate-pulse h-1.5 w-1.5 shrink-0 rounded-full"
          aria-hidden
        />
        {label}
      </span>
    );
  }

  if (!status) {
    return null;
  }

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
