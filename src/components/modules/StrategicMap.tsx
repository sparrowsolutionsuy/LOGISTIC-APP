import React, { Suspense, useMemo, useState, useCallback, lazy } from 'react';
import type { Client, Trip } from '../../types';
import { DEPARTAMENTOS } from '../../constants';
import {
  Filter,
  MapPin,
  Menu,
  X,
  Truck,
  ChevronRight,
  Search,
  Users,
  RotateCcw,
  Loader2,
  Sparkles,
  Phone,
  Mail,
} from 'lucide-react';
import Badge from '../ui/Badge';
import { Modal } from '../ui/Modal';

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

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface ReturnSuggestion {
  client: Client;
  distanceKm: number;
  justification: string;
  priority: 'alta' | 'media' | 'baja';
}

const SidebarSection: React.FC<{
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
  icon: React.ReactNode;
}> = ({ title, count, defaultOpen = true, children, icon }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-[var(--border)] last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[var(--bg-elevated)]"
      >
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
          {icon}
          {title}
          {count !== undefined && (
            <span className="rounded-full bg-[var(--accent-blue)] px-1.5 py-0.5 text-[10px] font-bold text-white">
              {count}
            </span>
          )}
        </span>
        <ChevronRight
          size={14}
          className={`text-[var(--text-muted)] transition-transform ${open ? 'rotate-90' : ''}`}
          aria-hidden
        />
      </button>
      {open ? <div className="px-3 pb-3">{children}</div> : null}
    </div>
  );
};

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

  const [clientSearch, setClientSearch] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const [returnLoading, setReturnLoading] = useState<string | null>(null);
  const [returnModal, setReturnModal] = useState<{
    trip: Trip;
    suggestions: ReturnSuggestion[];
    resumen: string;
  } | null>(null);

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

  const filteredClientList = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) {
      return clients;
    }
    return clients.filter(
      (c) =>
        c.nombreComercial.toLowerCase().includes(q) ||
        c.localidad.toLowerCase().includes(q) ||
        c.departamento.toLowerCase().includes(q)
    );
  }, [clients, clientSearch]);

  const activeTrips = useMemo(() => trips.filter(isActiveTrip), [trips]);

  const activeTripsToClient = useCallback(
    (clientId: string) =>
      trips.filter(
        (t) =>
          t.clientId === clientId && (t.estado === 'Pendiente' || t.estado === 'En Tránsito')
      ).length,
    [trips]
  );

  const handleFocusClient = useCallback((client: Client) => {
    setSelectedClientId(client.id);
    setFlyTarget({ lat: client.latitud, lng: client.longitud });
    setFlyToken((k) => k + 1);
  }, []);

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

  const handleSuggestReturn = useCallback(
    async (trip: Trip) => {
      setReturnLoading(trip.id);

      try {
        const tripClient = clients.find((c) => c.id === trip.clientId);
        if (!tripClient) {
          setReturnLoading(null);
          return;
        }

        const clientsWithDistance = clients
          .filter((c) => c.id !== trip.clientId)
          .map((c) => ({
            client: c,
            distanceKm: Math.round(
              haversineKm(tripClient.latitud, tripClient.longitud, c.latitud, c.longitud)
            ),
          }))
          .sort((a, b) => a.distanceKm - b.distanceKm)
          .slice(0, 8);

        const nearbyContext = clientsWithDistance.map(({ client, distanceKm }) => ({
          id: client.id,
          nombre: client.nombreComercial,
          localidad: client.localidad,
          departamento: client.departamento,
          distanciaKm: distanceKm,
          viajesPrevios: trips.filter((t) => t.clientId === client.id && t.estado === 'Completado')
            .length,
          ultimoViaje:
            [...trips]
              .filter((t) => t.clientId === client.id)
              .sort((a, b) => b.fecha.localeCompare(a.fecha))[0]?.fecha ?? null,
        }));

        const prompt = `Sos coordinador logístico de GDC, empresa de transporte de carga pesada en Uruguay.

Un camión está realizando el siguiente viaje:
- ID: ${trip.id}
- Origen: ${trip.origen}
- Destino: ${trip.destino} (donde descargará)
- Contenido: ${trip.contenido}
- Peso: ${trip.pesoKg} kg

Al terminar la descarga en ${trip.destino}, el camión quedará disponible en esa zona.

Los siguientes clientes se encuentran cercanos al punto de descarga:
${JSON.stringify(nearbyContext, null, 2)}

Analizá cuáles clientes tienen mayor potencial para coordinar un viaje de retorno (volver cargado en lugar de vacío). Considerá: distancia, historial de viajes previos, y lógica operativa de transporte de carga en Uruguay.

Respondé SOLO con JSON válido sin markdown:
{
  "sugerencias": [
    {
      "clientId": "string",
      "prioridad": "alta|media|baja",
      "justificacion": "1-2 oraciones explicando por qué este cliente es buena opción para retorno"
    }
  ],
  "resumen": "1 oración resumiendo la situación y la mejor oportunidad de retorno"
}`;

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1000,
            messages: [{ role: 'user', content: prompt }],
          }),
        });

        if (!response.ok) {
          throw new Error(`Anthropic HTTP ${response.status}`);
        }

        const data: unknown = await response.json();
        const record = data as {
          content?: Array<{ type?: string; text?: string }>;
        };
        const text =
          record.content?.map((i) => (i.type === 'text' && i.text ? i.text : '')).join('') ?? '';
        const cleaned = text.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(cleaned) as {
          sugerencias?: Array<{ clientId: string; prioridad: string; justificacion: string }>;
          resumen?: string;
        };

        const normPriority = (p: string): 'alta' | 'media' | 'baja' => {
          const x = String(p).toLowerCase();
          if (x === 'alta' || x === 'media' || x === 'baja') {
            return x;
          }
          return 'media';
        };

        const suggestions: ReturnSuggestion[] = (parsed.sugerencias ?? [])
          .slice(0, 5)
          .map((s) => {
            const clientData = clientsWithDistance.find((c) => c.client.id === s.clientId);
            if (!clientData) {
              return null;
            }
            return {
              client: clientData.client,
              distanceKm: clientData.distanceKm,
              justification: s.justificacion,
              priority: normPriority(s.prioridad),
            };
          })
          .filter((x): x is ReturnSuggestion => x !== null);

        setReturnModal({ trip, suggestions, resumen: parsed.resumen ?? '' });
      } catch (err) {
        console.error('[ReturnSuggest] Error:', err);
        const tripClient = clients.find((c) => c.id === trip.clientId);
        if (tripClient) {
          const fallbackSuggestions: ReturnSuggestion[] = clients
            .filter((c) => c.id !== trip.clientId)
            .map((c) => ({
              client: c,
              distanceKm: Math.round(
                haversineKm(tripClient.latitud, tripClient.longitud, c.latitud, c.longitud)
              ),
              justification: 'Cliente cercano al punto de descarga.',
              priority: 'media' as const,
            }))
            .sort((a, b) => a.distanceKm - b.distanceKm)
            .slice(0, 5);
          setReturnModal({ trip, suggestions: fallbackSuggestions, resumen: '' });
        }
      } finally {
        setReturnLoading(null);
      }
    },
    [clients, trips]
  );

  const tripPanel = (
    <div className="flex h-full flex-col border-[var(--border)] bg-[var(--bg-surface)]">
      <div className="border-b border-[var(--border)] p-4">
        <h2 className="text-sm font-bold text-[var(--text-primary)]">Panel operativo</h2>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          {activeTrips.length} viaje{activeTrips.length !== 1 ? 's' : ''} activo
          {activeTrips.length !== 1 ? 's' : ''} · {clients.length} clientes
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <SidebarSection title="Clientes" count={clients.length} icon={<Users size={12} />} defaultOpen>
          <div className="relative mb-2">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
              aria-hidden
            />
            <input
              type="search"
              placeholder="Buscar cliente, localidad, departamento…"
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] py-2 pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-blue)] focus:ring-1 focus:ring-[var(--accent-blue)]"
            />
          </div>
          <div className="max-h-60 space-y-1.5 overflow-y-auto pr-0.5">
            {filteredClientList.map((client) => {
              const nActive = activeTripsToClient(client.id);
              return (
                <button
                  type="button"
                  key={client.id}
                  onClick={() => handleFocusClient(client)}
                  className={`w-full rounded-lg border p-3 text-left text-sm transition-all ${
                    selectedClientId === client.id
                      ? 'border-[var(--accent-blue)] bg-[var(--accent-blue-muted)]'
                      : 'border-transparent hover:border-[var(--border)] hover:bg-[var(--bg-elevated)]'
                  }`}
                >
                  <p className="truncate font-semibold text-[var(--text-primary)]">
                    {client.nombreComercial}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-[var(--text-muted)]">
                    <MapPin size={10} aria-hidden />
                    {client.localidad}, {client.departamento}
                  </p>
                  {nActive > 0 && (
                    <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--accent-emerald)]">
                      <Truck size={10} aria-hidden />
                      {nActive} viaje{nActive > 1 ? 's' : ''} activo{nActive > 1 ? 's' : ''}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </SidebarSection>

        <SidebarSection title="Viajes activos" count={activeTrips.length} icon={<Truck size={12} />} defaultOpen>
          <div className="max-h-72 space-y-2 overflow-y-auto pr-0.5">
            {activeTrips.length === 0 ? (
              <p className="py-2 text-center text-sm text-[var(--text-muted)]">No hay viajes activos.</p>
            ) : (
              activeTrips.map((trip) => (
                <div
                  key={trip.id}
                  className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[10px] text-[var(--text-muted)]">{trip.id}</p>
                      <p className="truncate text-xs font-semibold text-[var(--text-primary)]">
                        {getClientName(clients, trip.clientId)}
                      </p>
                      <p className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                        <span>{trip.origen}</span>
                        <ChevronRight size={10} className="text-[var(--text-muted)]" aria-hidden />
                        <span className="font-medium text-[var(--text-primary)]">{trip.destino}</span>
                      </p>
                    </div>
                    <Badge status={trip.estado} size="sm" />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => focusOnTripDestination(trip)}
                      className="flex flex-1 items-center justify-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-[10px] font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                    >
                      <MapPin size={10} aria-hidden />
                      Ver en mapa
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSuggestReturn(trip)}
                      disabled={returnLoading === trip.id}
                      className="flex flex-1 items-center justify-center gap-1 rounded-md bg-[var(--accent-blue)] px-2 py-1.5 text-[10px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {returnLoading === trip.id ? (
                        <Loader2 size={10} className="animate-spin" aria-hidden />
                      ) : (
                        <RotateCcw size={10} aria-hidden />
                      )}
                      Sugerir retorno
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </SidebarSection>
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
              selectedClientId={selectedClientId}
            />
          </Suspense>

          <button
            type="button"
            className="absolute bottom-4 right-4 z-[400] flex items-center gap-2 rounded-full bg-blue-900 px-4 py-3 text-sm font-semibold text-white shadow-lg lg:hidden"
            onClick={() => setDrawerOpen(true)}
          >
            <Menu className="h-4 w-4" />
            Panel
          </button>
        </div>
      </div>

      <aside className="hidden h-full w-80 shrink-0 flex-col border-[var(--border)] lg:flex lg:border-l lg:pl-4">
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
            <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                <MapPin className="h-4 w-4 text-[var(--accent-blue)]" aria-hidden />
                Panel operativo
              </span>
              <button
                type="button"
                className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]"
                onClick={() => setDrawerOpen(false)}
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden bg-[var(--bg-surface)]">{tripPanel}</div>
          </div>
        </div>
      )}

      <Modal
        open={returnModal !== null}
        onClose={() => setReturnModal(null)}
        title={`Sugerencias de retorno — ${returnModal?.trip.id ?? ''}`}
        size="lg"
      >
        {returnModal ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-sm">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Viaje en curso
              </p>
              <p className="text-[var(--text-primary)]">
                <span className="font-medium">{getClientName(clients, returnModal.trip.clientId)}</span>
                {' · '}
                <span>{returnModal.trip.origen}</span>
                <ChevronRight size={12} className="mx-1 inline text-[var(--text-muted)]" aria-hidden />
                <span className="font-semibold">{returnModal.trip.destino}</span>
              </p>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                El camión quedará disponible en:{' '}
                <strong className="text-[var(--text-primary)]">{returnModal.trip.destino}</strong>
              </p>
            </div>

            {returnModal.resumen ? (
              <div className="flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--accent-blue)_30%,transparent)] bg-[var(--accent-blue-muted)] p-3">
                <Sparkles size={14} className="mt-0.5 shrink-0 text-[var(--accent-blue)]" aria-hidden />
                <p className="text-sm text-[var(--text-primary)]">{returnModal.resumen}</p>
              </div>
            ) : null}

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Clientes sugeridos para retorno
              </p>

              {returnModal.suggestions.map((suggestion) => {
                const priorityConfig = {
                  alta: {
                    color: 'var(--accent-emerald)',
                    label: 'Prioridad alta',
                    bg: 'color-mix(in_srgb,var(--accent-emerald)_12%,transparent)',
                  },
                  media: {
                    color: 'var(--accent-amber)',
                    label: 'Prioridad media',
                    bg: 'color-mix(in_srgb,var(--accent-amber)_12%,transparent)',
                  },
                  baja: {
                    color: 'var(--text-muted)',
                    label: 'Prioridad baja',
                    bg: 'var(--bg-elevated)',
                  },
                }[suggestion.priority];

                return (
                  <div
                    key={suggestion.client.id}
                    className="rounded-lg border p-3"
                    style={{
                      borderColor: `color-mix(in_srgb,${priorityConfig.color} 35%,transparent)`,
                      backgroundColor: priorityConfig.bg,
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-[var(--text-primary)]">
                            {suggestion.client.nombreComercial}
                          </p>
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                            style={{
                              color: priorityConfig.color,
                              backgroundColor: `color-mix(in_srgb,${priorityConfig.color} 15%,transparent)`,
                            }}
                          >
                            {priorityConfig.label}
                          </span>
                        </div>
                        <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-[var(--text-muted)]">
                          <MapPin size={10} aria-hidden />
                          {suggestion.client.localidad}, {suggestion.client.departamento}
                          <span className="mx-1">·</span>
                          <span className="font-mono font-medium" style={{ color: 'var(--accent-blue)' }}>
                            ~{suggestion.distanceKm} km del punto de descarga
                          </span>
                        </p>
                        <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">
                          {suggestion.justification}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setFlyTarget({
                            lat: suggestion.client.latitud,
                            lng: suggestion.client.longitud,
                          });
                          setFlyToken((k) => k + 1);
                          setSelectedClientId(suggestion.client.id);
                          setReturnModal(null);
                          setDrawerOpen(false);
                        }}
                        className="shrink-0 rounded-md border border-[var(--border)] bg-[var(--bg-surface)] p-2 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                        title="Ver en mapa"
                      >
                        <MapPin size={14} aria-hidden />
                      </button>
                    </div>

                    {(suggestion.client.telefono || suggestion.client.email) && (
                      <div className="mt-2 flex flex-wrap gap-3 border-t border-[var(--border-subtle)] pt-2 text-[10px] text-[var(--text-muted)]">
                        {suggestion.client.telefono ? (
                          <span className="flex items-center gap-1">
                            <Phone size={9} aria-hidden />
                            {suggestion.client.telefono}
                          </span>
                        ) : null}
                        {suggestion.client.email ? (
                          <span className="flex items-center gap-1">
                            <Mail size={9} aria-hidden />
                            {suggestion.client.email}
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}

              {returnModal.suggestions.length === 0 ? (
                <p className="py-4 text-center text-sm text-[var(--text-muted)]">
                  No se encontraron sugerencias de retorno.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};
