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
import { CurrencySwitch } from './components/ui/CurrencySwitch';
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
import { useExchangeRate } from './hooks/useExchangeRate';
import { EXCHANGE_RATE_STORAGE_KEY } from './constants';
import { sanitizeFileName } from './utils/formatters';

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

  const {
    displayCurrency,
    currentRate,
    lastUpdated,
    toggleCurrency,
    setCurrentRate,
    convertToDisplay,
    convertAggregateToDisplay,
    formatAmount,
  } = useExchangeRate();

  useEffect(() => {
    const stored = parseStoredUser(localStorage.getItem(STORAGE_USER_KEY));
    if (stored) {
      setUser(stored);
    }
    setHydrated(true);
  }, []);

  const loadData = useCallback(async () => {
    try {
      const data = await fetchLogisticsData();
      setClients(data.clients);
      setTrips(data.trips);
      setCosts(data.costs);
      setOffline(lastLogisticsFetchWasMock());
    } catch (error) {
      console.error('[App] loadData error:', error);
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    if (!user || loading) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        if (trips.length === 0) {
          if (!cancelled) {
            setInsights([]);
          }
          return;
        }
        const lines = await generateLogisticsInsights(trips, clients);
        if (!cancelled) {
          setInsights(
            lines.map((description, i) => ({
              title: `Recomendación ${i + 1}`,
              description,
              type: 'info' as const,
            }))
          );
        }
      } catch (err) {
        console.error('[App] generateLogisticsInsights:', err);
        if (!cancelled) {
          setInsights([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loading, trips, clients]);

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
    const savedExchange = localStorage.getItem(EXCHANGE_RATE_STORAGE_KEY);
    localStorage.clear();
    if (savedTheme) {
      localStorage.setItem(THEME_KEY, savedTheme);
    }
    if (savedScheduled) {
      localStorage.setItem(SCHEDULED_COSTS_KEY, savedScheduled);
    }
    if (savedExchange) {
      localStorage.setItem(EXCHANGE_RATE_STORAGE_KEY, savedExchange);
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
      const saved = await saveTripToSheet(trip);
      if (!saved) {
        showToast('No se pudo guardar el viaje en Google Sheets. Reintentá.', 'error');
        return false;
      }
      setTrips((prev) => [trip, ...prev]);
      if (remitoImage) {
        try {
          const client = clients.find((c) => c.id === trip.clientId);
          const clientName = sanitizeFileName(client?.nombreComercial ?? 'Cliente');
          const ext = remitoImage.name.includes('.') ? remitoImage.name.split('.').pop() : 'jpg';
          const fileName = `REMITO_${clientName}_${trip.fecha}.${ext ?? 'jpg'}`;
          const remitoUrl = await uploadRemitoImage(
            trip.id,
            remitoImage.base64,
            fileName,
            remitoImage.mime
          );
          if (remitoUrl) {
            const updated: Trip = { ...trip, remitoUrl };
            setTrips((prev) => prev.map((t) => (t.id === trip.id ? updated : t)));
            await updateTripInSheet(updated);
          } else {
            showToast(
              'El viaje quedó guardado, pero no se obtuvo URL del remito (revisá carpeta Drive y permisos del script).',
              'warning'
            );
          }
        } catch (err) {
          console.error('Error subiendo remito:', err);
          showToast('Viaje guardado, pero hubo un error al subir el remito.', 'warning');
        }
      }
      return true;
    },
    [showToast, clients]
  );

  const onUpdateTrip = useCallback(async (trip: Trip) => {
    const ok = await updateTripInSheet(trip);
    if (!ok) {
      showToast('No se pudo actualizar el viaje en Google Sheets.', 'error');
      return;
    }
    setTrips((prev) => prev.map((t) => (t.id === trip.id ? trip : t)));
  }, [showToast]);

  const onDeleteTrip = useCallback(async (tripId: string) => {
    const ok = await deleteTripFromSheet(tripId);
    if (!ok) {
      showToast('No se pudo eliminar el viaje en Google Sheets.', 'error');
      return;
    }
    setTrips((prev) => prev.filter((t) => t.id !== tripId));
    setCosts((prev) => prev.filter((c) => c.tripId !== tripId));
  }, [showToast]);

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

  const onAddCost = useCallback(
    async (cost: Cost) => {
      const ok = await saveCostToSheet(cost);
      if (!ok) {
        showToast('No se pudo guardar el costo en Google Sheets.', 'error');
        return false;
      }
      setCosts((prev) => [...prev, cost]);
      return true;
    },
    [showToast]
  );

  const onUpdateCost = useCallback(
    async (cost: Cost) => {
      const ok = await updateCostInSheet(cost);
      if (!ok) {
        showToast('No se pudo actualizar el costo en Google Sheets.', 'error');
        return false;
      }
      setCosts((prev) => prev.map((c) => (c.id === cost.id ? cost : c)));
      return true;
    },
    [showToast]
  );

  const onDeleteCost = useCallback(
    async (costId: string) => {
      const ok = await deleteCostFromSheet(costId);
      if (!ok) {
        showToast('No se pudo eliminar el costo en Google Sheets.', 'error');
        return false;
      }
      setCosts((prev) => prev.filter((c) => c.id !== costId));
      return true;
    },
    [showToast]
  );

  useEffect(() => {
    if (loading || !user || user.role !== 'admin') {
      return;
    }
    const pending = getPendingScheduledCosts(costs);
    if (pending.length === 0) {
      return;
    }

    void (async () => {
      let savedCount = 0;
      for (const { cost, scheduledCostId } of pending) {
        const newCost: Cost = {
          ...cost,
          id: `K${Date.now()}_${scheduledCostId}`,
        };
        const saved = await onAddCost(newCost);
        if (saved) {
          savedCount += 1;
          updateScheduledCostLocal(scheduledCostId, {
            ultimaEjecucion: new Date().toISOString().split('T')[0],
          });
        }
      }
      if (savedCount > 0) {
        showToast(
          `Se guardaron ${savedCount} costo${savedCount > 1 ? 's' : ''} programado${savedCount > 1 ? 's' : ''} en Sheets.`,
          'info'
        );
      }
    })();
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
      currencySwitch={
        <CurrencySwitch
          displayCurrency={displayCurrency}
          currentRate={currentRate}
          lastUpdated={lastUpdated}
          onToggle={toggleCurrency}
          onRateChange={setCurrentRate}
        />
      }
    >
      {activeTab === 'dashboard' && (
        <Dashboard
          trips={trips}
          clients={clients}
          costs={costs}
          user={user}
          onUpdateTrip={onUpdateTrip}
          onNavigateToReport={() => setActiveTab('report')}
          displayCurrency={displayCurrency}
          currentRate={currentRate}
          formatAmount={formatAmount}
          convertAggregateToDisplay={convertAggregateToDisplay}
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
          currentRate={currentRate}
          displayCurrency={displayCurrency}
          formatAmount={formatAmount}
          convertToDisplay={convertToDisplay}
          convertAggregateToDisplay={convertAggregateToDisplay}
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
            formatAmount={formatAmount}
            convertAggregateToDisplay={convertAggregateToDisplay}
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
            currentRate={currentRate}
            displayCurrency={displayCurrency}
            formatAmount={formatAmount}
            convertAggregateToDisplay={convertAggregateToDisplay}
          />
        </AdminGuard>
      )}
      {activeTab === 'financial' && (
        <AdminGuard user={user} onRedirect={adminRedirect}>
          <FinancialDashboard
            trips={trips}
            clients={clients}
            costs={costs}
            formatAmount={formatAmount}
            convertAggregateToDisplay={convertAggregateToDisplay}
          />
        </AdminGuard>
      )}
    </AppShell>
  );
};

export default App;
