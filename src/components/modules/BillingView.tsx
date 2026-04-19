import React, { useState } from 'react';
import type { Trip, Client } from '../../types';
import { uploadInvoice } from '../../services/api';
import {
  UploadCloud,
  CheckCircle,
  Loader2,
  ExternalLink,
  Calendar,
  Search,
  X,
} from 'lucide-react';

interface BillingViewProps {
  trips: Trip[];
  clients: Client[];
  onInvoiceUploaded: (tripId: string, url: string) => void;
}

export const BillingView: React.FC<BillingViewProps> = ({
  trips,
  clients,
  onInvoiceUploaded,
}) => {
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pending' | 'closed'>('pending');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [filters, setFilters] = useState({
    dateStart: '',
    dateEnd: '',
    clientId: '',
    searchId: '',
  });

  const visibleTrips = trips.filter((t) => {
    if (activeTab === 'pending' && t.estado !== 'Completado') {
      return false;
    }
    if (activeTab === 'closed' && t.estado !== 'Cerrado') {
      return false;
    }

    const client = clients.find((c) => c.id === t.clientId);
    const rutMatch = client?.rut?.includes(filters.searchId) ?? false;

    if (
      filters.searchId &&
      !t.id.toLowerCase().includes(filters.searchId.toLowerCase()) &&
      !rutMatch
    ) {
      return false;
    }
    if (filters.clientId && t.clientId !== filters.clientId) {
      return false;
    }
    if (filters.dateStart && t.fecha < filters.dateStart) {
      return false;
    }
    if (filters.dateEnd && t.fecha > filters.dateEnd) {
      return false;
    }

    return true;
  });

  const handleFileUpload = async (trip: Trip, e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) {
      return;
    }

    const file = e.target.files[0];
    const clientName =
      clients.find((c) => c.id === trip.clientId)?.nombreComercial ?? 'Unknown';

    setUploadingId(trip.id);

    try {
      const url = await uploadInvoice(trip.id, clientName, file);
      if (url) {
        onInvoiceUploaded(trip.id, url);
      }
    } catch (error) {
      console.error(error);
      alert('Error al subir la factura. Intente nuevamente.');
    } finally {
      setUploadingId(null);
    }
  };

  const handleViewInvoice = (url: string) => {
    const embedUrl = url.includes('/view') ? url.replace('/view', '/preview') : url;
    setPreviewUrl(embedUrl);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-800 mb-1">Módulo de Facturación</h2>
            <p className="text-slate-500 text-sm">Auditoría y carga de comprobantes fiscales.</p>
          </div>
          <div className="flex space-x-2 mt-4 md:mt-0">
            <button
              type="button"
              onClick={() => setActiveTab('pending')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'pending'
                  ? 'bg-orange-100 text-orange-700 border border-orange-200'
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              Pendientes
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('closed')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'closed'
                  ? 'bg-green-100 text-green-700 border border-green-200'
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              Cerrados
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar ID Viaje o RUT..."
              className="w-full pl-9 p-2 bg-slate-50 border border-slate-300 rounded-lg text-sm outline-none"
              value={filters.searchId}
              onChange={(e) => setFilters({ ...filters, searchId: e.target.value })}
            />
          </div>
          <select
            className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-sm outline-none"
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
          <div className="flex items-center space-x-2 col-span-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input
              type="date"
              className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-sm outline-none"
              value={filters.dateStart}
              onChange={(e) => setFilters({ ...filters, dateStart: e.target.value })}
            />
            <span className="text-slate-400">-</span>
            <input
              type="date"
              className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-sm outline-none"
              value={filters.dateEnd}
              onChange={(e) => setFilters({ ...filters, dateEnd: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
            <tr>
              <th className="p-4">ID / Estado</th>
              <th className="p-4">Fecha</th>
              <th className="p-4">Cliente (RUT)</th>
              <th className="p-4">Detalle Carga</th>
              <th className="p-4 text-right">Monto Total</th>
              <th className="p-4 text-center">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleTrips.map((trip) => {
              const client = clients.find((c) => c.id === trip.clientId);
              const clientName = client?.nombreComercial ?? 'Desconocido';
              const clientRut = client?.rut ?? 'S/D';
              const totalAmount = trip.tarifa * (trip.pesoKg / 1000);

              return (
                <tr key={trip.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4">
                    <div className="font-mono text-slate-500">{trip.id}</div>
                    {trip.estado === 'Cerrado' && (
                      <div className="flex items-center text-xs text-green-600 mt-1 font-medium">
                        <CheckCircle className="w-3 h-3 mr-1" /> Cerrado
                      </div>
                    )}
                  </td>
                  <td className="p-4">{trip.fecha}</td>
                  <td className="p-4">
                    <div className="font-medium text-slate-800">{clientName}</div>
                    <div className="text-xs text-slate-400 font-mono mt-0.5">RUT: {clientRut}</div>
                  </td>
                  <td className="p-4">
                    <span className="block text-slate-800">{trip.contenido}</span>
                    <span className="text-xs text-slate-400">
                      {(trip.pesoKg / 1000).toFixed(1)} tons - {trip.origen} &rarr; {trip.destino}
                    </span>
                  </td>
                  <td className="p-4 text-right font-bold text-slate-800">
                    ${totalAmount.toLocaleString()}
                  </td>
                  <td className="p-4 text-center">
                    {trip.estado === 'Cerrado' ? (
                      <button
                        type="button"
                        onClick={() => trip.facturaUrl && handleViewInvoice(trip.facturaUrl)}
                        className="inline-flex items-center px-4 py-2 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg transition-colors text-xs font-medium border border-green-200"
                      >
                        <ExternalLink className="w-3 h-3 mr-2" /> Ver Factura
                      </button>
                    ) : uploadingId === trip.id ? (
                      <button
                        type="button"
                        disabled
                        className="inline-flex items-center px-4 py-2 bg-blue-100 text-blue-700 rounded-lg cursor-wait text-xs font-medium"
                      >
                        <Loader2 className="w-3 h-3 mr-2 animate-spin" /> Subiendo...
                      </button>
                    ) : (
                      <div className="relative inline-block">
                        <input
                          type="file"
                          accept=".pdf,image/*"
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          onChange={(ev) => void handleFileUpload(trip, ev)}
                        />
                        <button
                          type="button"
                          className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-sm text-xs font-medium"
                        >
                          <UploadCloud className="w-3 h-3 mr-2" /> Cargar
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {visibleTrips.length === 0 && (
              <tr>
                <td colSpan={6} className="p-12 text-center">
                  <div className="flex flex-col items-center justify-center text-slate-400">
                    <CheckCircle className="w-12 h-12 mb-4 text-slate-300" />
                    <p className="text-lg font-medium text-slate-600">Sin registros</p>
                    <p className="text-sm">No hay viajes que coincidan con los filtros.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden animate-fade-in-up">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center">
                <ExternalLink className="w-4 h-4 mr-2" /> Vista Previa de Factura
              </h3>
              <button
                type="button"
                onClick={() => setPreviewUrl(null)}
                className="p-1 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X className="w-6 h-6 text-slate-500" />
              </button>
            </div>
            <div className="flex-1 bg-slate-100 relative">
              <iframe src={previewUrl} className="w-full h-full" title="Invoice Preview" />
              <div className="absolute bottom-4 left-0 right-0 text-center pointer-events-none">
                <span className="bg-slate-800 text-white text-xs px-3 py-1 rounded-full opacity-75">
                  ¿No carga?{' '}
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline pointer-events-auto"
                  >
                    Abrir en nueva pestaña
                  </a>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
