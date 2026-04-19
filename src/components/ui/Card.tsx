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
  md: 'p-4',
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
      className={`rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] shadow-sm ${PADDING[padding]} ${className}`.trim()}
    >
      {(title || action) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          {title ? (
            <h3 className="text-base font-semibold tracking-tight text-[var(--text-primary)]">
              {title}
            </h3>
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
