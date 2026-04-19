import React, { useState } from 'react';
import type { Client, Trip } from '../../types';
import { Search, MapPin, Phone, ArrowRight, TrendingUp, Mail, Hash } from 'lucide-react';

interface ClientDirectoryProps {
  clients: Client[];
  trips: Trip[];
}

export const ClientDirectory: React.FC<ClientDirectoryProps> = ({ clients, trips }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  const filteredClients = clients.filter(
    (c) =>
      c.nombreComercial.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.departamento.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.rut !== undefined && c.rut.includes(searchTerm))
  );

  const clientTrips = selectedClient
    ? trips.filter((t) => t.clientId === selectedClient.id)
    : [];

  const totalRevenue = clientTrips.reduce((acc, t) => acc + t.tarifa * (t.pesoKg / 1000), 0);
  const totalKm = clientTrips.reduce((acc, t) => acc + t.kmRecorridos, 0);
  const avgProfitPerKm = totalKm > 0 ? totalRevenue / totalKm : 0;

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-140px)] gap-6">
      <div className="w-full lg:w-1/3 flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, RUT..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredClients.map((client) => (
            <div
              key={client.id}
              onClick={() => setSelectedClient(client)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  setSelectedClient(client);
                }
              }}
              role="button"
              tabIndex={0}
              className={`p-4 border-b border-slate-100 cursor-pointer transition-colors hover:bg-slate-50 ${
                selectedClient?.id === client.id ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''
              }`}
            >
              <div className="flex justify-between items-start">
                <h3 className="font-semibold text-slate-800">{client.nombreComercial}</h3>
                {client.rut && (
                  <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">
                    RUT: {client.rut}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1 flex items-center">
                <MapPin className="w-3 h-3 mr-1" /> {client.localidad}, {client.departamento}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="w-full lg:w-2/3 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
        {selectedClient ? (
          <div className="flex flex-col h-full">
            <div className="p-6 border-b border-slate-200 bg-slate-50">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">{selectedClient.nombreComercial}</h2>
                  <div className="flex items-center text-sm text-slate-500 mt-1 font-mono">
                    <Hash className="w-3 h-3 mr-1" /> RUT: {selectedClient.rut ?? 'S/D'}
                  </div>

                  <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-slate-600">
                    <span className="flex items-center">
                      <MapPin className="w-4 h-4 mr-1 text-slate-400" /> {selectedClient.localidad},{' '}
                      {selectedClient.departamento}
                    </span>
                    <span className="flex items-center">
                      <Mail className="w-4 h-4 mr-1 text-slate-400" /> {selectedClient.email ?? '—'}
                    </span>
                    <span className="flex items-center">
                      <Phone className="w-4 h-4 mr-1 text-slate-400" /> {selectedClient.telefono ?? '—'}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500 uppercase font-semibold">Beneficio Promedio</div>
                  <div className="text-xl font-bold text-blue-700 flex items-center justify-end">
                    <TrendingUp className="w-4 h-4 mr-1" />${avgProfitPerKm.toFixed(2)} /km
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-0">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="p-4">Fecha</th>
                    <th className="p-4">Ruta</th>
                    <th className="p-4">Carga</th>
                    <th className="p-4 text-right">Tarifa</th>
                    <th className="p-4 text-right">KM</th>
                    <th className="p-4 text-right font-bold text-blue-800">Ben./KM</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {clientTrips.map((trip) => {
                    const revenue = trip.tarifa * (trip.pesoKg / 1000);
                    const benefit = trip.kmRecorridos > 0 ? revenue / trip.kmRecorridos : 0;
                    return (
                      <tr key={trip.id} className="hover:bg-slate-50">
                        <td className="p-4 text-xs font-mono">{trip.fecha}</td>
                        <td className="p-4">
                          <div className="flex items-center space-x-1 text-xs">
                            <span>{trip.origen}</span>
                            <ArrowRight className="w-3 h-3 text-slate-400" />
                            <span>{trip.destino}</span>
                          </div>
                        </td>
                        <td className="p-4">
                          {trip.contenido}{' '}
                          <span className="text-xs text-slate-400">
                            ({(trip.pesoKg / 1000).toFixed(1)}t)
                          </span>
                        </td>
                        <td className="p-4 text-right">${trip.tarifa}/t</td>
                        <td className="p-4 text-right">{trip.kmRecorridos}</td>
                        <td className="p-4 text-right font-semibold text-slate-800">${benefit.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                  {clientTrips.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400">
                        No hay historial de viajes.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <Search className="w-12 h-12 mb-4 opacity-50" />
            <p>Seleccione un cliente para ver su historial y rentabilidad.</p>
          </div>
        )}
      </div>
    </div>
  );
};
