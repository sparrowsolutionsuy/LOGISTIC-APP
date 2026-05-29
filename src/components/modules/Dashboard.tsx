import React, { useEffect, useMemo, useState } from 'react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from 'recharts';
import type { TooltipProps } from 'recharts';
import type { Client, Cost, DisplayCurrency, KPIData, Trip, User } from '../../types';
import {
  buildKPIData,
  buildMonthlyStats,
  getAvailableMonths,
  monthLabel,
  tripRevenueUSD,
} from '../../utils/analytics';
import { generateLogisticsInsights } from '../../services/geminiService';
import {
  DollarSign,
  Truck,
  Wallet,
  Sparkles,
  CheckCircle2,
  Clock,
  FileBarChart,
  TrendingUp,
  Route,
  Package,
  Users,
  Loader2,
} from 'lucide-react';
import { Button } from '../ui/Button';
import Badge from '../ui/Badge';

export interface DashboardProps {
  trips: Trip[];
  clients: Client[];
  costs: Cost[];
  user: User;
  onUpdateTrip?: (trip: Trip) => void | Promise<void>;
  offline?: boolean;
  kpiPrecomputed?: KPIData;
  onOpenMonthlyReport?: () => void;
  displayCurrency?: DisplayCurrency;
  currentRate?: number;
  formatAmount?: (n: number) => string;
  convertAggregateToDisplay?: (amountUSD: number) => number;
}

function localISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatUsd(n: number): string {
  return n.toLocaleString('es-UY', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

type ChartTooltipProps = TooltipProps<number, string>;

const ChartTooltipEs: React.FC<ChartTooltipProps & { formatMoney: (n: number) => string }> = ({
  active,
  payload,
  label,
  formatMoney,
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm shadow-md">
      <p className="mb-1 font-semibold text-[var(--text-primary)]">{label}</p>
      <ul className="space-y-0.5 text-[var(--text-secondary)]">
        {payload.map((p) => (
          <li key={String(p.dataKey)}>
            <span className="text-[var(--text-muted)]">{p.name}: </span>
            <span className="font-medium text-[var(--text-primary)]">
              {typeof p.value === 'number' ? formatMoney(p.value) : p.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

const DashboardChartSkeleton: React.FC = () => (
  <div className="flex min-h-[240px] w-full animate-pulse flex-col gap-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
    <div className="flex flex-1 items-end justify-between gap-2 pt-8">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex-1 rounded-t bg-[var(--bg-muted)]"
          style={{ height: `${30 + ((i * 17) % 55)}%` }}
        />
      ))}
    </div>
  </div>
);

const KpiCard: React.FC<{
  title: string;
  value: string;
  icon: React.ReactNode;
  bg: string;
  sub?: string;
  valueClassName?: string;
  titleTip?: string;
}> = ({ title, value, icon, bg, sub, valueClassName, titleTip }) => (
  <div
    className={`${bg} rounded-lg p-4 text-white shadow-lg transition-colors duration-150 md:hover:scale-[1.01]`}
    title={titleTip}
  >
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-xs font-medium text-white/80 sm:text-sm">{title}</p>
        <h3 className={`truncate text-xl font-bold sm:text-2xl ${valueClassName ?? ''}`}>{value}</h3>
        {sub ? (
          <p className="mt-1 text-[10px] font-medium leading-snug text-white/75 sm:text-xs">{sub}</p>
        ) : null}
      </div>
      <div className="shrink-0 rounded-lg bg-white/10 p-2 backdrop-blur-sm">{icon}</div>
    </div>
  </div>
);

const OperativoKpiCard: React.FC<{
  title: string;
  value: string;
  icon: React.ReactNode;
  sub?: string;
}> = ({ title, value, icon, sub }) => (
  <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-4 shadow-sm">
    <div className="flex items-start gap-3">
      <div className="rounded-lg bg-[var(--bg-muted)] p-2 text-[var(--text-secondary)]">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-[var(--text-muted)]">{title}</p>
        <p className="text-lg font-bold text-[var(--text-primary)]">{value}</p>
        {sub ? <p className="mt-0.5 text-xs text-[var(--text-muted)]">{sub}</p> : null}
      </div>
    </div>
  </div>
);

function CobradoCell({ trip }: { trip: Trip }) {
  if (trip.facturaCobrada === true) {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-600" title="Cobrado">
        <CheckCircle2 size={18} aria-hidden />
        <span className="sr-only">Cobrado</span>
      </span>
    );
  }
  if (trip.facturaSolicitada === true) {
    return (
      <span className="inline-flex items-center gap-1 text-amber-600" title="Pendiente de cobro">
        <Clock size={18} aria-hidden />
        <span className="sr-only">Pendiente de cobro</span>
      </span>
    );
  }
  return <span className="text-[var(--text-muted)]">—</span>;
}

export const Dashboard: React.FC<DashboardProps> = ({
  trips,
  clients,
  costs,
  user,
  onUpdateTrip,
  offline = false,
  kpiPrecomputed,
  onOpenMonthlyReport,
  displayCurrency = 'USD',
  currentRate = 42,
  formatAmount: formatAmountProp,
  convertAggregateToDisplay: convertAggregateToDisplayProp,
}) => {
  const isAdmin = user.role === 'admin';
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [chartsReady, setChartsReady] = useState(false);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insights, setInsights] = useState<string[]>([]);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  const availableMonths = useMemo(() => getAvailableMonths(trips, costs), [trips, costs]);

  useEffect(() => {
    const months = getAvailableMonths(trips, costs);
    if (months.length > 0 && !selectedMonth) {
      setSelectedMonth(months[0]);
    }
  }, [trips, costs, selectedMonth]);

  const fmt = useMemo(() => {
    if (formatAmountProp && convertAggregateToDisplayProp) {
      return (n: number) => formatAmountProp(convertAggregateToDisplayProp(n));
    }
    return formatUsd;
  }, [formatAmountProp, convertAggregateToDisplayProp]);

  const kpi = useMemo(
    () =>
      kpiPrecomputed ?? buildKPIData(trips, clients, costs, selectedMonth || undefined),
    [kpiPrecomputed, trips, clients, costs, selectedMonth]
  );

  const monthly = useMemo(() => buildMonthlyStats(trips, costs, 6), [trips, costs]);

  const chartData = useMemo(
    () =>
      monthly.map((row) => ({
        label: row.label,
        totalGenerado: row.totalGenerado,
        totalCobrado: row.totalCobrado,
        costs: row.costs,
      })),
    [monthly]
  );

  const tripsInPeriod = useMemo(() => {
    if (!selectedMonth) return trips;
    return trips.filter((t) => t.fecha.startsWith(selectedMonth));
  }, [trips, selectedMonth]);

  const topRecent = useMemo(
    () =>
      [...tripsInPeriod]
        .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id))
        .slice(0, 5),
    [tripsInPeriod]
  );

  const clientNameById = useMemo(() => {
    const m = new Map<string, string>();
    clients.forEach((c) => m.set(c.id, c.nombreComercial));
    return m;
  }, [clients]);

  const periodEmpty =
    Boolean(selectedMonth) && tripsInPeriod.length === 0 && costs.filter((c) => c.fecha.startsWith(selectedMonth)).length === 0;

  const periodLabel = selectedMonth ? monthLabel(selectedMonth) : 'Todos los períodos';

  useEffect(() => {
    setChartsReady(false);
    const t = window.setTimeout(() => setChartsReady(true), 380);
    return () => window.clearTimeout(t);
  }, [trips, costs, selectedMonth]);

  const handleGenerateInsights = async () => {
    setInsightsLoading(true);
    setInsightsError(null);
    try {
      const lines = await generateLogisticsInsights(tripsInPeriod.length ? tripsInPeriod : trips, clients);
      setInsights(lines);
    } catch {
      setInsightsError('No se pudieron generar los insights. Intentá de nuevo.');
    } finally {
      setInsightsLoading(false);
    }
  };

  const todayStr = useMemo(() => localISODate(new Date()), []);

  const operativoKpis = useMemo(() => {
    const mine = (t: Trip) => !t.asignadoA || t.asignadoA === user.username;
    const active = trips.filter((t) => t.estado === 'En Tránsito' && mine(t)).length;
    const pending = trips.filter((t) => t.estado === 'Pendiente' && mine(t)).length;
    const finished = (t: Trip) => t.estado === 'Completado' || t.estado === 'Cerrado';

    if (offline && trips.length > 0) {
      const dataAsOf = trips.reduce((max, t) => (t.fecha > max ? t.fecha : max), trips[0].fecha);
      const end = new Date(`${dataAsOf}T12:00:00`);
      const start = new Date(end);
      start.setDate(start.getDate() - 90);
      const startStr = localISODate(start);
      const completedWindow = trips.filter(
        (t) => finished(t) && mine(t) && t.fecha >= startStr && t.fecha <= dataAsOf
      ).length;
      return {
        active,
        pending,
        completedCount: completedWindow,
        completedTitle: 'Completados (90 d.)',
        completedSub: 'Demo / offline: ventana desde la última fecha del dataset',
      };
    }

    const completedToday = trips.filter(
      (t) => t.estado === 'Completado' && t.fecha === todayStr && mine(t)
    ).length;
    return {
      active,
      pending,
      completedCount: completedToday,
      completedTitle: 'Completados hoy',
      completedSub: undefined as string | undefined,
    };
  }, [trips, todayStr, user.username, offline]);

  const operativoActiveTrips = useMemo(
    () =>
      trips.filter(
        (t) => t.estado === 'En Tránsito' && (!t.asignadoA || t.asignadoA === user.username)
      ),
    [trips, user.username]
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-lg font-bold text-[var(--text-primary)] sm:text-xl">Panel ejecutivo</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {isAdmin ? 'Vista financiera y operativa completa.' : 'Vista operativa — tus asignaciones.'}
            </p>
          </div>
          {isAdmin ? (
            <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
              <label className="flex flex-col gap-1 text-left sm:text-right">
                <span className="text-xs font-medium text-[var(--text-muted)]">Período</span>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="min-w-[180px] rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  disabled={availableMonths.length === 0}
                >
                  {availableMonths.length === 0 ? (
                    <option value="">Todos los períodos</option>
                  ) : (
                    availableMonths.map((ym) => (
                      <option key={ym} value={ym}>
                        {monthLabel(ym)}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <Button
                  variant="primary"
                  size="sm"
                  icon={<FileBarChart size={15} aria-hidden />}
                  disabled={trips.length === 0}
                  onClick={() => onOpenMonthlyReport?.()}
                >
                  Generar reporte
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {isAdmin ? (
        <>
          {periodEmpty ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100">
              No hay datos para {periodLabel}. Seleccioná otro mes.
            </div>
          ) : null}

          {/* Fila 1: KPIs financieros (5 cards) */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            <KpiCard
              title="Total Generado"
              value={fmt(kpi.totalGenerado)}
              titleTip="Ingresos generados por viajes en el período"
              icon={<Wallet className="h-6 w-6 text-blue-100" />}
              bg="bg-blue-900"
              sub={periodLabel}
            />
            <KpiCard
              title="Cobrado"
              value={fmt(kpi.totalCobrado)}
              icon={<CheckCircle2 className="h-6 w-6 text-emerald-100" />}
              bg="bg-emerald-700"
              sub={periodLabel}
            />
            <KpiCard
              title="Pendiente de Cobro"
              value={fmt(kpi.totalPendienteCobro)}
              icon={<Clock className="h-6 w-6 text-amber-100" />}
              bg="bg-amber-600"
              sub="Facturado sin cobrar"
            />
            <KpiCard
              title="Costos"
              value={fmt(kpi.totalCostos)}
              icon={<DollarSign className="h-6 w-6 text-slate-100" />}
              bg="bg-slate-700"
              sub={periodLabel}
            />
            <KpiCard
              title="Margen Neto"
              value={fmt(kpi.margenNeto)}
              sub={`${kpi.margenPct.toFixed(1)}% del generado`}
              icon={<TrendingUp className="h-6 w-6 text-cyan-100" />}
              bg="bg-cyan-800"
              valueClassName={kpi.margenNeto < 0 ? 'text-red-200' : undefined}
            />
          </div>

          {/* Fila 2: KPIs operativos */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <OperativoKpiCard
              title="Viajes realizados"
              value={String(kpi.viajesRealizados)}
              icon={<Truck size={20} />}
              sub={periodLabel}
            />
            <OperativoKpiCard
              title="Km recorridos"
              value={kpi.kmRecorridos.toLocaleString('es-UY')}
              icon={<Route size={20} />}
              sub={periodLabel}
            />
            <OperativoKpiCard
              title="Toneladas transportadas"
              value={kpi.toneladasTransportadas.toLocaleString('es-UY', { maximumFractionDigits: 1 })}
              icon={<Package size={20} />}
              sub={periodLabel}
            />
            <OperativoKpiCard
              title="Top cliente"
              value={kpi.topCliente?.name ?? '—'}
              icon={<Users size={20} />}
              sub={kpi.topCliente ? fmt(kpi.topCliente.revenue) : undefined}
            />
          </div>

          <div className="flex flex-col justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-xs text-[var(--text-muted)] sm:flex-row sm:items-center">
            <span>
              Valores en {displayCurrency === 'USD' ? 'dólares estadounidenses' : 'pesos uruguayos'}
              {displayCurrency === 'UYU' && (
                <span className="ml-1 font-mono">(TC referencia: {currentRate.toFixed(2)} UYU/USD)</span>
              )}
            </span>
            <span className="italic">Gráfico: últimos 6 meses · KPIs: {periodLabel}</span>
          </div>

          {/* Gráfico mensual (6 meses, sin filtro) */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 shadow-sm sm:p-6">
            <h2 className="mb-4 text-base font-semibold text-[var(--text-primary)]">
              Ingresos y costos — últimos 6 meses
            </h2>
            <div className="w-full overflow-x-auto overscroll-x-contain touch-pan-x">
              <div className="min-h-[240px] h-[260px] min-w-[520px]">
                {!chartsReady ? (
                  <DashboardChartSkeleton />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#64748b" />
                      <YAxis tick={{ fontSize: 11 }} stroke="#64748b" tickFormatter={(v) => `$${v}`} />
                      <Tooltip content={<ChartTooltipEs formatMoney={fmt} />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar
                        dataKey="totalGenerado"
                        name="Total generado"
                        fill="#059669"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="totalCobrado"
                        name="Cobrado"
                        fill="#2563eb"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar dataKey="costs" name="Costos" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* Tabla últimos viajes + insights IA */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 shadow-sm sm:p-6">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-[var(--text-primary)]">Últimos viajes</h2>
                <p className="text-xs text-[var(--text-muted)]">{periodLabel} · máximo 5 registros</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                disabled={insightsLoading || trips.length === 0}
                icon={
                  insightsLoading ? (
                    <Loader2 size={14} className="animate-spin" aria-hidden />
                  ) : (
                    <Sparkles size={14} aria-hidden />
                  )
                }
                onClick={() => void handleGenerateInsights()}
              >
                Generar insights IA
              </Button>
            </div>

            {insightsError ? (
              <p className="mb-3 text-sm text-red-600">{insightsError}</p>
            ) : null}
            {insights.length > 0 ? (
              <ul className="mb-4 space-y-2 rounded-lg border border-[color-mix(in_srgb,var(--accent-blue)_30%,transparent)] bg-[var(--accent-blue-muted)] p-3 text-sm text-[var(--text-primary)]">
                {insights.map((line, i) => (
                  <li key={i} className="flex gap-2">
                    <Sparkles size={14} className="mt-0.5 shrink-0 text-blue-600" aria-hidden />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            {!chartsReady ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-10 animate-pulse rounded bg-[var(--bg-muted)]" />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr
                      className="border-b border-[var(--border)]"
                      style={{ backgroundColor: 'var(--bg-elevated)' }}
                    >
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                        ID
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                        Fecha
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                        Cliente
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                        Ruta
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                        Estado
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                        Ingreso (USD)
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                        Cobrado
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                    {topRecent.map((t, i) => (
                      <tr
                        key={t.id}
                        style={{
                          backgroundColor: i % 2 === 0 ? 'var(--bg-table-row)' : 'var(--bg-table-alt)',
                        }}
                        className="hover:bg-[var(--bg-table-hover)] transition-colors duration-100"
                      >
                        <td className="px-4 py-3 font-mono text-xs text-[var(--text-muted)]">{t.id}</td>
                        <td className="px-4 py-3 text-[var(--text-primary)]">{t.fecha}</td>
                        <td className="px-4 py-3 text-[var(--text-primary)]">
                          {clientNameById.get(t.clientId) ?? 'Desconocido'}
                        </td>
                        <td className="px-4 py-3 text-[var(--text-primary)]">
                          {t.origen} → {t.destino}
                        </td>
                        <td className="px-4 py-3">
                          <Badge status={t.estado} />
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-[var(--text-primary)]">
                          {fmt(tripRevenueUSD(t))}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <CobradoCell trip={t} />
                        </td>
                      </tr>
                    ))}
                    {topRecent.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-muted)]">
                          No hay viajes en este período.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <KpiCard
              title="Viajes activos"
              value={`${operativoKpis.active}`}
              icon={<Truck className="h-6 w-6 text-blue-100" />}
              bg="bg-blue-900"
            />
            <KpiCard
              title="Pendientes"
              value={`${operativoKpis.pending}`}
              icon={<Clock className="h-6 w-6 text-amber-100" />}
              bg="bg-amber-600"
            />
            <KpiCard
              title={operativoKpis.completedTitle}
              value={`${operativoKpis.completedCount}`}
              sub={operativoKpis.completedSub}
              icon={<CheckCircle2 className="h-6 w-6 text-emerald-100" />}
              bg="bg-emerald-700"
            />
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 shadow-sm sm:p-6">
            <h2 className="mb-4 text-base font-semibold text-[var(--text-primary)]">Viajes en curso asignados</h2>
            {operativoActiveTrips.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">No tenés viajes en tránsito asignados.</p>
            ) : (
              <ul className="space-y-3">
                {operativoActiveTrips.map((t) => {
                  const client = clients.find((c) => c.id === t.clientId);
                  return (
                    <li
                      key={t.id}
                      className="flex flex-col gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-mono text-xs text-[var(--text-muted)]">{t.id}</p>
                        <p className="font-medium text-[var(--text-primary)]">{client?.nombreComercial ?? 'Cliente'}</p>
                        <p className="text-sm text-[var(--text-secondary)]">
                          {t.origen} → {t.destino} · {t.estado}
                        </p>
                      </div>
                      {onUpdateTrip ? (
                        <button
                          type="button"
                          onClick={() => void onUpdateTrip({ ...t, estado: 'Completado' })}
                          className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-emerald-700"
                        >
                          Marcar como completado
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
};
