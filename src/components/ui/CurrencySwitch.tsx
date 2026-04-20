import React, { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import type { DisplayCurrency } from '../../types';

export interface CurrencySwitchProps {
  displayCurrency: DisplayCurrency;
  currentRate: number;
  lastUpdated: string | null;
  onToggle: () => void;
  onRateChange: (rate: number) => void;
}

export const CurrencySwitch: React.FC<CurrencySwitchProps> = ({
  displayCurrency,
  currentRate,
  lastUpdated,
  onToggle,
  onRateChange,
}) => {
  const [editing, setEditing] = useState(false);
  const [rateInput, setRateInput] = useState(String(currentRate));

  useEffect(() => {
    if (!editing) {
      setRateInput(String(currentRate));
    }
  }, [currentRate, editing]);

  const handleRateSubmit = () => {
    const parsed = parseFloat(rateInput);
    if (Number.isFinite(parsed) && parsed > 0) {
      onRateChange(parsed);
    } else {
      setRateInput(String(currentRate));
    }
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onToggle}
        aria-label={`Cambiar a ${displayCurrency === 'USD' ? 'pesos uruguayos' : 'dólares'}`}
        style={{ borderRadius: 'var(--radius-full)' }}
        className="relative inline-flex min-h-9 select-none items-center gap-2 border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-xs font-semibold text-[var(--text-secondary)] shadow-[var(--shadow-xs)] transition-all hover:border-[var(--border-focus)] hover:text-[var(--text-primary)] active:scale-[0.98]"
      >
        <span
          className={
            displayCurrency === 'USD' ? 'text-[var(--accent-blue)]' : 'text-[var(--text-muted)]'
          }
        >
          USD
        </span>
        <span className="relative inline-flex h-4 w-7 rounded-full bg-[var(--border-strong)] transition-colors">
          <span
            className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${
              displayCurrency === 'UYU' ? 'translate-x-3.5' : 'translate-x-0.5'
            }`}
          />
        </span>
        <span
          className={
            displayCurrency === 'UYU' ? 'text-[var(--accent-amber)]' : 'text-[var(--text-muted)]'
          }
        >
          $UY
        </span>
      </button>

      <div className="flex items-center gap-1">
        <span className="hidden text-[10px] text-[var(--text-muted)] sm:inline">TC:</span>
        {editing ? (
          <input
            type="number"
            step="0.01"
            min="1"
            value={rateInput}
            autoFocus
            onChange={(e) => setRateInput(e.target.value)}
            onBlur={handleRateSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleRateSubmit();
              }
              if (e.key === 'Escape') {
                setRateInput(String(currentRate));
                setEditing(false);
              }
            }}
            className="w-16 rounded border border-[var(--accent-blue)] bg-[var(--bg-base)] px-1.5 py-0.5 text-xs text-[var(--text-primary)] outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setRateInput(String(currentRate));
              setEditing(true);
            }}
            title={lastUpdated ? `Actualizado: ${lastUpdated}` : 'Click para editar TC'}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-mono text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
          >
            <RefreshCw size={10} aria-hidden />
            {currentRate.toFixed(1)}
          </button>
        )}
      </div>
    </div>
  );
};
