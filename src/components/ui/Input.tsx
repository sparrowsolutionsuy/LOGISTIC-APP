import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  startAdornment?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, id, className = '', startAdornment, ...rest }, ref) => {
    const inputId = id ?? rest.name ?? label.replace(/\s+/g, '-').toLowerCase();
    const padded = Boolean(startAdornment);

    return (
      <div className="w-full">
        <label
          htmlFor={inputId}
          className="mb-1 block text-xs font-medium text-[var(--text-secondary)]"
        >
          {label}
        </label>
        <div className="relative">
          {startAdornment ? (
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[var(--text-muted)]">
              {startAdornment}
            </div>
          ) : null}
          <input
            ref={ref}
            id={inputId}
            className={`w-full rounded-lg border bg-[var(--bg-base)] py-2.5 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent-blue)] focus:ring-1 focus:ring-[var(--accent-blue)] ${
              padded ? 'pl-10 pr-3' : 'px-3'
            } ${error ? 'border-[var(--accent-red)]' : 'border-[var(--border)]'} ${className}`.trim()}
            {...rest}
          />
        </div>
        {error ? <p className="mt-1 text-xs text-[var(--accent-red)]">{error}</p> : null}
      </div>
    );
  }
);

Input.displayName = 'Input';
