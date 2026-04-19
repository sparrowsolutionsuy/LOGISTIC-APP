import React, { useState, useEffect } from 'react';
import type { Trip, TripStatus, Client, User } from '../../types';
import { updateTripInSheet, deleteTripInSheet } from '../../services/api';
import { Badge } from '../ui/Badge';
import {
  Plus,
  Calendar,
  Package,
  ArrowRight,
  DollarSign,
  Search,
  Filter,
  Sparkles,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';

interface TripManagerProps {
  trips: Trip[];
  clients: Client[];
  onAddTrip: (trip: Trip) => void;
  user: User;
}

export const TripManager: React.FC<TripManagerProps> = ({
  trips,
  clients,
  onAddTrip,
  user,
}) => {
  const isAdmin = user.role === 'admin';
  const [activeTab, setActiveTab] = useState<'current' | 'programmed' | 'all'>('current');
  const [showForm, setShowForm] = useState(false);
  const [suggestedKm, setSuggestedKm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [filters, setFilters] = useState({
    searchId: '',
    startDate: '',
    endDate: '',
    clientId: '',
    status: '',
  });

  const [newTrip, setNewTrip] = useState<Partial<Trip>>({
    estado: 'Pendiente',
    fecha: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    if (!editingId && newTrip.origen && newTrip.destino && showForm) {
      const origin = newTrip.origen.trim().toLowerCase();
      const dest = newTrip.destino.trim().toLowerCase();

      const matchingTrips = trips.filter(
        (t) =>
          t.origen.toLowerCase() === origin &&
          t.destino.toLowerCase() === dest &&
          t.kmRecorridos > 0
      );

      if (matchingTrips.length > 0) {
        const totalKm = matchingTrips.reduce((acc, t) => acc + t.kmRecorridos, 0);
        const avgKm = Math.round(totalKm / matchingTrips.length);
        setNewTrip((prev) => ({ ...prev, kmRecorridos: avgKm }));
        setSuggestedKm(true);
      } else {
        setSuggestedKm(false);
      }
    }
  }, [newTrip.origen, newTrip.destino, trips, showForm, editingId]);

  const filteredTrips = trips.filter((t) => {
    if (activeTab === 'current' && t.estado !== 'En Tránsito') {
      return false;
    }
    if (activeTab === 'programmed' && t.estado !== 'Pendiente') {
      return false;
    }

    if (filters.searchId && !t.id.toLowerCase().includes(filters.searchId.toLowerCase())) {
      return false;
    }
    if (filters.clientId && t.clientId !== filters.clientId) {
      return false;
    }
    if (filters.status && t.estado !== filters.status) {
      return false;
    }
    if (filters.startDate && t.fecha < filters.startDate) {
      return false;
    }
    if (filters.endDate && t.fecha > filters.endDate) {
      return false;
    }

    return true;
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newTrip.clientId && newTrip.pesoKg) {
      const finalTarifa = newTrip.tarifa !== undefined ? Number(newTrip.tarifa) : 0;

      if (editingId) {
        if (!isAdmin) {
          alert('Solo los administradores pueden editar viajes existentes.');
          return;
        }
        const updatedTrip: Trip = {
          ...(newTrip as Trip),
          id: editingId,
        };
        await updateTripInSheet(updatedTrip);
        alert('Viaje actualizado. Recargue para ver cambios en la tabla.');
      } else {
        const trip: Trip = {
          id: `V${Date.now()}`,
          fecha: newTrip.fecha || '',
          clientId: newTrip.clientId,
          estado: newTrip.estado || 'Pendiente',
          contenido: newTrip.contenido || '',
          pesoKg: Number(newTrip.pesoKg),
          kmRecorridos: Number(newTrip.kmRecorridos || 0),
          tarifa: finalTarifa,
          origen: newTrip.origen || '',
          destino: newTrip.destino || '',
        };
        onAddTrip(trip);
      }

      closeForm();
    }
  };

  const handleEdit = (trip: Trip) => {
    if (!isAdmin) {
      return;
    }
    setNewTrip(trip);
    setEditingId(trip.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin) {
      return;
    }
    if (!id) {
      return;
    }

    const confirmed = window.confirm(
      `ATENCIÓN: ¿Está seguro de que desea eliminar el viaje ${id}?\n\nEsta acción eliminará el registro de la hoja de cálculo y no se puede deshacer.`
    );

    if (confirmed) {
      const success = await deleteTripInSheet(id);
      if (success) {
        alert('Registro eliminado correctamente. La tabla se actualizará al recargar.');
      } else {
        alert('Hubo un error al intentar eliminar el registro. Verifique su conexión.');
      }
    }
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setNewTrip({ estado: 'Pendiente', fecha: new Date().toISOString().split('T')[0] });
    setSuggestedKm(false);
  };

  const getClientName = (id: string): string =>
    clients.find((c) => c.id === id)?.nombreComercial ?? 'Desconocido';

  const calculateBenefit = (trip: Trip): string => {
    if (trip.kmRecorridos <= 0) {
      return '0';
    }
    const revenue = trip.tarifa * (trip.pesoKg / 1000);
    return (revenue / trip.kmRecorridos).toFixed(2);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div className="flex bg-slate-200 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setActiveTab('current')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
              activeTab === 'current' ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            En Tránsito
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('programmed')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
              activeTab === 'programmed' ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            Pendientes
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
              activeTab === 'all' ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            Historial
          </button>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="bg-blue-900 hover:bg-blue-800 text-white px-4 py-2 rounded-lg flex items-center shadow-lg transition-colors"
        >
          <Plus className="w-4 h-4 mr-2" /> Nuevo Viaje
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center text-sm font-semibold text-slate-700 mb-3">
          <Filter className="w-4 h-4 mr-2" /> Filtros Avanzados
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar ID Viaje..."
              className="w-full pl-9 p-2 bg-slate-50 border border-slate-300 rounded-lg text-sm outline-none focus:border-blue-500"
              value={filters.searchId}
              onChange={(e) => setFilters({ ...filters, searchId: e.target.value })}
            />
          </div>
          <select
            className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-sm outline-none focus:border-blue-500"
            value={filters.clientId}
            onChange={(e) => setFilters({ ...filters, clientId: e.target.value })}
          >
            <option value="">Todos los Clientes</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombreComercial}
              </option>
            ))}
          </select>
          <select
            className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-sm outline-none focus:border-blue-500"
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="">Todos los Estados</option>
            <option value="Pendiente">Pendiente</option>
            <option value="En Tránsito">En Tránsito</option>
            <option value="Completado">Completado</option>
            <option value="Cerrado">Cerrado</option>
          </select>
          <div className="flex items-center space-x-2 col-span-2">
            <input
              type="date"
              className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-sm outline-none"
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
            />
            <span className="text-slate-400">-</span>
            <input
              type="date"
              className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-sm outline-none"
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
            />
          </div>
        </div>
      </div>

      {showForm && (
        <div className="bg-white p-6 rounded-xl shadow-lg border border-slate-200 animate-fade-in-down">
          <div className="flex justify-between items-center mb-4 border-b pb-2">
            <h3 className="text-lg font-bold text-slate-800">
              {editingId ? 'Editar Viaje' : 'Registrar Nuevo Viaje'}
            </h3>
            <button type="button" onClick={closeForm} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <form
            onSubmit={handleSave}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
          >
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Cliente</label>
              <select
                required
                className="w-full border-slate-300 rounded-lg p-2 bg-slate-50 outline-none"
                value={newTrip.clientId || ''}
                onChange={(e) => setNewTrip({ ...newTrip, clientId: e.target.value })}
              >
                <option value="">Seleccionar Cliente...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombreComercial}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Fecha</label>
              <input
                type="date"
                required
                className="w-full border-slate-300 rounded-lg p-2 bg-slate-50 outline-none border"
                value={newTrip.fecha}
                onChange={(e) => setNewTrip({ ...newTrip, fecha: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Estado</label>
              <select
                className="w-full border-slate-300 rounded-lg p-2 bg-slate-50 outline-none border"
                value={newTrip.estado}
                onChange={(e) =>
                  setNewTrip({ ...newTrip, estado: e.target.value as TripStatus })
                }
              >
                <option value="Pendiente">Pendiente</option>
                <option value="En Tránsito">En Tránsito</option>
                <option value="Completado">Completado</option>
                <option value="Cerrado">Cerrado</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Producto</label>
              <input
                type="text"
                required
                className="w-full border-slate-300 rounded-lg p-2 bg-slate-50 outline-none border"
                value={newTrip.contenido}
                onChange={(e) => setNewTrip({ ...newTrip, contenido: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Origen</label>
              <input
                type="text"
                required
                className="w-full border-slate-300 rounded-lg p-2 bg-slate-50 outline-none border"
                value={newTrip.origen}
                onChange={(e) => setNewTrip({ ...newTrip, origen: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Destino</label>
              <input
                type="text"
                required
                className="w-full border-slate-300 rounded-lg p-2 bg-slate-50 outline-none border"
                value={newTrip.destino || ''}
                onChange={(e) => setNewTrip({ ...newTrip, destino: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 flex justify-between">
                <span>KM Recorridos</span>
                {suggestedKm && (
                  <span className="text-xs text-blue-600 flex items-center animate-pulse">
                    <Sparkles className="w-3 h-3 mr-1" /> Historial
                  </span>
                )}
              </label>
              <input
                type="number"
                required
                className={`w-full border rounded-lg p-2 outline-none transition-colors ${
                  suggestedKm
                    ? 'bg-blue-50 border-blue-300 text-blue-800 font-semibold'
                    : 'bg-slate-50 border-slate-300'
                }`}
                value={newTrip.kmRecorridos || ''}
                onChange={(e) => {
                  setNewTrip({ ...newTrip, kmRecorridos: Number(e.target.value) });
                  setSuggestedKm(false);
                }}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Peso (KG)</label>
              <input
                type="number"
                required
                className="w-full border-slate-300 rounded-lg p-2 bg-slate-50 outline-none border"
                value={newTrip.pesoKg || ''}
                onChange={(e) => setNewTrip({ ...newTrip, pesoKg: Number(e.target.value) })}
              />
            </div>

            {isAdmin && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Tarifa (USD/Ton)
                </label>
                <input
                  type="number"
                  required
                  className="w-full border-slate-300 rounded-lg p-2 bg-slate-50 outline-none border"
                  value={newTrip.tarifa || ''}
                  onChange={(e) => setNewTrip({ ...newTrip, tarifa: Number(e.target.value) })}
                />
              </div>
            )}

            <div className="md:col-span-2 lg:col-span-4 flex justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={closeForm}
                className="text-slate-500 hover:text-slate-700 font-medium"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium shadow-md"
              >
                {editingId ? 'Actualizar Viaje' : 'Guardar Viaje'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th className="p-4">ID / Fecha</th>
                <th className="p-4">Estado</th>
                <th className="p-4">Cliente / Carga</th>
                <th className="p-4">Ruta</th>
                {isAdmin && <th className="p-4 text-right">Métricas</th>}
                {isAdmin && <th className="p-4 text-right">Beneficio/KM</th>}
                {isAdmin && <th className="p-4 text-center">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTrips.map((trip) => (
                <tr key={trip.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4">
                    <div className="font-mono text-xs text-slate-500">{trip.id}</div>
                    <div className="flex items-center mt-1">
                      <Calendar className="w-3 h-3 mr-1 text-slate-400" /> {trip.fecha}
                    </div>
                  </td>
                  <td className="p-4">
                    <Badge status={trip.estado} />
                  </td>
                  <td className="p-4">
                    <div className="font-medium text-slate-800">{getClientName(trip.clientId)}</div>
                    <div className="flex items-center text-xs mt-1">
                      <Package className="w-3 h-3 mr-1 text-slate-400" /> {(trip.pesoKg / 1000).toFixed(1)}t{' '}
                      {trip.contenido}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center space-x-2 text-xs">
                      <span className="font-medium text-slate-700">{trip.origen}</span>
                      <ArrowRight className="w-3 h-3 text-slate-400" />
                      <span className="font-medium text-slate-700">{trip.destino}</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-1">{trip.kmRecorridos} km</div>
                  </td>
                  {isAdmin && (
                    <td className="p-4 text-right text-xs">
                      <div>
                        Tarifa: <span className="font-semibold">${trip.tarifa}/t</span>
                      </div>
                      <div className="text-slate-500">
                        Total: ${Math.round(trip.tarifa * (trip.pesoKg / 1000))}
                      </div>
                    </td>
                  )}
                  {isAdmin && (
                    <td className="p-4 text-right">
                      <div className="font-bold text-slate-800 flex items-center justify-end">
                        <DollarSign className="w-3 h-3 text-green-600" />
                        {calculateBenefit(trip)}
                      </div>
                    </td>
                  )}
                  {isAdmin && (
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(trip)}
                          className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-md transition-colors"
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(trip.id)}
                          className="p-1.5 text-red-500 hover:bg-red-100 rounded-md transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {filteredTrips.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 7 : 4} className="p-8 text-center text-slate-400 italic">
                    No se encontraron viajes.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
