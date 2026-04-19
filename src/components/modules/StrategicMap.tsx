import React, { Suspense, useMemo, useState, useCallback, lazy } from 'react';
import type { Client, Trip } from '../../types';
import { DEPARTAMENTOS } from '../../constants';
import { Filter, MapPin, Menu, X, Truck, ChevronRight } from 'lucide-react';

const StrategicMapCanvas = lazy(() => import('./StrategicMapCanvas'));

interface StrategicMapProps {
  clients: Client[];
  trips: Trip[];
}

function getClientName(clients: Client[], id: string): string {
  return clients.find((c) => c.id === id)?.nombreComercial ?? 'Cliente';
}

function isActiveTrip(t: Trip): boolean {
  return t.estado === 'Pendiente' || t.estado === 'En Tránsito';
}

const MapFallback: React.FC = () => (
  <div className="flex h-full min-h-[320px] w-full animate-pulse flex-col rounded-xl bg-slate-200/80">
    <div className="m-4 h-8 w-40 rounded bg-slate-300/90" />
    <div className="mx-4 flex flex-1 items-center justify-center rounded-lg bg-slate-300/50">
      <p className="text-sm font-medium text-slate-600">Cargando mapa…</p>
    </div>
  </div>
);

export const StrategicMap: React.FC<StrategicMapProps> = ({ clients, trips }) => {
  const [selectedDept, setSelectedDept] = useState('Todos');
  const [selectedClient, setSelectedClient] = useState('Todos');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number } | null>(null);
  const [flyToken, setFlyToken] = useState(0);

  const filteredClients = useMemo(
    () =>
      clients.filter((c) => {
        if (selectedDept !== 'Todos' && c.departamento !== selectedDept) {
          return false;
        }
        if (selectedClient !== 'Todos' && c.id !== selectedClient) {
          return false;
        }
        return true;
      }),
    [clients, selectedDept, selectedClient]
  );

  const activeTrips = useMemo(() => trips.filter(isActiveTrip), [trips]);

  const focusOnTripDestination = useCallback(
    (trip: Trip) => {
      const client = clients.find((c) => c.id === trip.clientId);
      if (!client) {
        return;
      }
      setFlyTarget({ lat: client.latitud, lng: client.longitud });
      setFlyToken((k) => k + 1);
      setDrawerOpen(false);
    },
    [clients]
  );

  const tripPanel = (
    <div className="flex h-full flex-col border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Viajes activos</h2>
        <p className="mt-2 text-2xl font-bold text-slate-900">{activeTrips.length}</p>
        <p className="text-xs text-slate-500">
          {filteredClients.length} cliente{filteredClients.length === 1 ? '' : 's'} en mapa
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {activeTrips.length === 0 ? (
          <p className="p-3 text-sm text-slate-500">No hay viajes activos.</p>
        ) : (
          <ul className="space-y-1">
            {activeTrips.map((trip) => (
              <li key={trip.id}>
                <button
                  type="button"
                  onClick={() => focusOnTripDestination(trip)}
                  className="flex w-full items-start gap-2 rounded-lg border border-transparent p-3 text-left text-sm transition hover:border-slate-200 hover:bg-slate-50"
                >
                  <Truck className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[10px] text-slate-400">{trip.id}</p>
                    <p className="font-medium text-slate-800">
                      {trip.origen}
                      <ChevronRight className="mx-1 inline h-3 w-3 text-slate-400" />
                      {trip.destino}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {getClientName(clients, trip.clientId)} · {trip.estado}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-120px)] min-h-[480px] flex-col gap-4 lg:flex-row lg:gap-0">
      <div className="flex flex-1 flex-col space-y-3 lg:pr-4">
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-center font-medium text-slate-700">
            <Filter className="mr-2 h-4 w-4 text-slate-500" />
            <span className="text-sm">Filtros</span>
          </div>
          <select
            className="rounded-lg border border-slate-300 bg-slate-50 p-2 text-sm text-slate-900 outline-none"
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
          >
            <option value="Todos">Todos los departamentos</option>
            {DEPARTAMENTOS.map((dep) => (
              <option key={dep} value={dep}>
                {dep}
              </option>
            ))}
          </select>
          <select
            className="max-w-[220px] rounded-lg border border-slate-300 bg-slate-50 p-2 text-sm text-slate-900 outline-none"
            value={selectedClient}
            onChange={(e) => setSelectedClient(e.target.value)}
          >
            <option value="Todos">Todos los clientes</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombreComercial}
              </option>
            ))}
          </select>
          <span className="ml-auto text-xs text-slate-500">
            {activeTrips.length} viajes activos · {filteredClients.length} en mapa
          </span>
        </div>

        <div className="relative min-h-[320px] flex-1 overflow-hidden rounded-xl border border-slate-300 shadow-lg lg:min-h-0">
          <Suspense fallback={<MapFallback />}>
            <StrategicMapCanvas
              clients={filteredClients}
              trips={trips}
              flyTarget={flyTarget}
              flyToken={flyToken}
            />
          </Suspense>

          <button
            type="button"
            className="absolute bottom-4 right-4 z-[400] flex items-center gap-2 rounded-full bg-blue-900 px-4 py-3 text-sm font-semibold text-white shadow-lg lg:hidden"
            onClick={() => setDrawerOpen(true)}
          >
            <Menu className="h-4 w-4" />
            Viajes
          </button>
        </div>
      </div>

      <aside className="hidden h-full w-80 shrink-0 flex-col border-slate-200 pl-0 lg:flex lg:border-l lg:pl-4">
        {tripPanel}
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-[500] lg:hidden" role="presentation">
          <button
            type="button"
            aria-label="Cerrar panel"
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <MapPin className="h-4 w-4 text-blue-600" />
                Panel de viajes
              </span>
              <button
                type="button"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                onClick={() => setDrawerOpen(false)}
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden bg-white">{tripPanel}</div>
          </div>
        </div>
      )}
    </div>
  );
};
