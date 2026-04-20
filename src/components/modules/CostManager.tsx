import React, { useMemo, useState, useCallback } from 'react';
import type { Cost, CostCategory, Trip, Client, ScheduledCost } from '../../types';
import { useSortableTable } from '../../hooks/useSortableTable';
import { Modal } from '../ui/Modal';
import SortableHeader from '../ui/SortableHeader';
import {
  Fuel,
  Wrench,
  Receipt,
  Coffee,
  CircleDot,
  Shield,
  MoreHorizontal,
  Plus,
  Pencil,
  Trash2,
  Filter,
  Loader2,
  RefreshCw,
  Calendar,
  Truck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const CATEGORIES: CostCategory[] = [
  'Combustible',
  'Mantenimiento',
  'Peajes',
  'Viáticos',
  'Neumáticos',
  'Seguros',
  'Otros',
];

const CATEGORY_UI: Record<
  CostCategory,
  { Icon: LucideIcon; iconClass: string; label: string }
> = {
  Combustible: { Icon: Fuel, iconClass: 'text-orange-500 bg-orange-500/15', label: 'Combustible' },
  Mantenimiento: { Icon: Wrench, iconClass: 'text-blue-500 bg-blue-500/15', label: 'Mantenimiento' },
  Peajes: { Icon: Receipt, iconClass: 'text-amber-500 bg-amber-500/15', label: 'Peajes' },
  Viáticos: { Icon: Coffee, iconClass: 'text-emerald-500 bg-emerald-500/15', label: 'Viáticos' },
  Neumáticos: { Icon: CircleDot, iconClass: 'text-violet-500 bg-violet-500/15', label: 'Neumáticos' },
  Seguros: { Icon: Shield, iconClass: 'text-cyan-500 bg-cyan-500/15', label: 'Seguros' },
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

export interface CostManagerProps {
  costs: Cost[];
  trips: Trip[];
  clients: Client[];
  registradoPor: string;
  onAddCost: (cost: Cost) => void | Promise<void>;
  onUpdateCost: (cost: Cost) => void | Promise<void>;
  onDeleteCost: (costId: string) => void | Promise<void>;
  scheduledCosts: ScheduledCost[];
  onAddScheduledCost: (sc: Omit<ScheduledCost, 'id' | 'creadoEn' | 'ultimaEjecucion'>) => void;
  onUpdateScheduledCost: (id: string, updates: Partial<ScheduledCost>) => void;
  onDeleteScheduledCost: (id: string) => void;
  onToggleScheduledCost: (id: string) => void;
  nextDueDate: string | null;
}

export const CostManager: React.FC<CostManagerProps> = ({
  costs,
  trips,
  clients,
  registradoPor,
  onAddCost,
  onUpdateCost,
  onDeleteCost,
  scheduledCosts,
  onAddScheduledCost,
  onUpdateScheduledCost: _onUpdateScheduledCost,
  onDeleteScheduledCost,
  onToggleScheduledCost,
  nextDueDate,
}) => {
  const [catFilter, setCatFilter] = useState<CostCategory | ''>('');
  const [tripFilter, setTripFilter] = useState<string>(''); // '' | 'general' | tripId
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [scheduledModalOpen, setScheduledModalOpen] = useState(false);

  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [categoria, setCategoria] = useState<CostCategory>('Otros');
  const [descripcion, setDescripcion] = useState('');
  const [monto, setMonto] = useState('');
  const [tripId, setTripId] = useState<string>(''); // '' = general
  const [scheduledCostId, setScheduledCostId] = useState('');

  const [scNombre, setScNombre] = useState('');
  const [scDescripcion, setScDescripcion] = useState('');
  const [scCategoria, setScCategoria] = useState<CostCategory>('Otros');
  const [scMonto, setScMonto] = useState('');
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

  const totalFiltered = useMemo(() => sortedCosts.reduce((s, c) => s + c.monto, 0), [sortedCosts]);
  const avgFiltered = useMemo(
    () => (sortedCosts.length > 0 ? totalFiltered / sortedCosts.length : 0),
    [sortedCosts.length, totalFiltered]
  );
  const activeScheduledCount = useMemo(
    () => scheduledCosts.filter((sc) => sc.activo).length,
    [scheduledCosts]
  );

  const metrics = useMemo(() => {
    const mk = monthKeyNow();
    const totalMonth = sortedCosts
      .filter((c) => c.fecha.startsWith(mk))
      .reduce((s, c) => s + c.monto, 0);
    const byCat = new Map<string, number>();
    sortedCosts.forEach((c) => {
      byCat.set(c.categoria, (byCat.get(c.categoria) ?? 0) + c.monto);
    });
    const topEntry = Array.from(byCat.entries()).sort((a, b) => b[1] - a[1])[0];
    const topCat = topEntry ? { name: topEntry[0], total: topEntry[1] } : null;
    const totalM = sortedCosts.reduce((s, c) => s + c.monto, 0);
    const linked = sortedCosts.filter((c) => c.tripId !== null).reduce((s, c) => s + c.monto, 0);
    const general = sortedCosts.filter((c) => c.tripId === null).reduce((s, c) => s + c.monto, 0);
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

  const topCatUi = useMemo(() => {
    if (!metrics.topCat) {
      return null;
    }
    const key = metrics.topCat.name as CostCategory;
    return CATEGORY_UI[key] ?? null;
  }, [metrics.topCat]);

  const openNew = () => {
    setEditingId(null);
    setFecha(new Date().toISOString().slice(0, 10));
    setCategoria('Otros');
    setDescripcion('');
    setMonto('');
    setTripId('');
    setScheduledCostId('');
    setModalOpen(true);
  };

  const openEdit = (c: Cost) => {
    setEditingId(c.id);
    setFecha(c.fecha);
    setCategoria(c.categoria);
    setDescripcion(c.descripcion);
    setMonto(String(c.monto));
    setTripId(c.tripId ?? '');
    setScheduledCostId(c.scheduledCostId ?? '');
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
      const base = {
        fecha,
        categoria,
        descripcion: desc,
        monto: amount,
        tripId: tripId === '' ? null : tripId,
        scheduledCostId: scheduledCostId.trim() !== '' ? scheduledCostId.trim() : undefined,
        registradoPor,
      };
      if (editingId) {
        const prev = costs.find((c) => c.id === editingId);
        await onUpdateCost({
          ...base,
          id: editingId,
          comprobante: prev?.comprobante,
          scheduledCostId: prev?.scheduledCostId ?? base.scheduledCostId,
          registradoPor: prev?.registradoPor ?? registradoPor,
        });
      } else {
        await onAddCost({
          ...base,
          id: `K${Date.now()}`,
        });
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
      await onDeleteCost(id);
    },
    [onDeleteCost]
  );

  const resetScheduledForm = () => {
    setScNombre('');
    setScDescripcion('');
    setScCategoria('Otros');
    setScMonto('');
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
    onAddScheduledCost({
      nombre,
      descripcion: descripcionValue,
      categoria: scCategoria,
      monto: montoValue,
      activo: true,
      frecuencia: 'monthly',
      diaDelMes: dayValue,
      tripId: scTripId === '' ? null : scTripId,
    });
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
              {totalFiltered.toLocaleString('es-UY', { style: 'currency', currency: 'USD' })}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setScheduledModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-purple)] hover:text-[var(--accent-purple)]"
          >
            <RefreshCw className="h-4 w-4" />
            Costos programados
            {activeScheduledCount > 0 && (
              <span className="rounded-full bg-[var(--accent-purple)] px-1.5 py-0.5 text-[10px] font-bold text-white">
                {activeScheduledCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            <Plus className="h-4 w-4" />
            Registrar costo
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
                {metrics.totalMonth.toLocaleString('es-UY', { style: 'currency', currency: 'USD' })}
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
                {metrics.topCat
                  ? metrics.topCat.total.toLocaleString('es-UY', { style: 'currency', currency: 'USD' })
                  : 'Sin datos'}
              </p>
            </div>
            <div
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2.5"
              style={{ color: 'var(--accent-amber)' }}
            >
              {topCatUi ? <topCatUi.Icon className="h-4 w-4" aria-hidden /> : <MoreHorizontal className="h-4 w-4" />}
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
                {((metrics.pctLinked / 100) * totalFiltered).toLocaleString('es-UY', {
                  style: 'currency',
                  currency: 'USD',
                })}{' '}
                vs{' '}
                {totalFiltered.toLocaleString('es-UY', {
                  style: 'currency',
                  currency: 'USD',
                })}
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
                Costos programados
              </p>
              <p className="mt-1.5 text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
                {activeScheduledCount}
              </p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                próximo vencimiento: {nextDueDate ?? 'sin fecha'}
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
          <table className="w-full min-w-[720px] text-sm">
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
                  label="Monto"
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
                const ui = CATEGORY_UI[c.categoria];
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
                    <td className="whitespace-nowrap px-4 py-3 text-[var(--text-primary)]">
                      {c.fecha}
                    </td>
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
                      {c.scheduledCostId ? (
                        <span
                          style={{ color: 'var(--accent-purple)' }}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold"
                        >
                          <RefreshCw className="h-3 w-3" aria-hidden />
                          Auto
                        </span>
                      ) : null}
                    </td>
                    <td
                      className="px-4 py-3 text-right font-semibold"
                      style={{ color: c.monto > avgFiltered ? 'var(--accent-emerald)' : 'var(--text-primary)' }}
                    >
                      {c.monto.toLocaleString('es-UY', { style: 'currency', currency: 'USD' })}
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
            <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Monto (USD)</label>
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
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
              Vincular a viaje (opcional)
            </label>
            <select
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-blue)] focus:ring-1 focus:ring-[var(--accent-blue)]"
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
          </div>
          <input type="hidden" value={scheduledCostId} readOnly />
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

      <Modal
        open={scheduledModalOpen}
        onClose={() => setScheduledModalOpen(false)}
        title="Costos recurrentes programados"
        size="lg"
      >
        <div className="space-y-6 sm:grid sm:grid-cols-2 sm:gap-6 sm:space-y-0">
          <section className="space-y-3">
            {scheduledCosts.length === 0 ? (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-6 text-center">
                <RefreshCw className="mx-auto mb-2 h-6 w-6 text-[var(--accent-purple)]" />
                <p className="text-sm font-semibold text-[var(--text-primary)]">Sin costos programados</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Configurá costos recurrentes para que se generen automáticamente cada mes.
                </p>
              </div>
            ) : (
              scheduledCosts.map((sc) => {
                const scUi = CATEGORY_UI[sc.categoria];
                const ScIcon = scUi.Icon;
                return (
                  <div key={sc.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={sc.activo}
                          onClick={() => onToggleScheduledCost(sc.id)}
                          className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${sc.activo ? 'bg-[var(--accent-emerald)]' : 'bg-[var(--border-strong)]'}`}
                        >
                          <span
                            className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${sc.activo ? 'translate-x-4' : 'translate-x-0'}`}
                          />
                        </button>
                        <div>
                          <p className="text-sm font-semibold text-[var(--text-primary)]">{sc.nombre}</p>
                          <p className="text-xs text-[var(--text-muted)]">{sc.descripcion}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteScheduledCost(sc.id)}
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
                        {sc.monto.toLocaleString('es-UY', { style: 'currency', currency: 'USD' })}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar size={10} />
                        Día {sc.diaDelMes} de cada mes
                      </span>
                      {sc.ultimaEjecucion && (
                        <span className="text-[var(--text-muted)]">Último: {sc.ultimaEjecucion}</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </section>

          <section className="border-t border-[var(--border)] pt-4 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
            <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Agregar nuevo</h3>
            <form onSubmit={handleAddScheduledCost} className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Nombre del costo *</label>
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
                  placeholder="Alquiler mensual depósito Paso de los Toros"
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
                  Monto mensual (USD) *
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
                  El costo se generará automáticamente este día de cada mes.
                </p>
                <p className="text-xs text-[var(--text-muted)]">
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
                Guardar costo programado
              </button>
            </form>
          </section>
        </div>
      </Modal>
    </div>
  );
};
