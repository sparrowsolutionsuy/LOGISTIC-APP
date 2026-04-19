import React, { useMemo, useState, useEffect } from 'react';
import type { Trip, TripStatus, Client, User, Cost, TripWithMetrics } from '../../types';
import { enrichTrips } from '../../utils/analytics';
import { useSortableTable } from '../../hooks/useSortableTable';
import Badge from '../ui/Badge';
import SortableHeader from '../ui/SortableHeader';
import { Modal } from '../ui/Modal';
import { uploadInvoice } from '../../services/api';
import {
  Plus,
  Calendar,
  Package,
  ArrowRight,
  Search,
  Filter,
  Pencil,
  Trash2,
  Upload,
  FileText,
  ExternalLink,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

const PAGE_SIZE = 15;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ACCEPT_INVOICE = 'application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png';

export interface TripManagerProps {
  trips: Trip[];
  clients: Client[];
  costs: Cost[];
  user: User;
  onAddTrip: (trip: Trip) => void | Promise<void>;
  onUpdateTrip: (trip: Trip) => void | Promise<void>;
  onDeleteTrip: (tripId: string) => void | Promise<void>;
  onInvoiceUploaded: (tripId: string, url: string) => void;
}

function getClientName(clients: Client[], id: string): string {
  return clients.find((c) => c.id === id)?.nombreComercial ?? 'Desconocido';
}

function sumCostsForTrip(costs: Cost[], tripId: string): number {
  return costs.filter((c) => c.tripId === tripId).reduce((a, c) => a + c.monto, 0);
}

function tripRevenue(t: Trip): number {
  return t.tarifa * (t.pesoKg / 1000);
}

function operativoCanSeeTrip(t: Trip, user: User): boolean {
  if (t.estado === 'Cerrado') {
    return false;
  }
  return !t.asignadoA || t.asignadoA === user.username;
}

export const TripManager: React.FC<TripManagerProps> = ({
  trips,
  clients,
  costs,
  user,
  onAddTrip,
  onUpdateTrip,
  onDeleteTrip,
  onInvoiceUploaded,
}) => {
  const isAdmin = user.role === 'admin';

  const [searchText, setSearchText] = useState('');
  const [estadoFilter, setEstadoFilter] = useState<TripStatus | ''>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [closedWarnTrip, setClosedWarnTrip] = useState<Trip | null>(null);

  const [uploadTripId, setUploadTripId] = useState<string | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [invoicePreview, setInvoicePreview] = useState<{ tripId: string; name: string } | null>(
    null
  );

  const [newTrip, setNewTrip] = useState<Partial<Trip>>({
    estado: 'Pendiente',
    fecha: new Date().toISOString().split('T')[0],
  });

  const roleTrips = useMemo(() => {
    if (isAdmin) {
      return trips;
    }
    return trips.filter((t) => operativoCanSeeTrip(t, user));
  }, [trips, isAdmin, user]);

  const filteredTrips = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return roleTrips.filter((t) => {
      if (estadoFilter && t.estado !== estadoFilter) {
        return false;
      }
      if (startDate && t.fecha < startDate) {
        return false;
      }
      if (endDate && t.fecha > endDate) {
        return false;
      }
      if (!q) {
        return true;
      }
      const clientName = getClientName(clients, t.clientId).toLowerCase();
      return (
        t.id.toLowerCase().includes(q) ||
        clientName.includes(q) ||
        t.origen.toLowerCase().includes(q) ||
        t.destino.toLowerCase().includes(q) ||
        t.contenido.toLowerCase().includes(q)
      );
    });
  }, [roleTrips, searchText, estadoFilter, startDate, endDate, clients]);

  const enrichedFiltered = useMemo(
    () => enrichTrips(filteredTrips, clients, costs),
    [filteredTrips, clients, costs]
  );

  type TripSortKey = 'fecha' | 'clientName' | 'estado' | 'tarifa' | 'netMargin';

  const { sorted: sortedTrips, sort, handleSort } = useSortableTable<TripWithMetrics, TripSortKey>(
    enrichedFiltered,
    { column: 'fecha', direction: 'desc' }
  );

  useEffect(() => {
    setPage(1);
  }, [searchText, estadoFilter, startDate, endDate, roleTrips.length]);

  const totalPages = Math.max(1, Math.ceil(sortedTrips.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageSlice = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return sortedTrips.slice(start, start + PAGE_SIZE);
  }, [sortedTrips, safePage]);

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const openNewForm = () => {
    setEditingId(null);
    setNewTrip({
      estado: 'Pendiente',
      fecha: new Date().toISOString().split('T')[0],
      clientId: '',
      contenido: '',
      origen: '',
      destino: '',
      pesoKg: undefined,
      kmRecorridos: 0,
      tarifa: undefined,
    });
    setFormOpen(true);
  };

  const openEditForm = (trip: Trip) => {
    if (trip.estado === 'Cerrado' && isAdmin) {
      setClosedWarnTrip(trip);
      return;
    }
    if (!isAdmin) {
      return;
    }
    setEditingId(trip.id);
    setNewTrip({ ...trip });
    setFormOpen(true);
  };

  const proceedEditClosedTrip = () => {
    if (!closedWarnTrip) {
      return;
    }
    const trip = closedWarnTrip;
    setClosedWarnTrip(null);
    setEditingId(trip.id);
    setNewTrip({ ...trip });
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setSaveLoading(false);
    setNewTrip({ estado: 'Pendiente', fecha: new Date().toISOString().split('T')[0] });
  };

  const validateForm = (): string | null => {
    if (!newTrip.fecha?.trim()) {
      return 'La fecha es obligatoria.';
    }
    if (!newTrip.clientId) {
      return 'Seleccioná un cliente.';
    }
    if (!newTrip.origen?.trim() || !newTrip.destino?.trim()) {
      return 'Origen y destino son obligatorios.';
    }
    if (!newTrip.contenido?.trim()) {
      return 'El contenido de carga es obligatorio.';
    }
    const peso = Number(newTrip.pesoKg);
    if (!Number.isFinite(peso) || peso <= 0) {
      return 'El peso debe ser mayor a 0.';
    }
    const tarifa = Number(newTrip.tarifa);
    if (!Number.isFinite(tarifa) || tarifa <= 0) {
      return 'La tarifa debe ser mayor a 0.';
    }
    const km = Number(newTrip.kmRecorridos ?? 0);
    if (!Number.isFinite(km) || km < 0) {
      return 'KM recorridos inválidos.';
    }
    return null;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateForm();
    if (err) {
      alert(err);
      return;
    }
    if (!isAdmin) {
      return;
    }

    setSaveLoading(true);
    try {
      const base = {
        fecha: String(newTrip.fecha),
        clientId: String(newTrip.clientId),
        contenido: String(newTrip.contenido).trim(),
        pesoKg: Number(newTrip.pesoKg),
        kmRecorridos: Number(newTrip.kmRecorridos ?? 0),
        tarifa: Number(newTrip.tarifa),
        origen: String(newTrip.origen).trim(),
        destino: String(newTrip.destino).trim(),
        estado: (newTrip.estado as TripStatus) ?? 'Pendiente',
        facturaUrl: newTrip.facturaUrl,
        asignadoA: newTrip.asignadoA,
      };

      if (editingId) {
        const updated: Trip = {
          ...base,
          id: editingId,
        };
        await onUpdateTrip(updated);
      } else {
        const trip: Trip = {
          ...base,
          id: `V${Date.now()}`,
        };
        await onAddTrip(trip);
      }
      closeForm();
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin) {
      return;
    }
    if (!window.confirm(`¿Eliminar el viaje ${id}? Esta acción no se puede deshacer.`)) {
      return;
    }
    await onDeleteTrip(id);
  };

  const handleMarkCompleted = async (trip: Trip) => {
    await onUpdateTrip({ ...trip, estado: 'Completado' });
  };

  const handleInvoiceChange = (trip: Trip, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) {
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      alert('El archivo supera el máximo de 5 MB.');
      return;
    }
    setInvoicePreview({ tripId: trip.id, name: file.name });
    setUploadTripId(trip.id);
    setUploadLoading(true);

    const mimeType = file.type || 'application/octet-stream';
    const ext = file.name.includes('.') ? file.name.split('.').pop() : 'pdf';
    const fileName = `Factura_${trip.id}_${Date.now()}.${ext ?? 'pdf'}`;

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      try {
        const raw = reader.result;
        if (typeof raw !== 'string') {
          alert('No se pudo leer el archivo.');
          return;
        }
        const parts = raw.split(',');
        const fileData = parts.length > 1 ? parts[1] : '';
        if (!fileData) {
          alert('No se pudo obtener el contenido del archivo.');
          return;
        }
        const url = await uploadInvoice(trip.id, fileData, fileName, mimeType);
        if (url) {
          onInvoiceUploaded(trip.id, url);
        } else {
          alert('No se recibió URL de la factura. Reintentá o verificá la configuración.');
        }
      } catch (err) {
        console.error(err);
        alert('Error al subir la factura.');
      } finally {
        setUploadLoading(false);
        setUploadTripId(null);
        setInvoicePreview(null);
      }
    };
    reader.onerror = () => {
      setUploadLoading(false);
      setUploadTripId(null);
      setInvoicePreview(null);
      alert('Error al leer el archivo.');
    };
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Gestión de viajes</h1>
          <p className="text-sm text-slate-500">
            {isAdmin ? 'Administración completa del ciclo de vida.' : 'Tus asignaciones operativas.'}
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={openNewForm}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-900 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-800"
          >
            <Plus className="h-4 w-4" />
            Nuevo viaje
          </button>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center text-sm font-semibold text-slate-700">
          <Filter className="mr-2 h-4 w-4" />
          Filtros y búsqueda
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-6">
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Cliente, origen, destino, carga o ID…"
              className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          <select
            className="rounded-lg border border-slate-300 bg-slate-50 p-2 text-sm outline-none"
            value={estadoFilter}
            onChange={(e) => setEstadoFilter((e.target.value || '') as TripStatus | '')}
          >
            <option value="">Todos los estados</option>
            <option value="Pendiente">Pendiente</option>
            <option value="En Tránsito">En tránsito</option>
            <option value="Completado">Completado</option>
            <option value="Cerrado">Cerrado</option>
          </select>
          <input
            type="date"
            className="rounded-lg border border-slate-300 bg-slate-50 p-2 text-sm"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <input
            type="date"
            className="rounded-lg border border-slate-300 bg-slate-50 p-2 text-sm"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>

      <Modal
        open={!!closedWarnTrip}
        onClose={() => setClosedWarnTrip(null)}
        title="Viaje cerrado"
        size="sm"
      >
        <p className="text-sm text-[var(--text-secondary)]">
          Este viaje está en estado <strong>Cerrado</strong>. Editarlo puede afectar auditoría y
          facturación. ¿Deseás continuar?
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
            onClick={() => setClosedWarnTrip(null)}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700"
            onClick={proceedEditClosedTrip}
          >
            Continuar
          </button>
        </div>
      </Modal>

      <Modal
        open={formOpen}
        onClose={closeForm}
        title={editingId ? 'Editar viaje' : 'Nuevo viaje'}
        size="lg"
      >
        <form onSubmit={(e) => void handleSave(e)} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">Cliente</label>
            <select
              required
              className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2 outline-none"
              value={newTrip.clientId || ''}
              onChange={(e) => setNewTrip({ ...newTrip, clientId: e.target.value })}
            >
              <option value="">Seleccionar…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombreComercial}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Fecha</label>
            <input
              type="date"
              required
              className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2 outline-none"
              value={newTrip.fecha || ''}
              onChange={(e) => setNewTrip({ ...newTrip, fecha: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Estado</label>
            <select
              className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2 outline-none"
              value={newTrip.estado || 'Pendiente'}
              onChange={(e) =>
                setNewTrip({ ...newTrip, estado: e.target.value as TripStatus })
              }
            >
              <option value="Pendiente">Pendiente</option>
              <option value="En Tránsito">En tránsito</option>
              <option value="Completado">Completado</option>
              <option value="Cerrado">Cerrado</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">Contenido de carga</label>
            <input
              type="text"
              required
              className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2 outline-none"
              value={newTrip.contenido || ''}
              onChange={(e) => setNewTrip({ ...newTrip, contenido: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Origen</label>
            <input
              type="text"
              required
              className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2 outline-none"
              value={newTrip.origen || ''}
              onChange={(e) => setNewTrip({ ...newTrip, origen: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Destino</label>
            <input
              type="text"
              required
              className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2 outline-none"
              value={newTrip.destino || ''}
              onChange={(e) => setNewTrip({ ...newTrip, destino: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Peso (kg)</label>
            <input
              type="number"
              required
              min={0.01}
              step="0.01"
              className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2 outline-none"
              value={newTrip.pesoKg ?? ''}
              onChange={(e) => setNewTrip({ ...newTrip, pesoKg: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">KM recorridos</label>
            <input
              type="number"
              required
              min={0}
              className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2 outline-none"
              value={newTrip.kmRecorridos ?? ''}
              onChange={(e) => setNewTrip({ ...newTrip, kmRecorridos: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Tarifa (USD / ton)</label>
            <input
              type="number"
              required
              min={0.01}
              step="0.01"
              className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2 outline-none"
              value={newTrip.tarifa ?? ''}
              onChange={(e) => setNewTrip({ ...newTrip, tarifa: Number(e.target.value) })}
            />
          </div>
          <div className="md:col-span-2 flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={closeForm}
              className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saveLoading}
              className="inline-flex min-w-[140px] items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {saveLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editingId ? 'Guardar cambios' : 'Crear viaje'}
            </button>
          </div>
        </form>
      </Modal>

      <div className="overflow-hidden rounded-xl border border-[var(--border)] shadow-[var(--shadow-sm)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr
                className="border-b border-[var(--border)]"
                style={{ backgroundColor: 'var(--bg-elevated)' }}
              >
                <SortableHeader
                  label="Fecha"
                  column="fecha"
                  currentColumn={sort.column}
                  direction={sort.direction}
                  onClick={(col) => handleSort(col as TripSortKey)}
                />
                <SortableHeader
                  label="Cliente"
                  column="clientName"
                  currentColumn={sort.column}
                  direction={sort.direction}
                  onClick={(col) => handleSort(col as TripSortKey)}
                />
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
                >
                  Ruta
                </th>
                <SortableHeader
                  label="Estado"
                  column="estado"
                  currentColumn={sort.column}
                  direction={sort.direction}
                  onClick={(col) => handleSort(col as TripSortKey)}
                  align="center"
                />
                <SortableHeader
                  label="Tarifa"
                  column="tarifa"
                  currentColumn={sort.column}
                  direction={sort.direction}
                  onClick={(col) => handleSort(col as TripSortKey)}
                  align="right"
                />
                <SortableHeader
                  label="Margen"
                  column="netMargin"
                  currentColumn={sort.column}
                  direction={sort.direction}
                  onClick={(col) => handleSort(col as TripSortKey)}
                  align="right"
                />
                <th
                  scope="col"
                  className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
                >
                  Factura
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
                >
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
              {pageSlice.map((trip, i) => {
                const c = sumCostsForTrip(costs, trip.id);
                const rev = tripRevenue(trip);
                const hasCosts = costs.some((x) => x.tripId === trip.id);
                const margin = hasCosts ? rev - c : null;
                const uploadingThis = uploadLoading && uploadTripId === trip.id;

                return (
                  <tr
                    key={trip.id}
                    style={{
                      backgroundColor: i % 2 === 0 ? 'var(--bg-table-row)' : 'var(--bg-table-alt)',
                    }}
                    className="hover:bg-[var(--bg-table-hover)] transition-colors duration-100"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                        <Calendar className="h-3 w-3 shrink-0" aria-hidden />
                        <span className="text-[var(--text-primary)]">{trip.fecha}</span>
                      </div>
                      <div className="font-mono text-[10px] text-[var(--text-muted)]">{trip.id}</div>
                    </td>
                    <td className="px-4 py-3 font-medium text-[var(--text-primary)]">
                      {trip.clientName}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-xs text-[var(--text-primary)]">
                        <span>{trip.origen}</span>
                        <ArrowRight className="h-3 w-3 shrink-0 text-[var(--text-muted)]" aria-hidden />
                        <span>{trip.destino}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                        <Package className="h-3 w-3 shrink-0" aria-hidden />
                        {trip.contenido}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge status={trip.estado} />
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-[var(--text-primary)]">
                      ${trip.tarifa}
                    </td>
                    <td className="px-4 py-3 text-right text-xs">
                      {margin !== null ? (
                        <span
                          style={{
                            color: margin >= 0 ? 'var(--accent-emerald)' : 'var(--accent-red)',
                          }}
                        >
                          ${margin.toLocaleString('es-UY', { maximumFractionDigits: 0 })}
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {trip.facturaUrl ? (
                        <a
                          href={trip.facturaUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent-blue)] hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" aria-hidden />
                          Ver
                        </a>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        {isAdmin && (
                          <button
                            type="button"
                            title="Editar"
                            onClick={() => openEditForm(trip)}
                            className="rounded-md p-1.5 text-blue-600 hover:bg-blue-50"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            type="button"
                            title="Eliminar"
                            onClick={() => void handleDelete(trip.id)}
                            className="rounded-md p-1.5 text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                        {isAdmin && trip.estado !== 'Cerrado' && (
                          <label className="cursor-pointer rounded-md p-1.5 text-slate-600 hover:bg-slate-100">
                            <input
                              type="file"
                              accept={ACCEPT_INVOICE}
                              className="hidden"
                              disabled={uploadingThis}
                              onChange={(ev) => handleInvoiceChange(trip, ev)}
                            />
                            {uploadingThis ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Upload className="h-4 w-4" />
                            )}
                          </label>
                        )}
                        {!isAdmin &&
                          trip.estado === 'En Tránsito' &&
                          (!trip.asignadoA || trip.asignadoA === user.username) && (
                            <button
                              type="button"
                              onClick={() => void handleMarkCompleted(trip)}
                              className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                            >
                              Completado
                            </button>
                          )}
                      </div>
                        {isAdmin && invoicePreview?.tripId === trip.id && (
                          <p className="mt-1 max-w-[160px] truncate text-[10px] text-[var(--text-muted)]">
                            <FileText className="mr-1 inline h-3 w-3" aria-hidden />
                            {invoicePreview.name}
                            {uploadingThis ? ' · subiendo…' : ''}
                          </p>
                        )}
                    </td>
                  </tr>
                );
              })}
              {pageSlice.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-[var(--text-muted)]">
                    No hay viajes que coincidan con los filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {sortedTrips.length > PAGE_SIZE && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] px-3 py-2 text-sm text-[var(--text-secondary)]">
            <span>
              Página {safePage} de {totalPages} · {sortedTrips.length} viajes
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-md border border-[var(--border)] p-2 hover:bg-[var(--bg-elevated)] disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-md border border-[var(--border)] p-2 hover:bg-[var(--bg-elevated)] disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {isAdmin && (
        <p className="text-xs text-slate-500">
          Facturas: PDF, JPG o PNG, máximo 5 MB. Al completar la subida el viaje pasa a estado Cerrado.
        </p>
      )}
    </div>
  );
};
