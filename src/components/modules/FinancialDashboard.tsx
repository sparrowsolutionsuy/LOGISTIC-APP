import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import type { Client, Cost, Trip } from '../../types';
import { buildKPIData, buildMonthlyStats, enrichTrips, getCostsByCategory } from '../../utils/analytics';
import type { CostCategory } from '../../types';

const COL = {
  ingreso: '#10b981',
  costo: '#f59e0b',
  margen: '#3b82f6',
  v: '#8b5cf6',
  r: '#ef4444',
  c: '#06b6d4',
} as const;

const PIE_EXTRA = [COL.v, COL.r, COL.c, COL.ingreso, COL.costo, COL.margen];

const CATEGORY_FILL: Record<CostCategory, string> = {
  Combustible: '#f97316',
  Mantenimiento: '#3b82f6',
  Peajes: '#eab308',
  Viáticos: '#22c55e',
  Neumáticos: '#8b5cf6',
  Seguros: '#06b6d4',
  Otros: '#94a3b8',
};

type FinTab = 'resumen' | 'ingresos' | 'costos' | 'rentabilidad';

function tripRevenue(t: Trip): number {
  return t.tarifa * (t.pesoKg / 1000);
}

function sumCostsForTrip(costs: Cost[], tripId: string): number {
  return costs.filter((c) => c.tripId === tripId).reduce((a, c) => a + c.monto, 0);
}

