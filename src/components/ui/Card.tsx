import React from 'react';

export type CardPadding = 'sm' | 'md' | 'lg';

export interface CardProps {
  title?: string;
  action?: React.ReactNode;
  padding?: CardPadding;
  className?: string;
  children: React.ReactNode;
}

const PADDING: Record<CardPadding, string> = {
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
};

export const Card: React.FC<CardProps> = ({
  title,
  action,
  padding = 'md',
  className = '',
  children,
}) => {
  return (
    <section
      style={{
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm), var(--shadow-inset)',
      }}
      className={`border border-[var(--border)] bg-[var(--bg-surface)] transition-[box-shadow,border-color] [transition-duration:var(--duration-normal)] [transition-timing-function:var(--ease-out)] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)] ${PADDING[padding]} ${className}`.trim()}
    >
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
          {title ? (
            <h3 className="text-sm font-semibold tracking-tight text-[var(--text-primary)]">{title}</h3>
          ) : (
            <span />
          )}
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
};
