import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ActiveTab, AIInsight, Client, Cost, Trip, User } from './types';
import { Dashboard } from './components/modules/Dashboard';
import { StrategicMap } from './components/modules/StrategicMap';
import { TripManager } from './components/modules/TripManager';
import { ClientDirectory } from './components/modules/ClientDirectory';
import { ClientForm } from './components/modules/ClientForm';
import { BillingView } from './components/modules/BillingView';
import { Login } from './components/modules/Login';
import { PlaceholderModule } from './components/modules/PlaceholderModule';
import { CostsPanel } from './components/modules/CostsPanel';
import { AppShell } from './components/layout/AppShell';
import { AdminGuard } from './components/layout/AdminGuard';
import { LoadingSpinner } from './components/ui/LoadingSpinner';
import {
  deleteTripInSheet,
  fetchLogisticsData,
  saveClientToSheet,
  saveTripToSheet,
  updateTripInSheet,
} from './services/api';
import { generateLogisticsInsights } from './services/geminiService';

const STORAGE_USER_KEY = 'gdc_user';

const ADMIN_ONLY_TABS = new Set<ActiveTab>(['costs', 'financial', 'billing', 'clients', 'newClient']);

const SHELL_COPY = {
  financialTitle: 'Finanzas',
  financialDesc: 'Panel financiero (margen, flujo y cierre) se integrará con analytics y Sheets.',
} as const;

function parseStoredUser(raw: string | null): User | null {
  if (!raw) {
    return null;
  }
  try {
    const u: unknown = JSON.parse(raw);
    if (!u || typeof u !== 'object') {
      return null;
    }
    const r = u as Record<string, unknown>;
    if (
      typeof r.username !== 'string' ||
      typeof r.nombre !== 'string' ||
      (r.role !== 'admin' && r.role !== 'operativo')
    ) {
      return null;
    }
    return { username: r.username, nombre: r.nombre, role: r.role };
  } catch {
    return null;
  }
}

