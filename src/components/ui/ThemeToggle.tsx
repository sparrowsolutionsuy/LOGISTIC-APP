import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Cambiar a modo ${theme === 'dark' ? 'claro' : 'oscuro'}`}
      className="
        relative inline-flex items-center gap-2 pr-8 pl-3 py-1.5 rounded-full
        border border-[var(--border)] bg-[var(--bg-elevated)]
        text-[var(--text-secondary)] hover:text-[var(--text-primary)]
        transition-all duration-200 text-xs font-medium
        hover:border-[var(--border-focus)] select-none
      "
    >
      {theme === 'dark' ? (
        <>
          <Sun size={14} className="text-amber-400 shrink-0" aria-hidden />
          <span>Modo claro</span>
        </>
      ) : (
        <>
          <Moon size={14} className="text-blue-400 shrink-0" aria-hidden />
          <span>Modo oscuro</span>
        </>
      )}
      <span
        className={`
        absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full
        transition-colors duration-200
        ${theme === 'dark' ? 'bg-blue-500' : 'bg-amber-400'}
      `}
        aria-hidden
      />
    </button>
  );
}