function formatUsd(n: number): string {
  return n.toLocaleString('es-UY', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function marginRowClass(pct: number, revenue: number): string {
  if (revenue <= 0) {
    return 'text-slate-500';
  }
  if (pct > 30) {
    return 'text-emerald-600 font-semibold';
  }
  if (pct >= 10) {
    return 'text-amber-600 font-semibold';
  }
  return 'text-red-600 font-semibold';
}

const Kpi: React.FC<{ title: string; value: string; sub?: string }> = ({ title, value, sub }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
    <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
    {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
  </div>
);

const ChartBox: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({
  title,
  children,
  className = 'h-72',
}) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <h3 className="mb-3 text-sm font-semibold text-slate-800">{title}</h3>
    <div className={`w-full overflow-x-auto ${className}`}>
      <div className="min-w-[520px] h-full">{children}</div>
    </div>
  </div>
);

export interface FinancialDashboardProps {
  trips: Trip[];
  clients: Client[];
  costs: Cost[];
}

export const FinancialDashboard: React.FC<FinancialDashboardProps> = ({
  trips,
  clients,
  costs,
}) => {
  const [tab, setTab] = useState<FinTab>('resumen');

  const kpi = useMemo(() => buildKPIData(trips, clients, costs), [trips, clients, costs]);
  const monthly = useMemo(() => buildMonthlyStats(trips, costs, 6), [trips, costs]);
  const enriched = useMemo(() => enrichTrips(trips, clients, costs), [trips, clients, costs]);

  const areaData = useMemo(
    () =>
      monthly.map((m) => ({
        label: m.label,
        Ingresos: m.revenue,
        Costos: m.costs,
      })),
    [monthly]
  );

  const totalHistoricRevenue = useMemo(
    () => trips.reduce((s, t) => s + tripRevenue(t), 0),
    [trips]
  );
  const avgRevenuePerTrip = useMemo(
    () => (trips.length > 0 ? totalHistoricRevenue / trips.length : 0),
    [trips.length, totalHistoricRevenue]
  );

  const revenueByClient = useMemo(() => {
    const m = new Map<string, number>();
    trips.forEach((t) => {
      const r = tripRevenue(t);
      m.set(t.clientId, (m.get(t.clientId) ?? 0) + r);
    });
    return Array.from(m.entries())
      .map(([id, value]) => ({
        name: clients.find((c) => c.id === id)?.nombreComercial ?? id,
        value,
      }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [trips, clients]);

  const bestClientHistoric = useMemo(() => {
    const top = revenueByClient[0];
    return top ? { name: top.name, revenue: top.value } : null;
  }, [revenueByClient]);

  const totalCostsAll = useMemo(() => costs.reduce((s, c) => s + c.monto, 0), [costs]);
  const totalKm = useMemo(
    () => trips.filter((t) => t.kmRecorridos > 0).reduce((s, t) => s + t.kmRecorridos, 0),
    [trips]
  );
  const costPerKm = useMemo(
    () => (totalKm > 0 ? totalCostsAll / totalKm : 0),
    [totalCostsAll, totalKm]
  );
  const catBreakdown = useMemo(() => getCostsByCategory(costs), [costs]);
  const topCat = catBreakdown[0];

  const rentBarData = useMemo(
    () =>
      monthly.map((m) => ({
        label: m.label,
        Ingresos: m.revenue,
        Costos: m.costs,
        Margen: m.margin,
      })),
    [monthly]
  );

  const marginEvolution = useMemo(
    () => monthly.map((m) => ({ label: m.label, 'Margen %': Number(m.marginPct.toFixed(1)) })),
    [monthly]
  );

  const top5Routes = useMemo(() => {
    const m = new Map<string, { revenue: number; cost: number }>();
    trips.forEach((t) => {
      const key = `${t.origen} → ${t.destino}`;
      const cur = m.get(key) ?? { revenue: 0, cost: 0 };
      cur.revenue += tripRevenue(t);
      cur.cost += sumCostsForTrip(costs, t.id);
      m.set(key, cur);
    });
    return Array.from(m.entries())
      .map(([route, v]) => ({
        route,
        revenue: v.revenue,
        cost: v.cost,
        margin: v.revenue - v.cost,
        marginPct: v.revenue > 0 ? ((v.revenue - v.cost) / v.revenue) * 100 : 0,
      }))
      .sort((a, b) => b.margin - a.margin)
      .slice(0, 5);
  }, [trips, costs]);

  const tabs: { id: FinTab; label: string }[] = [
    { id: 'resumen', label: 'Resumen' },
    { id: 'ingresos', label: 'Ingresos' },
    { id: 'costos', label: 'Costos' },
    { id: 'rentabilidad', label: 'Rentabilidad' },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Finanzas</h1>
        <p className="text-sm text-slate-500">Análisis consolidado de ingresos, costos y rentabilidad.</p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-white text-blue-800 shadow-sm ring-1 ring-slate-200'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'resumen' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi title="Ingresos MTD" value={formatUsd(kpi.totalRevenueMTD)} />
            <Kpi title="Costos MTD" value={formatUsd(kpi.totalCostsMTD)} />
            <Kpi title="Margen neto MTD" value={formatUsd(kpi.netMarginMTD)} />
            <Kpi title="Margen %" value={`${kpi.marginPctMTD.toFixed(1)}%`} />
          </div>
          <ChartBox title="Ingresos vs costos (6 meses)">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={areaData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="fdIng" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COL.ingreso} stopOpacity={0.45} />
                    <stop offset="95%" stopColor={COL.ingreso} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="fdCost" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COL.costo} stopOpacity={0.45} />
                    <stop offset="95%" stopColor={COL.costo} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v: number) => formatUsd(v)} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="Ingresos"
                  stroke={COL.ingreso}
                  fill="url(#fdIng)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="Costos"
                  stroke={COL.costo}
                  fill="url(#fdCost)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartBox>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-800">Rentabilidad por viaje</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="p-3">Viaje</th>
                    <th className="p-3">Cliente</th>
                    <th className="p-3 text-right">Ingreso</th>
                    <th className="p-3 text-right">Costos</th>
                    <th className="p-3 text-right">Margen</th>
                    <th className="p-3 text-right">Margen %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {enriched.map((row) => {
                    const rev = tripRevenue(row);
                    const pct = row.marginPct;
                    return (
                      <tr key={row.id}>
                        <td className="p-3 font-mono text-xs text-slate-500">{row.id}</td>
                        <td className="p-3 text-slate-800">{row.clientName}</td>
                        <td className="p-3 text-right">{formatUsd(rev)}</td>
                        <td className="p-3 text-right">{formatUsd(row.totalCosts)}</td>
                        <td className="p-3 text-right">{formatUsd(row.netMargin)}</td>
                        <td className={`p-3 text-right ${marginRowClass(pct, rev)}`}>
                          {rev > 0 ? `${pct.toFixed(1)}%` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'ingresos' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Kpi title="Total histórico (ingresos)" value={formatUsd(totalHistoricRevenue)} />
            <Kpi title="Promedio por viaje" value={formatUsd(avgRevenuePerTrip)} />
            <Kpi
              title="Mejor cliente (histórico)"
              value={bestClientHistoric?.name ?? '—'}
              sub={bestClientHistoric ? formatUsd(bestClientHistoric.revenue) : undefined}
            />
          </div>
          <ChartBox title="Ingresos mensuales">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly.map((m) => ({ label: m.label, Ingresos: m.revenue }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v: number) => formatUsd(v)} />
                <Bar dataKey="Ingresos" fill={COL.ingreso} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
          <ChartBox title="Distribución de ingresos por cliente">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={revenueByClient}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={(props) => {
                    const name = String(props.name ?? '');
                    const pct = typeof props.percent === 'number' ? props.percent * 100 : 0;
                    return `${name} (${pct.toFixed(0)}%)`;
                  }}
                >
                  {revenueByClient.map((_, i) => (
                    <Cell key={i} fill={PIE_EXTRA[i % PIE_EXTRA.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatUsd(v)} />
              </PieChart>
            </ResponsiveContainer>
          </ChartBox>
        </div>
      )}

      {tab === 'costos' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Kpi title="Total costos" value={formatUsd(totalCostsAll)} />
            <Kpi title="Costo / km promedio" value={totalKm > 0 ? formatUsd(costPerKm) : '—'} />
            <Kpi
              title="Categoría con mayor gasto"
              value={topCat?.category ?? '—'}
              sub={topCat ? formatUsd(topCat.total) : undefined}
            />
          </div>
          <ChartBox title="Costos mensuales">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly.map((m) => ({ label: m.label, Costos: m.costs }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v: number) => formatUsd(v)} />
                <Bar dataKey="Costos" fill={COL.costo} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
          <ChartBox title="Distribución por categoría">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={catBreakdown}
                  dataKey="total"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={(props) => {
                    const name = String(props.name ?? '');
                    const pct = typeof props.percent === 'number' ? props.percent * 100 : 0;
                    return `${name} (${pct.toFixed(0)}%)`;
                  }}
                >
                  {catBreakdown.map((entry) => (
                    <Cell
                      key={entry.category}
                      fill={CATEGORY_FILL[entry.category as CostCategory] ?? COL.v}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatUsd(v)} />
              </PieChart>
            </ResponsiveContainer>
          </ChartBox>
        </div>
      )}

      {tab === 'rentabilidad' && (
        <div className="space-y-6">
          <ChartBox title="Comparativo mensual: ingresos, costos y margen">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rentBarData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v: number) => formatUsd(v)} />
                <Legend />
                <Bar dataKey="Ingresos" fill={COL.ingreso} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Costos" fill={COL.costo} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Margen" fill={COL.margen} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
          <ChartBox title="Evolución del % de margen mensual">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={marginEvolution}>
                <defs>
                  <linearGradient id="fdMargPct" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COL.margen} stopOpacity={0.5} />
                    <stop offset="95%" stopColor={COL.margen} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit="%" />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Area
                  type="monotone"
                  dataKey="Margen %"
                  stroke={COL.margen}
                  fill="url(#fdMargPct)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartBox>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-800">Top 5 rutas más rentables</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="p-3 text-left">Ruta</th>
                    <th className="p-3 text-right">Ingresos</th>
                    <th className="p-3 text-right">Costos</th>
                    <th className="p-3 text-right">Margen</th>
                    <th className="p-3 text-right">Margen %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {top5Routes.map((r) => (
                    <tr key={r.route}>
                      <td className="p-3 font-medium text-slate-800">{r.route}</td>
                      <td className="p-3 text-right">{formatUsd(r.revenue)}</td>
                      <td className="p-3 text-right">{formatUsd(r.cost)}</td>
                      <td className="p-3 text-right text-blue-700">{formatUsd(r.margin)}</td>
                      <td className={`p-3 text-right ${marginRowClass(r.marginPct, r.revenue)}`}>
                        {r.revenue > 0 ? `${r.marginPct.toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
