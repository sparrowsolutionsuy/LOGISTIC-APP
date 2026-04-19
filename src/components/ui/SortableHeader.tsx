import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import type { SortDirection } from '../../hooks/useSortableTable';

interface Props {
  label: string;
  column: string;
  currentColumn: string | null;
  direction: SortDirection;
  onClick: (col: string) => void;
  align?: 'left' | 'right' | 'center';
}

export default function SortableHeader({
  label,
  column,
  currentColumn,
  direction,
  onClick,
  align = 'left',
}: Props) {
  const isActive = currentColumn === column;

  return (
    <th
      scope="col"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(column);
        }
      }}
      onClick={() => onClick(column)}
      className={`
        px-4 py-3 text-xs font-semibold uppercase tracking-wider
        cursor-pointer select-none
        text-[var(--text-secondary)] hover:text-[var(--text-primary)]
        transition-colors duration-150 group
        ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'}
      `}
    >
      <span className="inline-flex items-center gap-1.5">
        {label}
        <span
          className={`transition-opacity ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`}
        >
          {isActive && direction === 'asc' && (
            <ArrowUp size={12} className="text-[var(--accent-blue)]" aria-hidden />
          )}
          {isActive && direction === 'desc' && (
            <ArrowDown size={12} className="text-[var(--accent-blue)]" aria-hidden />
          )}
          {(!isActive || !direction) && <ArrowUpDown size={12} aria-hidden />}
        </span>
      </span>
    </th>
  );
}
