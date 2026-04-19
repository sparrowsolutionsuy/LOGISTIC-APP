import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, id, className = '', ...rest }, ref) => {
    const inputId = id ?? rest.name ?? label.replace(/\s+/g, '-').toLowerCase();

    return (
      <div className="w-full">
        <label
          htmlFor={inputId}
          className="mb-1 block text-xs font-medium text-[var(--text-secondary)]"
        >
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          className={`w-full rounded-lg border bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent-blue)] focus:ring-1 focus:ring-[var(--accent-blue)] ${
            error ? 'border-[var(--accent-red)]' : 'border-[var(--border)]'
          } ${className}`.trim()}
          {...rest}
        />
        {error ? <p className="mt-1 text-xs text-[var(--accent-red)]">{error}</p> : null}
      </div>
    );
  }
);

Input.displayName = 'Input';
