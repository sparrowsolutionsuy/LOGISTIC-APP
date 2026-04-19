import React from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label: string;
  options: SelectOption[];
  error?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, error, id, className = '', ...rest }, ref) => {
    const selectId = id ?? rest.name ?? label.replace(/\s+/g, '-').toLowerCase();

    return (
      <div className="w-full">
        <label
          htmlFor={selectId}
          className="mb-1 block text-xs font-medium text-[var(--text-secondary)]"
        >
          {label}
        </label>
        <select
          ref={ref}
          id={selectId}
          className={`w-full rounded-lg border bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-blue)] focus:ring-1 focus:ring-[var(--accent-blue)] ${
            error ? 'border-[var(--accent-red)]' : 'border-[var(--border)]'
          } ${className}`.trim()}
          {...rest}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error ? <p className="mt-1 text-xs text-[var(--accent-red)]">{error}</p> : null}
      </div>
    );
  }
);

Select.displayName = 'Select';
