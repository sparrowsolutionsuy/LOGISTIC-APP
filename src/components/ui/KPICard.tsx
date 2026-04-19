import React from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

export type KpiTrend = 'up' | 'down' | 'neutral';

export interface KPICardProps {
  label: string;
  value: string;
  sub?: string;
  trend?: KpiTrend;
  icon: React.ReactNode;
  accentColor?: string;
}

const TrendIcon: React.FC<{ trend: KpiTrend }> = ({ trend }) => {
  if (trend === 'up') {
    return <ArrowUpRight className="h-4 w-4 text-emerald-300" aria-hidden />;
  }
  if (trend === 'down') {
    return <ArrowDownRight className="h-4 w-4 text-red-300" aria-hidden />;
  }
  return <Minus className="h-4 w-4 text-[var(--text-muted)]" aria-hidden />;
};

export const KPICard: React.FC<KPICardProps> = ({
  label,
  value,
  sub,
  trend,
  icon,
  accentColor = 'var(--accent-blue)',
}) => {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
            {label}
          </p>
          <p className="mt-1 truncate text-2xl font-semibold text-[var(--text-primary)]">{value}</p>
          {sub ? <p className="mt-1 text-xs text-[var(--text-secondary)]">{sub}</p> : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div
            className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-[var(--text-primary)]"
            style={{ color: accentColor }}
          >
            {icon}
          </div>
          {trend ? <TrendIcon trend={trend} /> : null}
        </div>
      </div>
    </div>
  );
};
