import React, { useMemo, useState, useCallback } from 'react';
import type { Cost, CostCategory, Trip, Client } from '../../types';
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
}

export const CostManager: React.FC<CostManagerProps> = ({
  costs,
  trips,
  clients,
  registradoPor,
  onAddCost,
  onUpdateCost,
  onDeleteCost,
}) => {
  const [catFilter, setCatFilter] = useState<CostCategory | ''>('');
  const [tripFilter, setTripFilter] = useState<string>(''); // '' | 'general' | tripId
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);

  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [categoria, setCategoria] = useState<CostCategory>('Otros');
  const [descripcion, setDescripcion] = useState('');
  const [monto, setMonto] = useState('');
  const [tripId, setTripId] = useState<string>(''); // '' = general

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

  const openNew = () => {
    setEditingId(null);
    setFecha(new Date().toISOString().slice(0, 10));
    setCategoria('Otros');
    setDescripcion('');
    setMonto('');
    setTripId('');
    setModalOpen(true);
  };

  const openEdit = (c: Cost) => {
    setEditingId(c.id);
    setFecha(c.fecha);
    setCategoria(c.categoria);
    setDescripcion(c.descripcion);
    setMonto(String(c.monto));
    setTripId(c.tripId ?? '');
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
        registradoPor,
      };
      if (editingId) {
        const prev = costs.find((c) => c.id === editingId);
        await onUpdateCost({
          ...base,
          id: editingId,
          comprobante: prev?.comprobante,
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

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 rounded-xl border border-slate-700/60 bg-slate-800/40 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Costos operativos</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Total filtrado:{' '}
            <span className="font-semibold text-emerald-300">
              {totalFiltered.toLocaleString('es-UY', { style: 'currency', currency: 'USD' })}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          <Plus className="h-4 w-4" />
          Registrar costo
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-600/50 bg-slate-800/30 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
            Mes actual (filtrado)
          </p>
          <p className="mt-1 text-lg font-bold text-[var(--text-primary)]">
            {metrics.totalMonth.toLocaleString('es-UY', { style: 'currency', currency: 'USD' })}
          </p>
        </div>
        <div className="rounded-lg border border-slate-600/50 bg-slate-800/30 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
            Mayor gasto (filtrado)
          </p>
          <p className="mt-1 text-lg font-bold text-[var(--text-primary)]">
            {metrics.topCat ? metrics.topCat.name : '—'}
          </p>
          {metrics.topCat && (
            <p className="text-xs text-[var(--text-secondary)]">
              {metrics.topCat.total.toLocaleString('es-UY', { style: 'currency', currency: 'USD' })}
            </p>
          )}
        </div>
        <div className="rounded-lg border border-slate-600/50 bg-slate-800/30 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
            Vinculado vs general (monto filtrado)
          </p>
          <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
            {metrics.pctLinked.toFixed(0)}% vinculados · {metrics.pctGeneral.toFixed(0)}% generales
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700/60 bg-slate-800/20 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
          <Filter className="h-4 w-4" />
          Filtros
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <select
            className="rounded-lg border border-slate-600 bg-slate-900/50 p-2 text-sm text-[var(--text-primary)] outline-none"
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
            className="rounded-lg border border-slate-600 bg-slate-900/50 p-2 text-sm text-[var(--text-primary)] outline-none"
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
            className="rounded-lg border border-slate-600 bg-slate-900/50 p-2 text-sm text-[var(--text-primary)]"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <input
            type="date"
            className="rounded-lg border border-slate-600 bg-slate-900/50 p-2 text-sm text-[var(--text-primary)]"
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
                    <td
                      className="px-4 py-3 text-right font-medium"
                      style={{ color: 'var(--accent-emerald)' }}
                    >
                      {c.monto.toLocaleString('es-UY', { style: 'currency', currency: 'USD' })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        className="mr-1 rounded p-1.5 text-[var(--accent-blue)] hover:bg-[var(--bg-elevated)]"
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
                  <td colSpan={6} className="px-4 py-8 text-center text-[var(--text-muted)]">
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
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2 text-sm text-[var(--text-primary)] outline-none"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Categoría</label>
            <select
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2 text-sm text-[var(--text-primary)] outline-none"
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
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2 text-sm text-[var(--text-primary)] outline-none"
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
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2 text-sm text-[var(--text-primary)] outline-none"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
              Vincular a viaje (opcional)
            </label>
            <select
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2 text-sm text-[var(--text-primary)] outline-none"
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
    </div>
  );
};
