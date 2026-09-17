import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ActiveTab,
  AIInsight,
  Client,
  Cost,
  FleetDocument,
  ReportEmailEntry,
  ScheduledCostDefinition,
  Trip,
  User,
} from './types';
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
import { DocumentsView } from './components/modules/DocumentsView';
import { AppShell } from './components/layout/AppShell';
import { AdminGuard } from './components/layout/AdminGuard';
import { LoadingSpinner } from './components/ui/LoadingSpinner';
import { CurrencySwitch } from './components/ui/CurrencySwitch';
import {
  deleteCostFromSheet,
  deleteDocumentFromSheet,
  deleteReportEmailFromSheet,
  deleteScheduledCostDefinition,
  deleteTripFromSheet,
  fetchLogisticsData,
  lastLogisticsFetchWasMock,
  saveClientToSheet,
  saveCostToSheet,
  saveDocumentToSheet,
  saveReportEmailToSheet,
  saveScheduledCostDefinition,
  saveTripToSheet,
  updateCostInSheet,
  updateDocumentInSheet,
  updateReportEmailInSheet,
  updateScheduledCostDefinition,
  updateTripInSheet,
  uploadDocumentFile,
  uploadRemitoImage,
} from './services/api';
import { generateLogisticsInsights } from './services/geminiService';
import { useTheme } from './hooks/useTheme';
import { useToast } from './hooks/useToast';
import { useExchangeRate } from './hooks/useExchangeRate';
import { EXCHANGE_RATE_STORAGE_KEY } from './constants';
import { sanitizeFileName } from './utils/formatters';
import { collectAvailableMonthKeys } from './utils/analytics';
import { countDocumentAlerts } from './utils/documents';
import { ReportCenter } from './components/modules/ReportCenter';
import { normalizeEmailAddress } from './utils/reportEmails';

