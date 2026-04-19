import React, { useEffect, useMemo, useState } from 'react';
import type { AIInsight, Client, ShellView, Trip, User } from './types';
import { Dashboard } from './components/modules/Dashboard';
import { StrategicMap } from './components/modules/StrategicMap';
import { TripManager } from './components/modules/TripManager';
import { ClientDirectory } from './components/modules/ClientDirectory';
import { ClientForm } from './components/modules/ClientForm';
import { BillingView } from './components/modules/BillingView';
import { Login } from './components/modules/Login';
import { PlaceholderModule } from './components/modules/PlaceholderModule';
import { AppShell } from './components/layout/AppShell';
import { LoadingSpinner } from './components/ui/LoadingSpinner';
import { fetchLogisticsData, saveClientToSheet } from './services/api';
import { generateLogisticsInsights } from './services/geminiService';

const ADMIN_ONLY_VIEWS = new Set<ShellView>([
  'costs',
  'financial',
  'billing',
  'directory',
  'newClient',
]);

const SHELL_COPY = {
  costsTitle: 'Costos',
  costsDesc: 'Aquí se centralizarán peajes, combustible, mantenimiento y costos por viaje.',
  financialTitle: 'Finanzas',
  financialDesc: 'Panel financiero (margen, flujo y cierre) se integrará con analytics y Sheets.',
} as const;

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [shellView, setShellView] = useState<ShellView>('dashboard');
  const [clients, setClients] = useState<Client[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  const loadData = async () => {
    try {
      const data = await fetchLogisticsData();
      setClients(data.clients);
      setTrips(data.trips);
      setOffline(false);

      if (data.trips.length > 0) {
        const aiSuggestions = await generateLogisticsInsights(data.trips, data.clients);
        setInsights(aiSuggestions);
      } else {
        setInsights([]);
      }
    } catch (error) {
      console.error('Error cargando datos:', error);
      setOffline(true);
    }
  };

  useEffect(() => {
    if (user) {
      setLoading(true);
      void loadData().finally(() => setLoading(false));
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }
    if (user.role !== 'admin' && ADMIN_ONLY_VIEWS.has(shellView)) {
      setShellView('dashboard');
    }
  }, [user, shellView]);

  const handleRegisterClient = async (newClient: Client) => {
    setLoading(true);
    const success = await saveClientToSheet(newClient);

    if (success) {
      alert('✅ Cliente registrado exitosamente en Google Sheets');
      await loadData();
      setShellView('directory');
    } else {
      alert('❌ Error al guardar: Revisa la conexión con el Sheets');
    }
    setLoading(false);
  };

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

  if (!user) {
    return <Login onLogin={setUser} />;
  }

  if (loading) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-3 bg-[var(--bg-base)] text-[var(--text-primary)]">
        <LoadingSpinner size="lg" />
        <p className="text-sm text-[var(--text-secondary)]">Procesando con GDC Logistics…</p>
      </div>
    );
  }

  return (
    <AppShell
      user={user}
      currentView={shellView}
      onNavigate={setShellView}
      offline={offline}
      onLogout={() => {
        localStorage.clear();
        setUser(null);
      }}
      headerBadge={headerBadge}
    >
      {shellView === 'dashboard' && <Dashboard trips={trips} clients={clients} user={user} />}
      {shellView === 'trips' && (
        <TripManager trips={trips} clients={clients} user={user} onAddTrip={() => {}} />
      )}
      {shellView === 'map' && <StrategicMap clients={clients} trips={trips} />}
      {shellView === 'directory' && <ClientDirectory clients={clients} trips={trips} />}
      {shellView === 'newClient' && (
        <div className="mx-auto max-w-4xl">
          <ClientForm onAddClient={handleRegisterClient} />
        </div>
      )}
      {shellView === 'billing' && (
        <BillingView trips={trips} clients={clients} onInvoiceUploaded={() => {}} />
      )}
      {shellView === 'costs' && (
        <PlaceholderModule
          title={SHELL_COPY.costsTitle}
          description={SHELL_COPY.costsDesc}
        />
      )}
      {shellView === 'financial' && (
        <PlaceholderModule
          title={SHELL_COPY.financialTitle}
          description={SHELL_COPY.financialDesc}
        />
      )}
    </AppShell>
  );
};

export default App;