const App: React.FC = () => {
  const [hydrated, setHydrated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [costs, setCosts] = useState<Cost[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [insights, setInsights] = useState<AIInsight[]>([]);

  useEffect(() => {
    const stored = parseStoredUser(localStorage.getItem(STORAGE_USER_KEY));
    if (stored) {
      setUser(stored);
    }
    setHydrated(true);
  }, []);

  const loadData = useCallback(async () => {
    const data = await fetchLogisticsData();
    setClients(data.clients);
    setTrips(data.trips);
    setCosts(data.costs);
    setOffline(data.offline);

    try {
      if (data.trips.length > 0) {
        const aiSuggestions = await generateLogisticsInsights(data.trips, data.clients);
        setInsights(aiSuggestions);
      } else {
        setInsights([]);
      }
    } catch {
      setInsights([]);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void loadData().finally(() => setLoading(false));
  }, [hydrated, user, loadData]);

  useEffect(() => {
    if (!user) {
      return;
    }
    if (user.role !== 'admin' && ADMIN_ONLY_TABS.has(activeTab)) {
      setActiveTab('dashboard');
    }
  }, [user, activeTab]);

  const handleLoginSuccess = useCallback((logged: User) => {
    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(logged));
    setUser(logged);
    setActiveTab('dashboard');
  }, []);

  const onLogout = useCallback(() => {
    localStorage.clear();
    setUser(null);
    setActiveTab('dashboard');
    setTrips([]);
    setClients([]);
    setCosts([]);
    setInsights([]);
    setOffline(false);
  }, []);

  const onAddTrip = useCallback(async (trip: Trip) => {
    await saveTripToSheet(trip);
    setTrips((prev) => [...prev, trip]);
  }, []);

  const onUpdateTrip = useCallback(async (trip: Trip) => {
    await updateTripInSheet(trip);
    setTrips((prev) => prev.map((t) => (t.id === trip.id ? trip : t)));
  }, []);

  const onDeleteTrip = useCallback(async (tripId: string) => {
    await deleteTripInSheet(tripId);
    setTrips((prev) => prev.filter((t) => t.id !== tripId));
    setCosts((prev) => prev.filter((c) => c.tripId !== tripId));
  }, []);

  const onUploadInvoice = useCallback((tripId: string, url: string) => {
    setTrips((prev) =>
      prev.map((t) =>
        t.id === tripId ? { ...t, facturaUrl: url, estado: 'Cerrado' as const } : t
      )
    );
  }, []);

  const onAddClient = useCallback(
    async (newClient: Client) => {
      setLoading(true);
      const success = await saveClientToSheet(newClient);
      if (success) {
        setClients((prev) => [...prev, newClient]);
        setActiveTab('clients');
      } else {
        alert('❌ Error al guardar: revisá la conexión con Sheets.');
      }
      setLoading(false);
    },
    []
  );

  const onAddCost = useCallback((cost: Cost) => {
    setCosts((prev) => [...prev, cost]);
  }, []);

  const onUpdateCost = useCallback((cost: Cost) => {
    setCosts((prev) => prev.map((c) => (c.id === cost.id ? cost : c)));
  }, []);

  const onDeleteCost = useCallback((costId: string) => {
    setCosts((prev) => prev.filter((c) => c.id !== costId));
  }, []);

  const pendingTripsCount = useMemo(
    () => trips.filter((t) => t.estado === 'Pendiente').length,
    [trips]
  );

  const headerBadge = useMemo(() => {
    if (insights.length === 0) {
      return null;
    }
    return (
      <span className="rounded-full border border-[color-mix(in_srgb,var(--accent-blue)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent-blue)_14%,transparent)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-200">
        IA ACTIVA
      </span>
    );
  }, [insights.length]);

  if (!hydrated) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-3 bg-[var(--bg-base)] text-[var(--text-primary)]">
        <LoadingSpinner size="lg" />
        <p className="text-sm text-[var(--text-secondary)]">Iniciando…</p>
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={handleLoginSuccess} />;
  }

  if (loading) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-3 bg-[var(--bg-base)] text-[var(--text-primary)]">
        <LoadingSpinner size="lg" />
        <p className="text-sm text-[var(--text-secondary)]">Cargando datos de GDC Logistics…</p>
      </div>
    );
  }

  const adminRedirect = () => setActiveTab('dashboard');

  return (
    <AppShell
      user={user}
      currentView={activeTab}
      onNavigate={setActiveTab}
      offline={offline}
      pendingTripsCount={pendingTripsCount}
      onLogout={onLogout}
      headerBadge={headerBadge}
    >
      {activeTab === 'dashboard' && <Dashboard trips={trips} clients={clients} user={user} />}
      {activeTab === 'trips' && (
        <TripManager
          trips={trips}
          clients={clients}
          user={user}
          onAddTrip={onAddTrip}
          onUpdateTrip={onUpdateTrip}
          onDeleteTrip={onDeleteTrip}
        />
      )}
      {activeTab === 'map' && <StrategicMap clients={clients} trips={trips} />}
      {activeTab === 'clients' && (
        <AdminGuard user={user} onRedirect={adminRedirect}>
          <ClientDirectory clients={clients} trips={trips} />
        </AdminGuard>
      )}
      {activeTab === 'newClient' && (
        <AdminGuard user={user} onRedirect={adminRedirect}>
          <div className="mx-auto max-w-4xl">
            <ClientForm onAddClient={onAddClient} />
          </div>
        </AdminGuard>
      )}
      {activeTab === 'billing' && (
        <AdminGuard user={user} onRedirect={adminRedirect}>
          <BillingView trips={trips} clients={clients} onInvoiceUploaded={onUploadInvoice} />
        </AdminGuard>
      )}
      {activeTab === 'costs' && (
        <AdminGuard user={user} onRedirect={adminRedirect}>
          <CostsPanel
            costs={costs}
            registradoPor={user.username}
            onAddCost={onAddCost}
            onUpdateCost={onUpdateCost}
            onDeleteCost={onDeleteCost}
          />
        </AdminGuard>
      )}
      {activeTab === 'financial' && (
        <AdminGuard user={user} onRedirect={adminRedirect}>
          <PlaceholderModule
            title={SHELL_COPY.financialTitle}
            description={`${SHELL_COPY.financialDesc} Dataset: ${trips.length} viajes, ${costs.length} costos.`}
          />
        </AdminGuard>
      )}
    </AppShell>
  );
};

export default App;
