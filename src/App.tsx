import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ActiveTab, AIInsight, Client, Cost, Trip, User } from './types';
import { Dashboard } from './components/modules/Dashboard';
import { StrategicMap } from './components/modules/StrategicMap';
import { TripManager } from './components/modules/TripManager';
import { ClientDirectory } from './components/modules/ClientDirectory';
import { ClientForm } from './components/modules/ClientForm';
import { BillingView } from './components/modules/BillingView';
import { Login } from './components/modules/Login';
import { FinancialDashboard } from './components/modules/FinancialDashboard';
import { PerformanceReport } from './components/modules/PerformanceReport';
import { CostManager } from './components/modules/CostManager';
import { AppShell } from './components/layout/AppShell';
import { AdminGuard } from './components/layout/AdminGuard';
import { LoadingSpinner } from './components/ui/LoadingSpinner';
import {
  deleteCostFromSheet,
  deleteTripFromSheet,
  fetchLogisticsData,
  lastLogisticsFetchWasMock,
  saveClientToSheet,
  saveCostToSheet,
  saveTripToSheet,
  updateCostInSheet,
  updateTripInSheet,
  uploadRemitoImage,
} from './services/api';
import { generateLogisticsInsights } from './services/geminiService';
import { useTheme } from './hooks/useTheme';
import { useToast } from './hooks/useToast';
import { useScheduledCosts } from './hooks/useScheduledCosts';

const STORAGE_USER_KEY = 'gdc_user';
const THEME_KEY = 'gdc_theme';
const SCHEDULED_COSTS_KEY = 'gdc_scheduled_costs';

