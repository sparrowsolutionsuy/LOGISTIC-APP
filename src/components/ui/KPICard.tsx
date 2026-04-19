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
    return <ArrowUpRight className="h-4 w-4 text-[var(--accent-emerald)]" aria-hidden strokeWidth={2} />;
  }
  if (trend === 'down') {
    return <ArrowDownRight className="h-4 w-4 text-[var(--accent-red)]" aria-hidden strokeWidth={2} />;
  }
  return <Minus className="h-4 w-4 text-[var(--text-muted)]" aria-hidden strokeWidth={2} />;
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
    <div
      style={{
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm), var(--shadow-inset)',
      }}
      className="min-h-[5.5rem] border border-[var(--border)] bg-[var(--bg-surface)] p-5 transition-[border-color,box-shadow,transform] [transition-duration:var(--duration-normal)] [transition-timing-function:var(--ease-out)] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
          <p className="mt-1.5 truncate text-2xl font-semibold tabular-nums tracking-tight text-[var(--text-primary)]">
            {value}
          </p>
          {sub ? <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">{sub}</p> : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div
            style={{
              borderRadius: 'var(--radius-md)',
              color: accentColor,
              boxShadow: 'var(--shadow-inset)',
            }}
            className="border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-[var(--text-primary)]"
            aria-hidden
          >
            {icon}
          </div>
          {trend ? <TrendIcon trend={trend} /> : null}
        </div>
      </div>
    </div>
  );
};
