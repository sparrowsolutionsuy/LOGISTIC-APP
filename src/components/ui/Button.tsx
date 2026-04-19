import React from 'react';
import { LoadingSpinner } from './LoadingSpinner';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'size'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--accent-blue)] text-[var(--text-on-accent)] border border-transparent shadow-sm hover:brightness-110 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-[0.45] disabled:hover:brightness-100',
  secondary:
    'bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border)] shadow-[var(--shadow-xs)] hover:bg-[var(--bg-muted)] hover:border-[var(--border-strong)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-[0.45]',
  danger:
    'bg-[var(--accent-red)] text-[var(--text-on-accent)] border border-transparent shadow-sm hover:brightness-110 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-[0.45]',
  ghost:
    'bg-transparent text-[var(--text-secondary)] border border-transparent hover:bg-[var(--accent-blue-muted)] hover:text-[var(--text-primary)] active:bg-[var(--accent-blue-muted)] disabled:cursor-not-allowed disabled:opacity-[0.45]',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'min-h-10 text-xs px-3 py-2 gap-1.5 rounded-[var(--radius-sm)]',
  md: 'min-h-11 text-sm px-4 py-2.5 gap-2 rounded-[var(--radius-md)]',
  lg: 'min-h-12 text-base px-5 py-3 gap-2 rounded-[var(--radius-md)]',
};

const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]';

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      icon,
      className = '',
      disabled,
      children,
      type = 'button',
      ...rest
    },
    ref
  ) => {
    const isDisabled = Boolean(disabled || loading);
    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        style={{
          transitionDuration: 'var(--duration-normal)',
          transitionTimingFunction: 'var(--ease-out)',
        }}
        className={`touch-manipulation inline-flex select-none items-center justify-center font-medium transition-[transform,opacity,background-color,border-color,color,box-shadow] active:transition-none ${FOCUS_RING} ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`.trim()}
        {...rest}
      >
        {loading ? (
          <>
            <LoadingSpinner size="sm" />
            {children}
          </>
        ) : (
          <>
            {icon}
            {children}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
