import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Legend,
} from 'recharts';
import type { TooltipProps } from 'recharts';
import type { Client, Cost, KPIData, Trip, TripWithMetrics, User } from '../../types';
import { buildKPIData, buildMonthlyStats, enrichTrips } from '../../utils/analytics';
import { generateLogisticsInsights } from '../../services/geminiService';
import {
  DollarSign,
  Truck,
  Percent,
  Wallet,
  Sparkles,
  CheckCircle2,
  Clock,
  Loader2,
} from 'lucide-react';

export interface DashboardProps {
  trips: Trip[];
  clients: Client[];
  costs: Cost[];
  user: User;
  /** Marcar viaje como completado (vista operativa). */
  onUpdateTrip?: (trip: Trip) => void | Promise<void>;
  /** Opcional: evita recalcular en el hijo si el padre ya memoizó. */
  enrichedTrips?: TripWithMetrics[];
  kpiPrecomputed?: KPIData;
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

const ChartTooltipEs: React.FC<ChartTooltipProps> = ({ active, payload, label }) => {
  if (!active || !payload?.length) {
    return null;
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-md">
      <p className="mb-1 font-semibold text-slate-800">{label}</p>
      <ul className="space-y-0.5 text-slate-600">
        {payload.map((p) => (
          <li key={String(p.dataKey)}>
            <span className="text-slate-500">{p.name}: </span>
            <span className="font-medium text-slate-900">
              {typeof p.value === 'number'
                ? String(p.dataKey) === 'Viajes' ||
                  String(p.name ?? '')
                    .toLowerCase()
                    .includes('viaje')
                  ? p.value
                  : formatUsd(p.value)
                : p.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

const DashboardChartSkeleton: React.FC = () => (
  <div className="flex min-h-[200px] w-full animate-pulse flex-col gap-4 rounded-lg border border-slate-100 bg-slate-50 p-4">
    <div className="flex flex-1 items-end justify-between gap-2 pt-8">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex-1 rounded-t bg-slate-200"
          style={{ height: `${30 + ((i * 17) % 55)}%` }}
        />
      ))}
    </div>
    <div className="h-3 w-2/3 rounded bg-slate-200" />
  </div>
);

const KpiCard: React.FC<{
  title: string;
  value: string;
  icon: React.ReactNode;
  bg: string;
}> = ({ title, value, icon, bg }) => (
  <div
    className={`${bg} rounded-lg p-4 text-white shadow-lg transition-colors duration-150 md:hover:scale-[1.01]`}
  >
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-xs font-medium text-white/80 sm:text-sm">{title}</p>
        <h3 className="truncate text-xl font-bold sm:text-2xl">{value}</h3>
      </div>
      <div className="shrink-0 rounded-lg bg-white/10 p-2 backdrop-blur-sm">{icon}</div>
    </div>
  </div>
);

export const Dashboard: React.FC<DashboardProps> = ({
  trips,
  clients,
  costs,
  user,
  onUpdateTrip,
  enrichedTrips: enrichedTripsProp,
  kpiPrecomputed,
}) => {
  const isAdmin = user.role === 'admin';
  const [chartsReady, setChartsReady] = useState(false);
  const [iaLoading, setIaLoading] = useState(false);
  const [iaLines, setIaLines] = useState<string[]>([]);

  useEffect(() => {
    setChartsReady(false);
    const t = window.setTimeout(() => setChartsReady(true), 380);
    return () => window.clearTimeout(t);
  }, [trips, clients, costs]);

  const kpi = useMemo(
    () => kpiPrecomputed ?? buildKPIData(trips, clients, costs),
    [kpiPrecomputed, trips, clients, costs]
  );
  const monthly = useMemo(() => buildMonthlyStats(trips, costs, 6), [trips, costs]);
  const enriched = useMemo(
    () => enrichedTripsProp ?? enrichTrips(trips, clients, costs),
    [enrichedTripsProp, trips, clients, costs]
  );
  const enrichedById = useMemo(() => {
    const m = new Map<string, (typeof enriched)[0]>();
    enriched.forEach((e) => m.set(e.id, e));
    return m;
  }, [enriched]);

  const areaData = useMemo(
    () =>
      monthly.map((row) => ({
        label: row.label,
        Ingresos: row.revenue,
        Costos: row.costs,
      })),
    [monthly]
  );

  const barData = useMemo(
    () =>
      monthly.map((row) => ({
        label: row.label,
        Viajes: row.tripCount,
      })),
    [monthly]
  );

  const topRecent = useMemo(() => {
    return [...trips]
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id))
      .slice(0, 5);
  }, [trips]);

  const todayStr = useMemo(() => localISODate(new Date()), []);
  const operativoKpis = useMemo(() => {
    const mine = (t: Trip) => !t.asignadoA || t.asignadoA === user.username;
    const active = trips.filter((t) => t.estado === 'En Tránsito' && mine(t)).length;
    const pending = trips.filter((t) => t.estado === 'Pendiente' && mine(t)).length;
    const completedToday = trips.filter(
      (t) => t.estado === 'Completado' && t.fecha === todayStr && mine(t)
    ).length;
    return { active, pending, completedToday };
  }, [trips, todayStr, user.username]);

  const operativoActiveTrips = useMemo(
    () =>
      trips.filter(
        (t) =>
          t.estado === 'En Tránsito' &&
          (!t.asignadoA || t.asignadoA === user.username)
      ),
    [trips, user.username]
  );

  const handleGenerarIA = useCallback(async () => {
    setIaLoading(true);
    try {
      const lines = await generateLogisticsInsights(trips, clients);
      setIaLines(lines.slice(0, 3));
    } catch (e) {
      console.error(e);
      setIaLines([]);
    } finally {
      setIaLoading(false);
    }
  }, [trips, clients]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h1 className="text-lg font-bold text-slate-900 sm:text-xl">Panel ejecutivo</h1>
        <p className="mt-1 text-sm text-slate-500">
          {isAdmin ? 'Vista financiera y operativa completa.' : 'Vista operativa — tus asignaciones.'}
        </p>
      </div>

      {isAdmin ? (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard
              title="Ingresos MTD"
              value={formatUsd(kpi.totalRevenueMTD)}
              icon={<Wallet className="h-6 w-6 text-emerald-100" />}
              bg="bg-emerald-700"
            />
            <KpiCard
              title="Costos MTD"
              value={formatUsd(kpi.totalCostsMTD)}
              icon={<DollarSign className="h-6 w-6 text-amber-100" />}
              bg="bg-slate-700"
            />
            <KpiCard
              title="Margen %"
              value={`${kpi.marginPctMTD.toFixed(1)}%`}
              icon={<Percent className="h-6 w-6 text-cyan-100" />}
              bg="bg-cyan-800"
            />
            <KpiCard
              title="Viajes activos"
              value={`${kpi.activeTrips}`}
              icon={<Truck className="h-6 w-6 text-blue-100" />}
              bg="bg-blue-900"
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <h2 className="mb-4 text-base font-semibold text-slate-800">
                Ingresos vs costos (últimos 6 meses)
              </h2>
              <div className="w-full overflow-x-auto overscroll-x-contain touch-pan-x">
                <div className="min-h-[200px] h-[220px] min-w-[520px]">
                  {!chartsReady ? (
                    <DashboardChartSkeleton />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={areaData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="dashIng" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#059669" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="dashCost" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#dc2626" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#64748b" />
                        <YAxis tick={{ fontSize: 11 }} stroke="#64748b" tickFormatter={(v) => `$${v}`} />
                        <Tooltip content={<ChartTooltipEs />} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Area
                          type="monotone"
                          dataKey="Ingresos"
                          name="Ingresos"
                          stroke="#059669"
                          fill="url(#dashIng)"
                        />
                        <Area
                          type="monotone"
                          dataKey="Costos"
                          name="Costos"
                          stroke="#dc2626"
                          fill="url(#dashCost)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <h2 className="mb-4 text-base font-semibold text-slate-800">Viajes por mes</h2>
              <div className="w-full overflow-x-auto overscroll-x-contain touch-pan-x">
                <div className="min-h-[200px] h-[220px] min-w-[520px]">
                  {!chartsReady ? (
                    <DashboardChartSkeleton />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={barData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#64748b" />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#64748b" />
                        <Tooltip content={<ChartTooltipEs />} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="Viajes" name="Cantidad de viajes" fill="#1d4ed8" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-base font-semibold text-slate-800">Top 5 viajes recientes</h2>
              <button
                type="button"
                onClick={() => void handleGenerarIA()}
                disabled={iaLoading || trips.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {iaLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Generar insights IA
              </button>
            </div>

            {!chartsReady ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-10 animate-pulse rounded bg-slate-100" />
                ))}
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-[var(--border)] shadow-[var(--shadow-sm)]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr
                        className="border-b border-[var(--border)]"
                        style={{ backgroundColor: 'var(--bg-elevated)' }}
                      >
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                          Viaje
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                          Fecha
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                          Estado
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                          Margen (USD)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                      {topRecent.map((t, i) => {
                        const m = enrichedById.get(t.id);
                        return (
                          <tr
                            key={t.id}
                            style={{
                              backgroundColor: i % 2 === 0 ? 'var(--bg-table-row)' : 'var(--bg-table-alt)',
                            }}
                            className="hover:bg-[var(--bg-table-hover)] transition-colors duration-100"
                          >
                            <td className="px-4 py-3 font-mono text-xs text-[var(--text-muted)]">{t.id}</td>
                            <td className="px-4 py-3 text-[var(--text-primary)]">{t.fecha}</td>
                            <td className="px-4 py-3 text-[var(--text-primary)]">{t.estado}</td>
                            <td className="px-4 py-3 text-right font-medium text-[var(--text-primary)]">
                              {m ? formatUsd(m.netMargin) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {(iaLoading || iaLines.length > 0) && (
              <div className="mt-6 border-t border-slate-100 pt-6">
                <h3 className="mb-3 text-sm font-semibold text-slate-700">Insights generados</h3>
                {iaLoading ? (
                  <div className="grid gap-3 sm:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-24 animate-pulse rounded-lg bg-slate-100" />
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {iaLines.map((text, i) => (
                      <div
                        key={i}
                        className="rounded-lg border border-indigo-100 bg-indigo-50/80 p-4 text-sm text-slate-800 shadow-sm"
                      >
                        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-indigo-700">
                          Insight {i + 1}
                        </p>
                        <p>{text}</p>
                      </div>
                    ))}
                  </div>
                )}
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
              title="Completados hoy"
              value={`${operativoKpis.completedToday}`}
              icon={<CheckCircle2 className="h-6 w-6 text-emerald-100" />}
              bg="bg-emerald-700"
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <h2 className="mb-4 text-base font-semibold text-slate-800">Viajes en curso asignados</h2>
            {operativoActiveTrips.length === 0 ? (
              <p className="text-sm text-slate-500">No tenés viajes en tránsito asignados.</p>
            ) : (
              <ul className="space-y-3">
                {operativoActiveTrips.map((t) => {
                  const client = clients.find((c) => c.id === t.clientId);
                  return (
                    <li
                      key={t.id}
                      className="flex flex-col gap-3 rounded-lg border border-slate-100 bg-slate-50/80 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-mono text-xs text-slate-500">{t.id}</p>
                        <p className="font-medium text-slate-900">{client?.nombreComercial ?? 'Cliente'}</p>
                        <p className="text-sm text-slate-600">
                          {t.origen} → {t.destino} · {t.estado}
                        </p>
                      </div>
                      {onUpdateTrip && (
                        <button
                          type="button"
                          onClick={() => void onUpdateTrip({ ...t, estado: 'Completado' })}
                          className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-emerald-700"
                        >
                          Marcar como completado
                        </button>
                      )}
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
