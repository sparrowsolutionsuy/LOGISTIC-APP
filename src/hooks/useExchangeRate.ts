import { useState, useCallback } from 'react';
import type { DisplayCurrency, ExchangeRateContext } from '../types';
import { EXCHANGE_RATE_STORAGE_KEY } from '../constants';

function loadContext(): ExchangeRateContext {
  try {
    const raw = localStorage.getItem(EXCHANGE_RATE_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as ExchangeRateContext;
    }
  } catch {
    /* ignore */
  }
  return {
    displayCurrency: 'USD',
    currentRate: 0,
    lastUpdated: null,
  };
}

function saveContext(ctx: ExchangeRateContext): void {
  localStorage.setItem(EXCHANGE_RATE_STORAGE_KEY, JSON.stringify(ctx));
}

export function useExchangeRate() {
  const [context, setContext] = useState<ExchangeRateContext>(loadContext);

  const setDisplayCurrency = useCallback((currency: DisplayCurrency) => {
    setContext((prev) => {
      const next: ExchangeRateContext = { ...prev, displayCurrency: currency };
      saveContext(next);
      return next;
    });
  }, []);

  const setCurrentRate = useCallback((rate: number) => {
    setContext((prev) => {
      const next: ExchangeRateContext = {
        ...prev,
        currentRate: rate,
        lastUpdated: new Date().toISOString().split('T')[0],
      };
      saveContext(next);
      return next;
    });
  }, []);

  const toggleCurrency = useCallback(() => {
    setContext((prev) => {
      const next: ExchangeRateContext = {
        ...prev,
        displayCurrency: (prev.displayCurrency === 'USD' ? 'UYU' : 'USD') as DisplayCurrency,
      };
      saveContext(next);
      return next;
    });
  }, []);

  const convertToDisplay = useCallback(
    (amount: number, originalCurrency: 'USD' | 'UYU', transactionRate: number): number => {
      if (context.displayCurrency === originalCurrency) {
        return amount;
      }
      if (context.displayCurrency === 'UYU') {
        return originalCurrency === 'USD' ? amount * transactionRate : amount;
      }
      return originalCurrency === 'UYU' ? amount / transactionRate : amount;
    },
    [context.displayCurrency]
  );

  const convertAggregateToDisplay = useCallback(
    (amountUSD: number): number => {
      if (context.displayCurrency === 'USD') {
        return amountUSD;
      }
      return amountUSD * context.currentRate;
    },
    [context.displayCurrency, context.currentRate]
  );

  const formatAmount = useCallback(
    (amount: number): string => {
      if (context.displayCurrency === 'UYU') {
        return amount.toLocaleString('es-UY', {
          style: 'currency',
          currency: 'UYU',
          maximumFractionDigits: 0,
        });
      }
      return amount.toLocaleString('es-UY', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      });
    },
    [context.displayCurrency]
  );

  return {
    displayCurrency: context.displayCurrency,
    currentRate: context.currentRate,
    lastUpdated: context.lastUpdated,
    setDisplayCurrency,
    setCurrentRate,
    toggleCurrency,
    convertToDisplay,
    convertAggregateToDisplay,
    formatAmount,
    currencySymbol: context.displayCurrency === 'USD' ? 'USD' : '$',
  };
}