const STORAGE_USER_KEY = 'gdc_user';
const THEME_KEY = 'gdc_theme';

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
  const [documents, setDocuments] = useState<FleetDocument[]>([]);
  const [reportEmails, setReportEmails] = useState<ReportEmailEntry[]>([]);
  const [scheduledCostDefinitions, setScheduledCostDefinitions] = useState<ScheduledCostDefinition[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [insights, setInsights] = useState<AIInsight[]>([]);

  const availableMonths = useMemo(
    () => collectAvailableMonthKeys(trips, costs),
    [trips, costs]
  );

  const {
    displayCurrency,
    currentRate,
    lastUpdated,
    toggleCurrency,
    setCurrentRate,
    convertToDisplay,
    convertAggregateToDisplay,
    formatAmount,
    formatAmountPrecise,
  } = useExchangeRate();

  useEffect(() => {
    const stored = parseStoredUser(localStorage.getItem(STORAGE_USER_KEY));
    if (stored) {
      setUser(stored);
    }
    setHydrated(true);
  }, []);

  const loadData = useCallback(async (currentUser: User | null) => {
    try {
      // Single GET dump — scheduledCostDefinitions come in the same payload (Phase A).
      const data = await fetchLogisticsData();
      setClients(data.clients);
      setTrips(data.trips);
      setCosts(data.costs);
      setDocuments(data.documents);
      setReportEmails(data.reportEmails);
      setOffline(lastLogisticsFetchWasMock());
      if (currentUser?.role === 'admin') {
        setScheduledCostDefinitions(data.scheduledCostDefinitions);
      } else {
        setScheduledCostDefinitions([]);
      }
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
    void loadData(user).finally(() => setLoading(false));
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
    const savedExchange = localStorage.getItem(EXCHANGE_RATE_STORAGE_KEY);
    localStorage.clear();
    if (savedTheme) {
      localStorage.setItem(THEME_KEY, savedTheme);
    }
    if (savedExchange) {
      localStorage.setItem(EXCHANGE_RATE_STORAGE_KEY, savedExchange);
    }
    setUser(null);
    setActiveTab('dashboard');
    setTrips([]);
    setClients([]);
    setCosts([]);
    setDocuments([]);
    setReportEmails([]);
    setScheduledCostDefinitions([]);
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
          const remitoResult = await uploadRemitoImage(
            trip.id,
            remitoImage.base64,
            fileName,
            remitoImage.mime
          );
          if (remitoResult.ok && remitoResult.url) {
            const updated: Trip = { ...trip, remitoUrl: remitoResult.url };
            setTrips((prev) => prev.map((t) => (t.id === trip.id ? updated : t)));
            await updateTripInSheet(updated);
          } else {
            const detail = remitoResult.message ? ` Detalle: ${remitoResult.message}` : '';
            showToast(
              `El viaje quedó guardado, pero no se obtuvo URL del remito.${detail}`,
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

  const onCreateScheduledDefinition = useCallback(
    async (def: ScheduledCostDefinition) => {
      try {
        await saveScheduledCostDefinition(def);
        setScheduledCostDefinitions((prev) => [...prev, def]);
        showToast('Costo programado guardado en Sheets.', 'info');
      } catch (err) {
        console.error('[App] onCreateScheduledDefinition:', err);
        showToast('No se pudo guardar la definición en Sheets.', 'error');
      }
    },
    [showToast]
  );

  const onUpdateScheduledDefinition = useCallback(
    async (def: ScheduledCostDefinition) => {
      try {
        await updateScheduledCostDefinition(def);
        setScheduledCostDefinitions((prev) => prev.map((d) => (d.id === def.id ? def : d)));
      } catch (err) {
        console.error('[App] onUpdateScheduledDefinition:', err);
        showToast('No se pudo actualizar la definición.', 'error');
      }
    },
    [showToast]
  );

  const onDeleteScheduledDefinitionHandler = useCallback(
    async (id: string) => {
      try {
        await deleteScheduledCostDefinition(id);
        setScheduledCostDefinitions((prev) => prev.filter((d) => d.id !== id));
        showToast('Definición eliminada.', 'info');
      } catch (err) {
        console.error('[App] onDeleteScheduledDefinitionHandler:', err);
        showToast('No se pudo eliminar la definición.', 'error');
      }
    },
    [showToast]
  );

  const onToggleScheduledDefinitionActive = useCallback(
    async (id: string) => {
      const def = scheduledCostDefinitions.find((d) => d.id === id);
      if (!def) {
        return;
      }
      await onUpdateScheduledDefinition({ ...def, active: !def.active });
    },
    [scheduledCostDefinitions, onUpdateScheduledDefinition]
  );

  const onSaveDocument = useCallback(
    async (doc: FleetDocument) => {
      const ok = await saveDocumentToSheet(doc);
      if (!ok) {
        showToast('No se pudo guardar el documento en Google Sheets.', 'error');
        return false;
      }
      setDocuments((prev) => [...prev, doc]);
      return true;
    },
    [showToast]
  );

  const onUpdateDocument = useCallback(
    async (doc: FleetDocument) => {
      const ok = await updateDocumentInSheet(doc);
      if (!ok) {
        showToast('No se pudo actualizar el documento en Google Sheets.', 'error');
        return false;
      }
      setDocuments((prev) => prev.map((d) => (d.id === doc.id ? doc : d)));
      return true;
    },
    [showToast]
  );

  const onSoftDeleteDocument = useCallback(
    async (id: string) => {
      const ok = await deleteDocumentFromSheet(id);
      if (!ok) {
        showToast('No se pudo desactivar el documento en Google Sheets.', 'error');
        return false;
      }
      const today = new Date().toISOString().split('T')[0];
      setDocuments((prev) =>
        prev.map((d) => (d.id === id ? { ...d, activo: false, actualizadoEn: today } : d))
      );
      return true;
    },
    [showToast]
  );

  const onUploadDocument = useCallback(
    async (documentId: string, fileData: string, fileName: string, mimeType: string) => {
      const result = await uploadDocumentFile(documentId, fileData, fileName, mimeType);
      if (result.ok && result.url) {
        const today = new Date().toISOString().split('T')[0];
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === documentId ? { ...d, archivoUrl: result.url, actualizadoEn: today } : d
          )
        );
        showToast('Archivo subido a Drive.', 'info');
      } else {
        showToast(result.message || 'No se pudo subir el archivo del documento.', 'error');
      }
      return result;
    },
    [showToast]
  );

  const onAddReportEmail = useCallback(
    async (email: string) => {
      const today = new Date().toISOString().split('T')[0];
      const entry: ReportEmailEntry = {
        email: normalizeEmailAddress(email),
        autoMonthly: false,
        activo: true,
        updatedAt: today,
        createdAt: today,
        createdBy: user?.username ?? 'admin',
      };
      const ok = await saveReportEmailToSheet(entry);
      if (!ok) {
        showToast('No se pudo guardar el email en Google Sheets.', 'error');
        return false;
      }
      setReportEmails((prev) => {
        const idx = prev.findIndex((e) => e.email === entry.email);
        if (idx >= 0) {
          const next = prev.slice();
          next[idx] = { ...next[idx], ...entry, activo: true };
          return next;
        }
        return [...prev, entry];
      });
      return true;
    },
    [showToast, user?.username]
  );

  const onToggleAutoMonthly = useCallback(
    async (email: string, autoMonthly: boolean) => {
      const existing = reportEmails.find((e) => e.email === normalizeEmailAddress(email));
      if (!existing) return false;
      const today = new Date().toISOString().split('T')[0];
      const updated: ReportEmailEntry = { ...existing, autoMonthly, updatedAt: today };
      const ok = await updateReportEmailInSheet(updated);
      if (!ok) {
        showToast('No se pudo actualizar autoMonthly.', 'error');
        return false;
      }
      setReportEmails((prev) => prev.map((e) => (e.email === updated.email ? updated : e)));
      return true;
    },
    [reportEmails, showToast]
  );

  const onRemoveReportEmail = useCallback(
    async (email: string) => {
      const clean = normalizeEmailAddress(email);
      const ok = await deleteReportEmailFromSheet(clean);
      if (!ok) {
        showToast('No se pudo desactivar el email.', 'error');
        return false;
      }
      const today = new Date().toISOString().split('T')[0];
      setReportEmails((prev) =>
        prev.map((e) => (e.email === clean ? { ...e, activo: false, updatedAt: today } : e))
      );
      return true;
    },
    [showToast]
  );

  const onMigrateLocalEmails = useCallback(
    async (emails: string[]) => {
      const today = new Date().toISOString().split('T')[0];
      for (const email of emails) {
        const entry: ReportEmailEntry & { preserveAutoMonthly?: boolean } = {
          email: normalizeEmailAddress(email),
          autoMonthly: false,
          activo: true,
          updatedAt: today,
          createdAt: today,
          createdBy: user?.username ?? 'admin',
          preserveAutoMonthly: true,
        };
        const ok = await saveReportEmailToSheet(entry);
        if (ok) {
          setReportEmails((prev) => {
            if (prev.some((e) => e.email === entry.email)) return prev;
            return [...prev, entry];
          });
        }
      }
    },
    [user?.username]
  );

  const pendingTripsCount = useMemo(
    () => trips.filter((t) => t.estado === 'Pendiente').length,
    [trips]
  );

  const documentAlertStats = useMemo(() => countDocumentAlerts(documents), [documents]);

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
    <>
    <AppShell
      user={user}
      currentView={activeTab}
      onNavigate={setActiveTab}
      offline={offline}
      pendingTripsCount={pendingTripsCount}
      documentsAlertCount={documentAlertStats.alertTotal}
      documentsAlertHasOverdue={documentAlertStats.overdue > 0}
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
          offline={offline}
          onUpdateTrip={onUpdateTrip}
          onOpenMonthlyReport={() => setReportModalOpen(true)}
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
      {activeTab === 'documents' && (
        <DocumentsView
          user={user}
          documents={documents}
          onSave={onSaveDocument}
          onUpdate={onUpdateDocument}
          onSoftDelete={onSoftDeleteDocument}
          onUpload={onUploadDocument}
        />
      )}
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
        <CostManager
          user={user}
          costs={costs}
          trips={trips}
          clients={clients}
          registradoPor={user.username}
          onAddCost={onAddCost}
          onUpdateCost={onUpdateCost}
          onDeleteCost={onDeleteCost}
          scheduledCostDefinitions={scheduledCostDefinitions}
          onCreateScheduledDefinition={onCreateScheduledDefinition}
          onDeleteScheduledDefinition={onDeleteScheduledDefinitionHandler}
          onToggleScheduledDefinitionActive={onToggleScheduledDefinitionActive}
          currentRate={currentRate}
          displayCurrency={displayCurrency}
          formatAmount={formatAmount}
          convertAggregateToDisplay={convertAggregateToDisplay}
        />
      )}
      {activeTab === 'financial' && (
        <AdminGuard user={user} onRedirect={adminRedirect}>
          <FinancialDashboard
            trips={trips}
            clients={clients}
            costs={costs}
            formatAmount={formatAmount}
            formatAmountPrecise={formatAmountPrecise}
            convertAggregateToDisplay={convertAggregateToDisplay}
          />
        </AdminGuard>
      )}
    </AppShell>
    <ReportCenter
      open={reportModalOpen}
      onClose={() => setReportModalOpen(false)}
      trips={trips}
      costs={costs}
      clients={clients}
      availableMonths={availableMonths}
      formatAmount={formatAmount}
      convertAggregateToDisplay={convertAggregateToDisplay}
      reportEmails={reportEmails}
      onAddReportEmail={onAddReportEmail}
      onToggleAutoMonthly={onToggleAutoMonthly}
      onRemoveReportEmail={onRemoveReportEmail}
      onMigrateLocalEmails={onMigrateLocalEmails}
    />
    </>
  );
};

export default App;
