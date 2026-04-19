import React, { useMemo, useState } from 'react';
import type { Client, Trip } from '../../types';
import { Modal } from '../ui/Modal';
import { Search, MapPin, Phone, Mail, Hash, Truck, ArrowRight } from 'lucide-react';

interface ClientDirectoryProps {
  clients: Client[];
  trips: Trip[];
}

function tripRevenue(t: Trip): number {
  return t.tarifa * (t.pesoKg / 1000);
}

export const ClientDirectory: React.FC<ClientDirectoryProps> = ({ clients, trips }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [detailClient, setDetailClient] = useState<Client | null>(null);

  const statsByClient = useMemo(() => {
    const m = new Map<string, { count: number; revenue: number }>();
    clients.forEach((c) => m.set(c.id, { count: 0, revenue: 0 }));
    trips.forEach((t) => {
      const cur = m.get(t.clientId) ?? { count: 0, revenue: 0 };
      cur.count += 1;
      cur.revenue += tripRevenue(t);
      m.set(t.clientId, cur);
    });
    return m;
  }, [clients, trips]);

  const filteredClients = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const rutDigits = searchTerm.replace(/\D/g, '');
    return clients.filter((c) => {
      if (!q && !rutDigits) {
        return true;
      }
      return (
        (q && c.nombreComercial.toLowerCase().includes(q)) ||
        (q && c.departamento.toLowerCase().includes(q)) ||
        (q && c.localidad.toLowerCase().includes(q)) ||
        (rutDigits.length > 0 && (c.rut?.includes(rutDigits) ?? false))
      );
    });
  }, [clients, searchTerm]);

  const clientTripsDetail = useMemo(
    () => (detailClient ? trips.filter((t) => t.clientId === detailClient.id) : []),
    [detailClient, trips]
  );

  const detailRevenue = useMemo(
    () => clientTripsDetail.reduce((s, t) => s + tripRevenue(t), 0),
    [clientTripsDetail]
  );
  const detailKm = useMemo(
    () => clientTripsDetail.reduce((s, t) => s + t.kmRecorridos, 0),
    [clientTripsDetail]
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Directorio de clientes</h1>
        <p className="text-sm text-slate-500">Buscá por nombre, departamento o localidad.</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          type="text"
          placeholder="Nombre, departamento, localidad…"
          className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm outline-none focus:border-blue-500"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="hidden gap-4 md:grid md:grid-cols-2 lg:grid-cols-3">
        {filteredClients.map((client) => {
          const st = statsByClient.get(client.id) ?? { count: 0, revenue: 0 };
          return (
            <button
              key={client.id}
              type="button"
              onClick={() => setDetailClient(client)}
              className="rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md"
            >
              <h3 className="font-semibold text-slate-900">{client.nombreComercial}</h3>
              <p className="mt-2 flex items-center text-xs text-slate-500">
                <MapPin className="mr-1 h-3 w-3 shrink-0" />
                {client.localidad}, {client.departamento}
              </p>
              <div className="mt-4 flex justify-between border-t border-slate-100 pt-3 text-xs">
                <span className="text-slate-500">
                  Viajes: <strong className="text-slate-800">{st.count}</strong>
                </span>
                <span className="font-medium text-emerald-700">
                  {st.revenue.toLocaleString('es-UY', { style: 'currency', currency: 'USD' })}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <ul className="space-y-3 md:hidden">
        {filteredClients.map((client) => {
          const st = statsByClient.get(client.id) ?? { count: 0, revenue: 0 };
          return (
            <li key={client.id}>
              <button
                type="button"
                onClick={() => setDetailClient(client)}
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm"
              >
                <div>
                  <p className="font-semibold text-slate-900">{client.nombreComercial}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {client.localidad}, {client.departamento}
                  </p>
                </div>
                <div className="text-right text-xs">
                  <p className="text-slate-500">{st.count} viajes</p>
                  <p className="font-medium text-emerald-700">
                    {st.revenue.toLocaleString('es-UY', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {filteredClients.length === 0 && (
        <p className="py-12 text-center text-sm text-slate-500">No hay clientes que coincidan con la búsqueda.</p>
      )}

      <Modal
        open={!!detailClient}
        onClose={() => setDetailClient(null)}
        title={detailClient?.nombreComercial ?? 'Cliente'}
        size="lg"
      >
        {detailClient && (
          <div className="space-y-4 text-sm text-slate-600">
            <div className="grid gap-3 sm:grid-cols-2">
              <p className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-slate-400" />
                <span className="font-mono text-slate-800">{detailClient.rut ?? '—'}</span>
              </p>
              <p className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-slate-400" />
                {detailClient.email ?? '—'}
              </p>
              <p className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-slate-400" />
                {detailClient.telefono ?? '—'}
              </p>
              <p className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-slate-400" />
                {detailClient.localidad}, {detailClient.departamento}
              </p>
              <p className="sm:col-span-2">
                <span className="text-slate-500">Coordenadas:</span>{' '}
                <span className="font-mono text-slate-800">
                  {detailClient.latitud}, {detailClient.longitud}
                </span>
              </p>
            </div>
            <div className="flex flex-wrap gap-4 rounded-lg bg-slate-50 p-4">
              <div>
                <p className="text-xs uppercase text-slate-500">Viajes</p>
                <p className="text-lg font-bold text-slate-900">{clientTripsDetail.length}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">Ingresos totales</p>
                <p className="text-lg font-bold text-emerald-700">
                  {detailRevenue.toLocaleString('es-UY', { style: 'currency', currency: 'USD' })}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">KM acumulados</p>
                <p className="text-lg font-bold text-slate-900">{detailKm.toLocaleString('es-UY')}</p>
              </div>
            </div>
            <div>
              <h4 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                <Truck className="h-4 w-4" />
                Historial de viajes
              </h4>
              <div className="max-h-56 overflow-y-auto overflow-x-auto rounded-lg border border-[var(--border)] shadow-[var(--shadow-sm)]">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 z-[1]" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                    <tr className="border-b border-[var(--border)]">
                      <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                        Fecha
                      </th>
                      <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                        Ruta
                      </th>
                      <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                        Ingreso
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                    {clientTripsDetail.map((trip, i) => (
                      <tr
                        key={trip.id}
                        style={{
                          backgroundColor: i % 2 === 0 ? 'var(--bg-table-row)' : 'var(--bg-table-alt)',
                        }}
                        className="hover:bg-[var(--bg-table-hover)] transition-colors duration-100"
                      >
                        <td className="px-4 py-3 font-mono text-[var(--text-muted)]">{trip.fecha}</td>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-1 text-[var(--text-primary)]">
                            {trip.origen}
                            <ArrowRight className="h-3 w-3 shrink-0 text-[var(--text-muted)]" aria-hidden />
                            {trip.destino}
                          </span>
                          <span className="text-[var(--text-secondary)]">{trip.contenido}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-[var(--text-primary)]">
                          {tripRevenue(trip).toLocaleString('es-UY', {
                            style: 'currency',
                            currency: 'USD',
                            maximumFractionDigits: 0,
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {clientTripsDetail.length === 0 && (
                  <p className="p-4 text-center text-slate-400">Sin viajes registrados.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
