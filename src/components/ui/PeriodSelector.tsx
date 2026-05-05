import React from 'react';
import { formatMonthLongEs } from '../../utils/analytics';

export interface PeriodSelectorProps {
  value: string;
  onChange: (month: string) => void;
  availableMonths: string[];
  label?: string;
  /** Si es false, no se muestra la opción "Todos los períodos" (p. ej. reporte mensual). */
  includeAllOption?: boolean;
}

function optionLabel(ym: string): string {
  if (ym === 'all') return 'Todos los períodos';
  return formatMonthLongEs(ym);
}

export const PeriodSelector: React.FC<PeriodSelectorProps> = ({
  value,
  onChange,
  availableMonths,
  label = 'Período',
  includeAllOption = true,
}) => {
  const options: { value: string; label: string }[] = [
    ...(includeAllOption ? [{ value: 'all', label: 'Todos los períodos' }] : []),
    ...availableMonths.map((ym) => ({ value: ym, label: optionLabel(ym) })),
  ];

  const usePills = availableMonths.length <= 6;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</p>

      <div className="lg:hidden">
        <select
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-blue)] focus:ring-1 focus:ring-[var(--accent-blue)]"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="hidden lg:block">
        {usePills ? (
          <div className="flex flex-wrap gap-2">
            {options.map((o) => {
              const active = value === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => onChange(o.value)}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? 'border-[var(--accent-blue)] bg-[var(--accent-blue-muted)] text-[var(--accent-blue)]'
                      : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        ) : (
          <select
            className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-blue)] focus:ring-1 focus:ring-[var(--accent-blue)]"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label={label}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
