import React, { useMemo, useState, useCallback, useEffect } from 'react';
import type {
  Cost,
  CostCategory,
  Trip,
  Client,
  ScheduledCostDefinition,
  DisplayCurrency,
  User,
} from '../../types';
import { calcCombustiblePorKm, costUsd } from '../../utils/analytics';
import { useSortableTable } from '../../hooks/useSortableTable';
import { Modal } from '../ui/Modal';
import SortableHeader from '../ui/SortableHeader';
import {
  Fuel,
  Wrench,
  MoreHorizontal,
  Plus,
  Pencil,
  Trash2,
  Filter,
  Loader2,
  RefreshCw,
  Calendar,
  Truck,
  Users,
  Home,
  CreditCard,
  Settings,
  Droplets,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const CATEGORIES: CostCategory[] = [
  'Combustible',
  'Sueldos',
  'Alquiler',
  'Cuota Banco',
  'Service',
  'Mantenimiento',
  'AD Blue',
  'Otros',
];

const CATEGORY_UI: Record<CostCategory, { Icon: LucideIcon; iconClass: string; label: string }> = {
  Combustible: { Icon: Fuel, iconClass: 'text-orange-500 bg-orange-500/15', label: 'Combustible' },
  Sueldos: { Icon: Users, iconClass: 'text-blue-500 bg-blue-500/15', label: 'Sueldos' },
  Alquiler: { Icon: Home, iconClass: 'text-purple-500 bg-purple-500/15', label: 'Alquiler' },
  'Cuota Banco': { Icon: CreditCard, iconClass: 'text-red-500 bg-red-500/15', label: 'Cuota Banco' },
  Service: { Icon: Wrench, iconClass: 'text-cyan-500 bg-cyan-500/15', label: 'Service' },
  Mantenimiento: { Icon: Settings, iconClass: 'text-blue-500 bg-blue-500/15', label: 'Mantenimiento' },
  'AD Blue': { Icon: Droplets, iconClass: 'text-sky-500 bg-sky-500/15', label: 'AD Blue' },
  Otros: { Icon: MoreHorizontal, iconClass: 'text-slate-400 bg-slate-500/15', label: 'Otros' },
};

function monthKeyNow(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getClientName(clients: Client[], id: string): string {
  return clients.find((c) => c.id === id)?.nombreComercial ?? 'Cliente';
}

function tripOptionLabel(trip: Trip, clients: Client[]): string {
  return `${trip.fecha} · ${trip.origen} → ${trip.destino} · ${getClientName(clients, trip.clientId)}`;
}

function nextDueFromDefinitions(defs: ScheduledCostDefinition[]): string | null {
  const active = defs.filter((d) => d.active);
  if (active.length === 0) {
    return null;
  }
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  let nearest: Date | null = null;
  for (const sc of active) {
    let dueDate = new Date(y, m, sc.dayOfMonth);
    if (dueDate < today) {
      dueDate = new Date(y, m + 1, sc.dayOfMonth);
    }
    if (!nearest || dueDate < nearest) {
      nearest = dueDate;
    }
  }
  return nearest ? nearest.toISOString().split('T')[0] : null;
}

export interface CostManagerProps {
  user: User;
  costs: Cost[];
  trips: Trip[];
  clients: Client[];
  registradoPor: string;
  onAddCost: (cost: Cost) => boolean | Promise<boolean>;
  onUpdateCost: (cost: Cost) => boolean | Promise<boolean>;
  onDeleteCost: (costId: string) => boolean | Promise<boolean>;
  scheduledCostDefinitions: ScheduledCostDefinition[];
  onCreateScheduledDefinition: (def: ScheduledCostDefinition) => void | Promise<void>;
  onDeleteScheduledDefinition: (id: string) => void | Promise<void>;
  onToggleScheduledDefinitionActive: (id: string) => void | Promise<void>;
  currentRate: number;
  displayCurrency: DisplayCurrency;
  formatAmount: (n: number) => string;
  convertAggregateToDisplay: (amountUSD: number) => number;
}

export const CostManager: React.FC<CostManagerProps> = ({
  user,
  costs,
  trips,
  clients,
  registradoPor,
  onAddCost,
  onUpdateCost,
  onDeleteCost,
  scheduledCostDefinitions,
  onCreateScheduledDefinition,
  onDeleteScheduledDefinition,
  onToggleScheduledDefinitionActive,
  currentRate,
  displayCurrency,
  formatAmount,
  convertAggregateToDisplay,
}) => {
  function costRecordCurrency(c: Cost): 'USD' | 'UYU' {
    return c.currency === 'UYU' || c.moneda === 'UYU' ? 'UYU' : 'USD';
  }

  function formatMonto(monto: number, currency: 'USD' | 'UYU' = 'USD'): string {
    if (currency === 'UYU') {
      return `$U ${monto.toLocaleString('es-UY', { maximumFractionDigits: 0 })}`;
    }
    return monto.toLocaleString('es-UY', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    });
  }

  function formatNativeTotalsLines(costs: Cost[]): React.ReactNode {
    if (costs.length === 0) {
      return '—';
    }
    const hasUsdRow = costs.some((c) => costRecordCurrency(c) === 'USD');
    const hasUyuRow = costs.some((c) => costRecordCurrency(c) === 'UYU');
    let usd = 0;
    let uyu = 0;
    for (const c of costs) {
      if (costRecordCurrency(c) === 'UYU') {
        uyu += c.monto;
      } else {
        usd += c.monto;
      }
    }
    if (hasUsdRow && hasUyuRow) {
      return (
        <span className="flex flex-col gap-0.5 leading-tight">
          <span>{formatMonto(usd, 'USD')}</span>
          <span className="text-[var(--text-muted)]">·</span>
          <span>{formatMonto(uyu, 'UYU')}</span>
        </span>
      );
    }
    if (hasUyuRow && !hasUsdRow) {
      return formatMonto(uyu, 'UYU');
    }
    return formatMonto(usd, 'USD');
  }

  const canManageDefinitions = user.role === 'admin';
  const [costSectionTab, setCostSectionTab] = useState<'list' | 'scheduled'>('list');
  const [catFilter, setCatFilter] = useState<CostCategory | ''>('');
  const [tripFilter, setTripFilter] = useState<string>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);

  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [categoria, setCategoria] = useState<CostCategory>('Otros');
  const [descripcion, setDescripcion] = useState('');
  const [monto, setMonto] = useState('');
  const [costMoneda, setCostMoneda] = useState<'USD' | 'UYU'>('USD');
  const [costTipoCambio, setCostTipoCambio] = useState<number>(40);
  const [tripId, setTripId] = useState<string>('');

  useEffect(() => {
    if (categoria === 'Combustible') {
      setTripId('');
    }
  }, [categoria]);

  const [scNombre, setScNombre] = useState('');
  const [scDescripcion, setScDescripcion] = useState('');
  const [scCategoria, setScCategoria] = useState<CostCategory>('Otros');
  const [scMonto, setScMonto] = useState('');
  const [scMoneda, setScMoneda] = useState<'USD' | 'UYU'>('USD');
  const [scDiaDelMes, setScDiaDelMes] = useState('1');
  const [scTripId, setScTripId] = useState('');

  const sortedTrips = useMemo(
    () => [...trips].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id)),
    [trips]
  );

  const filteredCosts = useMemo(() => {
    return costs.filter((c) => {
      if (catFilter && c.categoria !== catFilter) {
        return false;
      }
      if (tripFilter === 'general' && c.tripId !== null) {
        return false;
      }
      if (tripFilter && tripFilter !== 'general' && c.tripId !== tripFilter) {
        return false;
      }
      if (dateFrom && c.fecha < dateFrom) {
        return false;
      }
      if (dateTo && c.fecha > dateTo) {
        return false;
      }
      return true;
    });
  }, [costs, catFilter, tripFilter, dateFrom, dateTo]);

  type CostSortKey = 'fecha' | 'categoria' | 'descripcion' | 'monto';

  const { sorted: sortedCosts, sort: costSort, handleSort: handleCostSort } = useSortableTable<
    Cost,
    CostSortKey
  >(filteredCosts, { column: 'fecha', direction: 'desc' });

  const totalFiltered = useMemo(
    () => sortedCosts.reduce((s, c) => s + (c.montoUSD ?? costUsd(c)), 0),
    [sortedCosts]
  );
  const activeScheduledCount = useMemo(
    () => scheduledCostDefinitions.filter((sc) => sc.active).length,
    [scheduledCostDefinitions]
  );
  const nextDueDate = useMemo(
    () => nextDueFromDefinitions(scheduledCostDefinitions),
    [scheduledCostDefinitions]
  );

  const metrics = useMemo(() => {
    const mk = monthKeyNow();
    const totalMonth = sortedCosts
      .filter((c) => c.fecha.startsWith(mk))
      .reduce((s, c) => s + (c.montoUSD ?? costUsd(c)), 0);
    const byCat = new Map<string, number>();
    sortedCosts.forEach((c) => {
      const u = c.montoUSD ?? costUsd(c);
      byCat.set(c.categoria, (byCat.get(c.categoria) ?? 0) + u);
    });
    const topEntry = Array.from(byCat.entries()).sort((a, b) => b[1] - a[1])[0];
    const topCat = topEntry ? { name: topEntry[0], total: topEntry[1] } : null;
    const totalM = sortedCosts.reduce((s, c) => s + (c.montoUSD ?? costUsd(c)), 0);
    const linked = sortedCosts
      .filter((c) => c.tripId !== null)
      .reduce((s, c) => s + (c.montoUSD ?? costUsd(c)), 0);
    const general = sortedCosts
      .filter((c) => c.tripId === null)
      .reduce((s, c) => s + (c.montoUSD ?? costUsd(c)), 0);
    const pctLinked = totalM > 0 ? (linked / totalM) * 100 : 0;
    const pctGeneral = totalM > 0 ? (general / totalM) * 100 : 0;
    return { totalMonth, topCat, pctLinked, pctGeneral };
  }, [sortedCosts]);

  const monthLabel = useMemo(
    () =>
      new Date().toLocaleDateString('es-UY', {
        month: 'long',
      }),
    []
  );

  const costsCurrentMonth = useMemo(() => {
    const mk = monthKeyNow();
    return sortedCosts.filter((c) => c.fecha.startsWith(mk));
  }, [sortedCosts]);

  const topCatUi = useMemo(() => {
    if (!metrics.topCat) {
      return null;
    }
    const key = metrics.topCat.name as CostCategory;
    return CATEGORY_UI[key] ?? null;
  }, [metrics.topCat]);

  const fuelMetrics = useMemo(() => {
    const costoPorKm = calcCombustiblePorKm(trips, costs);
    const totalCombustibleUSD = costs
      .filter((c) => c.categoria === 'Combustible')
      .reduce((s, c) => s + (c.montoUSD ?? 0), 0);
    const sinCarga30 = totalCombustibleUSD * 0.3;
    return { costoPorKm, sinCarga30 };
  }, [trips, costs]);

  const openNew = () => {
    setEditingId(null);
    setFecha(new Date().toISOString().slice(0, 10));
    setCategoria('Otros');
    setDescripcion('');
    setMonto('');
    setCostMoneda('USD');
    setCostTipoCambio(40);
    setTripId('');
    setModalOpen(true);
  };

  const openEdit = (c: Cost) => {
    setEditingId(c.id);
    setFecha(c.fecha);
    setCategoria(c.categoria);
    setDescripcion(c.descripcion);
    setMonto(String(c.monto));
    setCostMoneda(c.currency ?? c.moneda ?? 'USD');
    setCostTipoCambio(c.tipoCambio ?? currentRate);
    setTripId(c.categoria === 'Combustible' ? '' : (c.tripId ?? ''));
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setSaveLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const desc = descripcion.trim();
    const amount = Number(monto);
    if (!desc) {
      alert('La descripción es obligatoria.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('El monto debe ser mayor a 0.');
      return;
    }

    setSaveLoading(true);
    try {
      const montoUSD =
        costMoneda === 'USD' ? amount : amount / (costTipoCambio > 0 ? costTipoCambio : 1);
      const effectiveTripId = categoria === 'Combustible' ? null : tripId === '' ? null : tripId;
      const base = {
        fecha,
        categoria,
        descripcion: desc,
        monto: amount,
        moneda: costMoneda,
        currency: costMoneda,
        tipoCambio: costMoneda === 'UYU' ? costTipoCambio : undefined,
        montoUSD,
        tripId: effectiveTripId,
        registradoPor,
        isScheduled: false as const,
      };
      if (editingId) {
        const prev = costs.find((c) => c.id === editingId);
        const updated = await onUpdateCost({
          ...base,
          id: editingId,
          comprobante: prev?.comprobante,
          registradoPor: prev?.registradoPor ?? registradoPor,
          ...(prev?.isScheduled === true
            ? {
                isScheduled: true as const,
                scheduleId: prev.scheduleId,
                scheduledCostId: prev.scheduledCostId,
              }
            : { isScheduled: false as const }),
        });
        if (!updated) {
          return;
        }
      } else {
        const added = await onAddCost({
          ...base,
          id: `K${Date.now()}`,
        });
        if (!added) {
          return;
        }
      }
      closeModal();
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDelete = useCallback(
    async (id: string) => {
      if (!window.confirm('¿Eliminar este costo?')) {
        return;
      }
      const removed = await onDeleteCost(id);
      if (!removed) {
        return;
      }
    },
    [onDeleteCost]
  );

  const resetScheduledForm = () => {
    setScNombre('');
    setScDescripcion('');
    setScCategoria('Otros');
    setScMonto('');
    setScMoneda('USD');
    setScDiaDelMes('1');
    setScTripId('');
  };

  const handleAddScheduledCost = (e: React.FormEvent) => {
    e.preventDefault();
    const nombre = scNombre.trim();
    const descripcionValue = scDescripcion.trim();
    const montoValue = Number(scMonto);
    const dayValue = Number(scDiaDelMes);
    if (!nombre || !descripcionValue) {
      alert('Nombre y descripción son obligatorios.');
      return;
    }
    if (!Number.isFinite(montoValue) || montoValue <= 0) {
      alert('El monto debe ser mayor a 0.');
      return;
    }
    if (!Number.isFinite(dayValue) || dayValue < 1 || dayValue > 28) {
      alert('El día del mes debe estar entre 1 y 28.');
      return;
    }
    const newDef: ScheduledCostDefinition = {
      id: `SC${Date.now()}`,
      categoria: scCategoria,
      descripcion: `${nombre} — ${descripcionValue}`,
      monto: montoValue,
      currency: scMoneda,
      dayOfMonth: dayValue,
      active: true,
      creadoPor: user.username,
      creadoEn: new Date().toISOString().split('T')[0],
      ...(scTripId === '' ? {} : { tripId: scTripId }),
    };
    void onCreateScheduledDefinition(newDef);
    resetScheduledForm();
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Costos operativos</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Total filtrado:{' '}
            <span className="font-semibold" style={{ color: 'var(--accent-emerald)' }}>
              {formatNativeTotalsLines(sortedCosts)}
            </span>
          </p>
        </div>
        {canManageDefinitions ? (
          <div className="flex flex-wrap gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-1">
            <button
              type="button"
              onClick={() => setCostSectionTab('list')}
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                costSectionTab === 'list'
                  ? 'bg-[var(--accent-blue-muted)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Listado de costos
            </button>
            <button
              type="button"
              onClick={() => setCostSectionTab('scheduled')}
              className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                costSectionTab === 'scheduled'
                  ? 'bg-[var(--accent-blue-muted)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <RefreshCw className="h-4 w-4" />
              Costos programados
              {activeScheduledCount > 0 && (
                <span className="rounded-full bg-[var(--accent-purple)] px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {activeScheduledCount}
                </span>
              )}
            </button>
          </div>
        ) : null}
      </div>

      {costSectionTab === 'list' && (
        <>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={openNew}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
            >
              <Plus className="h-4 w-4" />
              Registrar costo
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
            <div
              style={{ borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' }}
              className="border border-[var(--border)] bg-[var(--bg-surface)] p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    Mes actual
                  </p>
                  <p className="mt-1.5 text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
                    {formatNativeTotalsLines(costsCurrentMonth)}
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">{monthLabel}</p>
                </div>
                <div
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5"
                  style={{ color: 'var(--accent-blue)' }}
                >
                  <Calendar className="h-4 w-4" aria-hidden />
                </div>
              </div>
            </div>
            <div
              style={{ borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' }}
              className="border border-[var(--border)] bg-[var(--bg-surface)] p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    Mayor categoría
                  </p>
                  <p className="mt-1.5 text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
                    {metrics.topCat ? metrics.topCat.name : '—'}
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    {metrics.topCat ? formatMonto(metrics.topCat.total, 'USD') : 'Sin datos'}
                  </p>
                </div>
                <div
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5"
                  style={{ color: 'var(--accent-amber)' }}
                >
                  {topCatUi ? <topCatUi.Icon className="h-4 w-4" aria-hidden /> : <MoreHorizontal className="h-4 w-4" aria-hidden />}
                </div>
              </div>
            </div>
            <div
              style={{ borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' }}
              className="border border-[var(--border)] bg-[var(--bg-surface)] p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    Vinculados a viajes
                  </p>
                  <p className="mt-1.5 text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
                    {metrics.pctLinked.toFixed(0)}%
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    {formatAmount(convertAggregateToDisplay((metrics.pctLinked / 100) * totalFiltered))} vs{' '}
                    {formatAmount(convertAggregateToDisplay(totalFiltered))}
                  </p>
                </div>
                <div
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5"
                  style={{ color: 'var(--accent-emerald)' }}
                >
                  <Truck className="h-4 w-4" aria-hidden />
                </div>
              </div>
            </div>
            <div
              style={{ borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' }}
              className="border border-[var(--border)] bg-[var(--bg-surface)] p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    Costo/km estimado
                  </p>
                  <p className="mt-1.5 text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
                    {fuelMetrics.costoPorKm.toFixed(2)}
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">USD/km (70% carga)</p>
                </div>
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5 text-orange-500">
                  <Fuel className="h-4 w-4" aria-hidden />
                </div>
              </div>
              <p className="mt-3 border-t border-[var(--border-subtle)] pt-3 text-xs text-[var(--text-secondary)]">
                <span className="font-medium text-[var(--text-primary)]">30% sin carga:</span>{' '}
                {formatMonto(fuelMetrics.sinCarga30, 'USD')}
              </p>
            </div>
            <div
              style={{ borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' }}
              className="border border-[var(--border)] bg-[var(--bg-surface)] p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    Definiciones activas
                  </p>
                  <p className="mt-1.5 text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
                    {activeScheduledCount}
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    próximo: {nextDueDate ?? '—'}
                  </p>
                </div>
                <div
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5"
                  style={{ color: 'var(--accent-purple)' }}
                >
                  <RefreshCw className="h-4 w-4" aria-hidden />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 shadow-[var(--shadow-sm)]">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
              <Filter className="h-4 w-4" />
              Filtros
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
              <select
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-blue)] focus:ring-1 focus:ring-[var(--accent-blue)]"
                value={catFilter}
                onChange={(e) => setCatFilter((e.target.value || '') as CostCategory | '')}
              >
                <option value="">Todas las categorías</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_UI[c].label}
                  </option>
                ))}
              </select>
              <select
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-blue)] focus:ring-1 focus:ring-[var(--accent-blue)]"
                value={tripFilter}
                onChange={(e) => setTripFilter(e.target.value)}
              >
                <option value="">Todos los viajes / costos</option>
                <option value="general">Solo costos generales</option>
                {sortedTrips.map((t) => (
                  <option key={t.id} value={t.id}>
                    {tripOptionLabel(t, clients)}
                  </option>
                ))}
              </select>
              <input
                type="date"
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-blue)] focus:ring-1 focus:ring-[var(--accent-blue)]"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
              <input
                type="date"
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-blue)] focus:ring-1 focus:ring-[var(--accent-blue)]"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-[var(--border)] shadow-[var(--shadow-sm)]">
            <div className="overflow-x-auto">
              <table
                className="w-full min-w-[760px] text-sm"
                aria-label={`Costos — total filtrado en ${displayCurrency === 'UYU' ? 'pesos uruguayos' : 'dólares'}`}
              >
                <thead>
                  <tr
                    className="border-b border-[var(--border)]"
                    style={{ backgroundColor: 'var(--bg-elevated)' }}
                  >
                    <SortableHeader
                      label="Fecha"
                      column="fecha"
                      currentColumn={costSort.column}
                      direction={costSort.direction}
                      onClick={(col) => handleCostSort(col as CostSortKey)}
                    />
                    <SortableHeader
                      label="Categoría"
                      column="categoria"
                      currentColumn={costSort.column}
                      direction={costSort.direction}
                      onClick={(col) => handleCostSort(col as CostSortKey)}
                    />
                    <SortableHeader
                      label="Descripción"
                      column="descripcion"
                      currentColumn={costSort.column}
                      direction={costSort.direction}
                      onClick={(col) => handleCostSort(col as CostSortKey)}
                    />
                    <th
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
                    >
                      Viaje
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
                    >
                      Programado
                    </th>
                    <SortableHeader
                      label="Monto USD"
                      column="monto"
                      currentColumn={costSort.column}
                      direction={costSort.direction}
                      onClick={(col) => handleCostSort(col as CostSortKey)}
                      align="right"
                    />
                    <th
                      scope="col"
                      className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
                    >
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                  {sortedCosts.map((c, i) => {
                    const ui = CATEGORY_UI[c.categoria] ?? CATEGORY_UI.Otros;
                    const Icon = ui.Icon;
                    const trip = c.tripId ? trips.find((t) => t.id === c.tripId) : null;
                    return (
                      <tr
                        key={c.id}
                        style={{
                          backgroundColor: i % 2 === 0 ? 'var(--bg-table-row)' : 'var(--bg-table-alt)',
                        }}
                        className="hover:bg-[var(--bg-table-hover)] transition-colors duration-100"
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-[var(--text-primary)]">{c.fecha}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-2 rounded-full px-2 py-1 text-xs font-medium ${ui.iconClass}`}
                          >
                            <Icon className="h-3.5 w-3.5" aria-hidden />
                            {ui.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[var(--text-primary)]">{c.descripcion}</td>
                        <td className="max-w-[220px] truncate px-4 py-3 text-xs text-[var(--text-secondary)]">
                          {trip ? tripOptionLabel(trip, clients) : 'Costo general'}
                        </td>
                        <td className="px-4 py-3">
                          {c.isScheduled === true ? (
                            <span
                              style={{ color: 'var(--accent-purple)' }}
                              className="inline-flex items-center gap-1 text-[10px] font-semibold"
                            >
                              <RefreshCw className="h-3 w-3" aria-hidden />
                              Sí
                            </span>
                          ) : (
                            <span className="text-xs text-[var(--text-muted)]">No</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right" style={{ color: 'var(--accent-emerald)' }}>
                          {(c.montoUSD ?? 0).toLocaleString('es-UY', {
                            style: 'currency',
                            currency: 'USD',
                            maximumFractionDigits: 2,
                          })}
                          {c.moneda === 'UYU' && (
                            <span className="ml-1 text-[10px] text-[var(--text-muted)]">
                              (UYU {c.monto.toLocaleString('es-UY')})
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            className="mr-1 rounded-md p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--accent-blue)]"
                            title="Editar"
                            onClick={() => openEdit(c)}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className="rounded p-1.5 text-[var(--accent-red)] hover:bg-[var(--bg-elevated)]"
                            title="Eliminar"
                            onClick={() => void handleDelete(c.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {sortedCosts.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-muted)]">
                        No hay costos con los filtros seleccionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <Modal open={modalOpen} onClose={closeModal} title={editingId ? 'Editar costo' : 'Nuevo costo'} size="md">
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Fecha</label>
                <input
                  type="date"
                  required
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-blue)] focus:ring-1 focus:ring-[var(--accent-blue)]"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Categoría</label>
                <select
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-blue)] focus:ring-1 focus:ring-[var(--accent-blue)]"
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value as CostCategory)}
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {CATEGORY_UI[cat].label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Descripción</label>
                <input
                  type="text"
                  required
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-blue)] focus:ring-1 focus:ring-[var(--accent-blue)]"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                  Monto {costMoneda === 'UYU' ? '($U)' : '(USD)'}
                </label>
                <input
                  type="number"
                  required
                  min={0.01}
                  step="0.01"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-blue)] focus:ring-1 focus:ring-[var(--accent-blue)]"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Moneda</label>
                  <select
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-blue)] focus:ring-1 focus:ring-[var(--accent-blue)]"
                    value={costMoneda}
                    onChange={(e) => setCostMoneda(e.target.value as 'USD' | 'UYU')}
                  >
                    <option value="USD">USD</option>
                    <option value="UYU">UYU</option>
                  </select>
                </div>
                {costMoneda === 'UYU' && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                      Tipo de cambio
                    </label>
                    <input
                      type="number"
                      value={costTipoCambio}
                      onChange={(e) => setCostTipoCambio(Number(e.target.value))}
                      min={1}
                      step="0.1"
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-blue)] focus:ring-1 focus:ring-[var(--accent-blue)]"
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                  Vincular a viaje (opcional)
                </label>
                <select
                  disabled={categoria === 'Combustible'}
                  className={`w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-blue)] focus:ring-1 focus:ring-[var(--accent-blue)] ${categoria === 'Combustible' ? 'cursor-not-allowed opacity-50' : ''}`}
                  value={tripId}
                  onChange={(e) => setTripId(e.target.value)}
                >
                  <option value="">Costo general (sin viaje)</option>
                  {sortedTrips.map((t) => (
                    <option key={t.id} value={t.id}>
                      {tripOptionLabel(t, clients)}
                    </option>
                  ))}
                </select>
                {categoria === 'Combustible' ? (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    El combustible siempre se registra como costo general
                  </p>
                ) : null}
              </div>
              <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saveLoading}
                  className="inline-flex min-w-[120px] items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {saveLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Guardar
                </button>
              </div>
            </form>
          </Modal>
        </>
      )}

      {costSectionTab === 'scheduled' && canManageDefinitions && (
        <div className="space-y-6 sm:grid sm:grid-cols-2 sm:gap-6 sm:space-y-0">
          <section className="space-y-3">
            {scheduledCostDefinitions.length === 0 ? (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-6 text-center">
                <RefreshCw className="mx-auto mb-2 h-6 w-6 text-[var(--accent-purple)]" />
                <p className="text-sm font-semibold text-[var(--text-primary)]">Sin costos programados</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Las definiciones se guardan en Google Sheets (DB_CostosProgramados). Se ejecutan al cargar la
                  app (admin).
                </p>
              </div>
            ) : (
              scheduledCostDefinitions.map((sc) => {
                const scUi = CATEGORY_UI[sc.categoria];
                const ScIcon = scUi.Icon;
                return (
                  <div key={sc.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={sc.active}
                          onClick={() => void onToggleScheduledDefinitionActive(sc.id)}
                          className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${sc.active ? 'bg-[var(--accent-emerald)]' : 'bg-[var(--border-strong)]'}`}
                        >
                          <span
                            className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${sc.active ? 'translate-x-4' : 'translate-x-0'}`}
                          />
                        </button>
                        <div>
                          <p className="text-sm font-semibold text-[var(--text-primary)]">{sc.descripcion}</p>
                          <p className="text-xs text-[var(--text-muted)]">ID: {sc.id}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void onDeleteScheduledDefinition(sc.id)}
                        className="text-[var(--accent-red)] hover:opacity-80"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-[var(--text-secondary)]">
                      <span className="flex items-center gap-1">
                        <ScIcon className="h-3 w-3" />
                        {scUi.label}
                      </span>
                      <span className="font-semibold text-[var(--text-primary)]">
                        {formatMonto(sc.monto, sc.currency === 'UYU' ? 'UYU' : 'USD')}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar size={10} />
                        Día {sc.dayOfMonth} de cada mes
                      </span>
                      <span className="text-[var(--text-muted)]">Creado por {sc.creadoPor}</span>
                    </div>
                  </div>
                );
              })
            )}
          </section>

          <section className="border-t border-[var(--border)] pt-4 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
            <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Agregar definición</h3>
            <form onSubmit={handleAddScheduledCost} className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Nombre *</label>
                <input
                  type="text"
                  required
                  value={scNombre}
                  onChange={(e) => setScNombre(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-blue)] focus:ring-1 focus:ring-[var(--accent-blue)]"
                  placeholder="Alquiler depósito"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Descripción *</label>
                <input
                  type="text"
                  required
                  value={scDescripcion}
                  onChange={(e) => setScDescripcion(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-blue)] focus:ring-1 focus:ring-[var(--accent-blue)]"
                  placeholder="Detalle del gasto recurrente"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Categoría *</label>
                <select
                  value={scCategoria}
                  onChange={(e) => setScCategoria(e.target.value as CostCategory)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-blue)] focus:ring-1 focus:ring-[var(--accent-blue)]"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {CATEGORY_UI[cat].label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                  Monto mensual {scMoneda === 'UYU' ? '($U)' : '(USD)'} *
                </label>
                <input
                  type="number"
                  min={0.01}
                  step="0.01"
                  required
                  value={scMonto}
                  onChange={(e) => setScMonto(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-blue)] focus:ring-1 focus:ring-[var(--accent-blue)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Moneda</label>
                <select
                  value={scMoneda}
                  onChange={(e) => setScMoneda(e.target.value as 'USD' | 'UYU')}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-blue)] focus:ring-1 focus:ring-[var(--accent-blue)]"
                >
                  <option value="USD">USD — Dólar estadounidense</option>
                  <option value="UYU">UYU — Peso uruguayo</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Día del mes *</label>
                <input
                  type="number"
                  min={1}
                  max={28}
                  required
                  value={scDiaDelMes}
                  onChange={(e) => setScDiaDelMes(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-blue)] focus:ring-1 focus:ring-[var(--accent-blue)]"
                />
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Máximo día 28 para compatibilidad con todos los meses.
                </p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
                  Vincular a viaje
                </label>
                <select
                  value={scTripId}
                  onChange={(e) => setScTripId(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-blue)] focus:ring-1 focus:ring-[var(--accent-blue)]"
                >
                  <option value="">Costo general (sin viaje)</option>
                  {sortedTrips.map((t) => (
                    <option key={t.id} value={t.id}>
                      {tripOptionLabel(t, clients)}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
              >
                Guardar definición
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
};
