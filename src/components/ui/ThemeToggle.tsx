import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Cambiar a modo ${theme === 'dark' ? 'claro' : 'oscuro'}`}
      style={{
        borderRadius: 'var(--radius-full)',
        transitionDuration: 'var(--duration-normal)',
        transitionTimingFunction: 'var(--ease-out)',
      }}
      className="
        relative inline-flex min-h-11 select-none items-center gap-2 pl-3 pr-9
        touch-manipulation border border-[var(--border)] bg-[var(--bg-elevated)]
        text-xs font-medium text-[var(--text-secondary)]
        shadow-[var(--shadow-xs)] transition-[color,border-color,background-color,box-shadow,transform]
        hover:border-[var(--border-focus)] hover:text-[var(--text-primary)] hover:shadow-[var(--shadow-sm)]
        active:scale-[0.98]
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]
      "
    >
      {theme === 'dark' ? (
        <>
          <Sun size={16} className="shrink-0 text-[var(--accent-amber)]" strokeWidth={2} aria-hidden />
          <span>Modo claro</span>
        </>
      ) : (
        <>
          <Moon size={16} className="shrink-0 text-[var(--accent-blue)]" strokeWidth={2} aria-hidden />
          <span>Modo oscuro</span>
        </>
      )}
      <span
        className={`
        absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-[var(--radius-full)]
        transition-colors [transition-duration:var(--duration-normal)]
        ${theme === 'dark' ? 'bg-[var(--accent-blue)]' : 'bg-[var(--accent-amber)]'}
      `}
        aria-hidden
      />
    </button>
  );
}