const ADMIN_ONLY_TABS = new Set<ActiveTab>([
  'costs',
  'financial',
  'billing',
  'clients',
  'newClient',
  'report',
]);

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
  const { theme } = useTheme();
  void theme;
  const { showToast } = useToast();

  const [hydrated, setHydrated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [costs, setCosts] = useState<Cost[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const {
    scheduledCosts,
    addScheduledCost,
    updateScheduledCost: updateScheduledCostLocal,
    deleteScheduledCost,
    toggleActive,
    getPendingScheduledCosts,
    nextDueDate,
  } = useScheduledCosts();

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
    setOffline(lastLogisticsFetchWasMock());

    try {
      if (data.trips.length > 0) {
        const lines = await generateLogisticsInsights(data.trips, data.clients);
        setInsights(
          lines.map((description, i) => ({
            title: `Recomendación ${i + 1}`,
            description,
            type: 'info' as const,
          }))
        );
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
    const savedTheme = localStorage.getItem(THEME_KEY);
    const savedScheduled = localStorage.getItem(SCHEDULED_COSTS_KEY);
    localStorage.clear();
    if (savedTheme) {
      localStorage.setItem(THEME_KEY, savedTheme);
    }
    if (savedScheduled) {
      localStorage.setItem(SCHEDULED_COSTS_KEY, savedScheduled);
    }
    setUser(null);
    setActiveTab('dashboard');
    setTrips([]);
    setClients([]);
    setCosts([]);
    setInsights([]);
    setOffline(false);
  }, []);

  const onAddTrip = useCallback(
    async (trip: Trip, remitoImage?: { base64: string; name: string; mime: string }) => {
      await saveTripToSheet(trip);
      setTrips((prev) => [trip, ...prev]);
      if (remitoImage) {
        try {
          const remitoUrl = await uploadRemitoImage(
            trip.id,
            remitoImage.base64,
            remitoImage.name,
            remitoImage.mime
          );
          if (remitoUrl) {
            const updated: Trip = { ...trip, remitoUrl };
            setTrips((prev) => prev.map((t) => (t.id === trip.id ? updated : t)));
            await updateTripInSheet(updated);
          } else {
            showToast('Viaje guardado. No se obtuvo URL del remito.', 'warning');
          }
        } catch (err) {
          console.error('Error subiendo remito:', err);
          showToast('Viaje guardado, pero hubo un error al subir el remito', 'warning');
        }
      }
    },
    [showToast]
  );

  const onUpdateTrip = useCallback(async (trip: Trip) => {
    await updateTripInSheet(trip);
    setTrips((prev) => prev.map((t) => (t.id === trip.id ? trip : t)));
  }, []);

  const onDeleteTrip = useCallback(async (tripId: string) => {
    await deleteTripFromSheet(tripId);
    setTrips((prev) => prev.filter((t) => t.id !== tripId));
    setCosts((prev) => prev.filter((c) => c.tripId !== tripId));
  }, []);

  const onUploadInvoice = useCallback((tripId: string, url: string) => {
    setTrips((prev) => {
      const next = prev.map((t) =>
        t.id === tripId ? { ...t, facturaUrl: url, estado: 'Cerrado' as const } : t
      );
      const updated = next.find((t) => t.id === tripId);
      if (updated) {
        void updateTripInSheet(updated);
      }
      return next;
    });
  }, []);

  const onAddClient = useCallback(async (newClient: Client) => {
    setLoading(true);
    try {
      await saveClientToSheet(newClient);
      setClients((prev) => [...prev, newClient]);
      setActiveTab('clients');
    } finally {
      setLoading(false);
    }
  }, []);

  const onAddCost = useCallback(async (cost: Cost) => {
    await saveCostToSheet(cost);
    setCosts((prev) => [...prev, cost]);
  }, []);

  const onUpdateCost = useCallback(async (cost: Cost) => {
    await updateCostInSheet(cost);
    setCosts((prev) => prev.map((c) => (c.id === cost.id ? cost : c)));
  }, []);

  const onDeleteCost = useCallback(async (costId: string) => {
    await deleteCostFromSheet(costId);
    setCosts((prev) => prev.filter((c) => c.id !== costId));
  }, []);

  useEffect(() => {
    if (loading || !user || user.role !== 'admin') {
      return;
    }
    const pending = getPendingScheduledCosts(costs);
    if (pending.length === 0) {
      return;
    }

    pending.forEach(async ({ cost, scheduledCostId }) => {
      const newCost: Cost = {
        ...cost,
        id: `K${Date.now()}_${scheduledCostId}`,
      };
      await onAddCost(newCost);
      updateScheduledCostLocal(scheduledCostId, {
        ultimaEjecucion: new Date().toISOString().split('T')[0],
      });
    });

    showToast(
      `Se generaron ${pending.length} costo${pending.length > 1 ? 's' : ''} programado${pending.length > 1 ? 's' : ''} automáticamente`,
      'info'
    );
  }, [loading]);

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
      {activeTab === 'dashboard' && (
        <Dashboard
          trips={trips}
          clients={clients}
          costs={costs}
          user={user}
          onUpdateTrip={onUpdateTrip}
          onNavigateToReport={() => setActiveTab('report')}
        />
      )}
      {activeTab === 'report' && (
        <AdminGuard user={user} onRedirect={adminRedirect}>
          <PerformanceReport
            trips={trips}
            clients={clients}
            costs={costs}
            user={user}
            onClose={() => setActiveTab('dashboard')}
          />
        </AdminGuard>
      )}
      {activeTab === 'trips' && (
        <TripManager
          trips={trips}
          clients={clients}
          costs={costs}
          user={user}
          onAddTrip={onAddTrip}
          onUpdateTrip={onUpdateTrip}
          onDeleteTrip={onDeleteTrip}
          onInvoiceUploaded={onUploadInvoice}
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
          <BillingView
            trips={trips}
            clients={clients}
            onInvoiceUploaded={onUploadInvoice}
            onUpdateTrip={onUpdateTrip}
          />
        </AdminGuard>
      )}
      {activeTab === 'costs' && (
        <AdminGuard user={user} onRedirect={adminRedirect}>
          <CostManager
            costs={costs}
            trips={trips}
            clients={clients}
            registradoPor={user.username}
            onAddCost={onAddCost}
            onUpdateCost={onUpdateCost}
            onDeleteCost={onDeleteCost}
            scheduledCosts={scheduledCosts}
            onAddScheduledCost={addScheduledCost}
            onUpdateScheduledCost={updateScheduledCostLocal}
            onDeleteScheduledCost={deleteScheduledCost}
            onToggleScheduledCost={toggleActive}
            nextDueDate={nextDueDate()}
          />
        </AdminGuard>
      )}
      {activeTab === 'financial' && (
        <AdminGuard user={user} onRedirect={adminRedirect}>
          <FinancialDashboard trips={trips} clients={clients} costs={costs} />
        </AdminGuard>
      )}
    </AppShell>
  );
};

export default App;
