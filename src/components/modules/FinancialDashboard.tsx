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
import {
  buildKPIData,
  buildMonthlyStats,
  buildWeeklyBucketsInMonth,
  enrichTrips,
  formatMonthLongEs,
  getCostsByCategory,
  isCobrado,
  isPendienteCobro,
  monthLabel,
  tripRevenueUSD,
} from '../../utils/analytics';
import { usePeriodFilter } from '../../hooks/usePeriodFilter';
import { PeriodSelector } from '../ui/PeriodSelector';
import type { CostCategory } from '../../types';
import { CheckCircle2, Clock, Minus } from 'lucide-react';

const COL = {
  ingreso: '#10b981',
  cobrado: '#3b82f6',
  costo: '#f59e0b',
  margen: '#3b82f6',
  v: '#8b5cf6',
  r: '#ef4444',
  c: '#06b6d4',
} as const;

const PIE_EXTRA = [COL.v, COL.r, COL.c, COL.ingreso, COL.costo, COL.margen];

const CATEGORY_FILL: Record<CostCategory, string> = {
  Combustible: '#f97316',
  Sueldos: '#6366f1',
  Alquiler: '#a855f7',
  'Cuota Banco': '#ec4899',
  Service: '#14b8a6',
  Mantenimiento: '#3b82f6',
  'AD Blue': '#0ea5e9',
  Otros: '#94a3b8',
};

type FinTab = 'resumen' | 'ingresos' | 'costos' | 'rentabilidad';

function formatUsd(n: number): string {
  return n.toLocaleString('es-UY', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

/** Devuelve las `count` claves YYYY-MM (ascendente) que terminan en `endKey`. */
function monthKeysEndingAt(endKey: string, count: number): string[] {
  const [ys, ms] = endKey.split('-');
  let y = Number(ys);
  let mo = Number(ms);
  if (!Number.isFinite(y) || !Number.isFinite(mo)) return [];
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.unshift(`${y}-${String(mo).padStart(2, '0')}`);
    mo -= 1;
    if (mo === 0) {
      mo = 12;
      y -= 1;
    }
  }
  return out;
}

function marginRowStyle(pct: number, revenue: number): React.CSSProperties {
  if (revenue <= 0) {
    return { color: 'var(--text-muted)' };
  }
  if (pct > 30) {
    return { color: 'var(--accent-emerald)', fontWeight: 600 };
  }
  if (pct >= 10) {
    return { color: 'var(--accent-amber)', fontWeight: 600 };
  }
  return { color: 'var(--accent-red)', fontWeight: 600 };
}

type KpiTone = 'default' | 'positive' | 'negative' | 'warning' | 'accent';

const TONE_COLOR: Record<KpiTone, string> = {
  default: 'var(--text-primary)',
  positive: 'var(--accent-emerald)',
  negative: 'var(--accent-red)',
  warning: 'var(--accent-amber)',
  accent: 'var(--accent-blue)',
};

const Kpi: React.FC<{ title: string; value: string; sub?: string; tone?: KpiTone }> = ({
  title,
  value,
  sub,
  tone = 'default',
}) => (
  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 shadow-sm">
    <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">{title}</p>
    <p className="mt-1 text-xl font-bold" style={{ color: TONE_COLOR[tone] }}>
      {value}
    </p>
    {sub && <p className="mt-1 text-xs text-[var(--text-muted)]">{sub}</p>}
  </div>
);

function CobradoStatusCell({ trip }: { trip: Trip }) {
  if (isCobrado(trip)) {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-600" title="Cobrado">
        <CheckCircle2 size={18} aria-hidden />
        <span className="sr-only">Cobrado</span>
      </span>
    );
  }
  if (isPendienteCobro(trip)) {
    return (
      <span className="inline-flex items-center gap-1 text-amber-600" title="Pendiente de cobro">
        <Clock size={18} aria-hidden />
        <span className="sr-only">Pendiente de cobro</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-[var(--text-muted)]" title="Sin facturar">
      <Minus size={18} aria-hidden />
      <span className="sr-only">Sin facturar</span>
    </span>
  );
}

const ChartBox: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({
  title,
  children,
  className = 'h-72',
}) => (
  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 shadow-sm">
    <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
    <div className={`w-full overflow-x-auto ${className}`}>
      <div className="min-w-[520px] h-full">{children}</div>
    </div>
  </div>
);

export interface FinancialDashboardProps {
  trips: Trip[];
  clients: Client[];
  costs: Cost[];
  formatAmount?: (n: number) => string;
  formatAmountPrecise?: (n: number) => string;
  convertAggregateToDisplay?: (amountUSD: number) => number;
}

export const FinancialDashboard: React.FC<FinancialDashboardProps> = ({
  trips,
  clients,
  costs,
  formatAmount: formatAmountProp,
  formatAmountPrecise: formatAmountPreciseProp,
  convertAggregateToDisplay: convertAggregateToDisplayProp,
}) => {
  const [tab, setTab] = useState<FinTab>('resumen');
  const { selectedMonth, setSelectedMonth, availableMonths, isAllTime, filteredTrips, filteredCosts } =
    usePeriodFilter(trips, costs);

  const fmtMoney = useMemo(() => {
    if (formatAmountProp && convertAggregateToDisplayProp) {
      return (n: number) => formatAmountProp(convertAggregateToDisplayProp(n));
    }
    return formatUsd;
  }, [formatAmountProp, convertAggregateToDisplayProp]);

  // Formato con 2 decimales para ratios por unidad (costo/km, margen/km).
  const fmtMoneyPrecise = useMemo(() => {
    if (formatAmountPreciseProp && convertAggregateToDisplayProp) {
      return (n: number) => formatAmountPreciseProp(convertAggregateToDisplayProp(n));
    }
    return (n: number) =>
      n.toLocaleString('es-UY', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
  }, [formatAmountPreciseProp, convertAggregateToDisplayProp]);

  const scopeTrips = isAllTime ? trips : filteredTrips;
  const periodTripCount = scopeTrips.length;

  // KPIs del PERÍODO seleccionado (mes elegido o "todos los períodos").
  const kpi = useMemo(
    () => buildKPIData(trips, clients, costs, selectedMonth),
    [trips, clients, costs, selectedMonth]
  );

  const enriched = useMemo(
    () => enrichTrips(scopeTrips, clients, costs),
    [scopeTrips, clients, costs]
  );

  const periodEmpty =
    !isAllTime && filteredTrips.length === 0 && filteredCosts.length === 0;

  const periodSub = isAllTime ? 'Todos los períodos' : formatMonthLongEs(selectedMonth);

  // ─── Métricas de valor derivadas (período) ───────────────────────────────
  const collectionRate = kpi.totalGenerado > 0 ? (kpi.totalCobrado / kpi.totalGenerado) * 100 : 0;
  const costRatioPnl = kpi.totalGenerado > 0 ? (kpi.totalCostos / kpi.totalGenerado) * 100 : 0;
  const ticketPromedio = periodTripCount > 0 ? kpi.totalGenerado / periodTripCount : 0;
  const marginPerTrip = periodTripCount > 0 ? kpi.margenNeto / periodTripCount : 0;

  // ─── Ventana de tendencia: 6 meses que terminan en el mes seleccionado ────
  const trendMonthly = useMemo(() => {
    if (isAllTime) return buildMonthlyStats(trips, costs, 6, null, true);
    const keys = monthKeysEndingAt(selectedMonth, 6);
    return keys.map((k) => buildMonthlyStats(trips, costs, 1, k)[0]).filter(Boolean);
  }, [trips, costs, isAllTime, selectedMonth]);

  const trendSuffix = isAllTime
    ? '(histórico)'
    : `(6 meses hasta ${monthLabel(selectedMonth)})`;

  const barOpacity = (month: string) => (isAllTime || month === selectedMonth ? 1 : 0.4);

  const areaData = useMemo(
    () =>
      trendMonthly.map((m) => ({
        month: m.month,
        label: m.label,
        totalGenerado: m.totalGenerado,
        totalCobrado: m.totalCobrado,
        costs: m.costs,
      })),
    [trendMonthly]
  );

  const revenueByClient = useMemo(() => {
    const m = new Map<string, number>();
    scopeTrips.forEach((t) => {
      const r = tripRevenueUSD(t);
      m.set(t.clientId, (m.get(t.clientId) ?? 0) + r);
    });
    return Array.from(m.entries())
      .map(([id, value]) => ({
        name: clients.find((c) => c.id === id)?.nombreComercial ?? id,
        value,
      }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [scopeTrips, clients]);

  const revenueByProduct = useMemo(() => {
    const m = new Map<string, number>();
    scopeTrips.forEach((t) => {
      const key = t.contenido?.trim() || 'Sin especificar';
      const revenue = tripRevenueUSD(t);
      m.set(key, (m.get(key) ?? 0) + revenue);
    });
    return Array.from(m.entries())
      .map(([name, value]) => ({ name, value }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [scopeTrips]);

  const weeklyIngresos = useMemo(
    () =>
      !isAllTime && /^\d{4}-\d{2}$/.test(selectedMonth)
        ? buildWeeklyBucketsInMonth(trips, costs, selectedMonth)
        : [],
    [trips, costs, isAllTime, selectedMonth]
  );

  const totalCostsAll = useMemo(
    () => filteredCosts.reduce((s, c) => s + (c.montoUSD ?? 0), 0),
    [filteredCosts]
  );
  const totalKm = useMemo(
    () =>
      (isAllTime ? trips : filteredTrips)
        .filter((t) => t.kmRecorridos > 0)
        .reduce((s, t) => s + t.kmRecorridos, 0),
    [trips, filteredTrips, isAllTime]
  );
  const costPerKm = useMemo(
    () => (totalKm > 0 ? totalCostsAll / totalKm : 0),
    [totalCostsAll, totalKm]
  );
  const catBreakdown = useMemo(() => getCostsByCategory(filteredCosts), [filteredCosts]);
  const topCat = catBreakdown[0];

  const rentBarData = useMemo(
    () =>
      trendMonthly.map((m) => ({
        month: m.month,
        label: m.label,
        Ingresos: m.totalGenerado,
        Costos: m.costs,
        Margen: m.margin,
      })),
    [trendMonthly]
  );

  const marginEvolution = useMemo(
    () =>
      trendMonthly.map((m) => ({
        month: m.month,
        label: m.label,
        'Margen %': Number(m.marginPct.toFixed(1)),
      })),
    [trendMonthly]
  );

  const ingresosBar = useMemo(
    () =>
      trendMonthly.map((m) => ({
        month: m.month,
        label: m.label,
        Ingresos: m.totalGenerado,
        Cobrado: m.totalCobrado,
      })),
    [trendMonthly]
  );

  const costosBar = useMemo(
    () => trendMonthly.map((m) => ({ month: m.month, label: m.label, Costos: m.costs })),
    [trendMonthly]
  );

  const marginPerKm = totalKm > 0 ? kpi.margenNeto / totalKm : 0;
  const costPerTrip = periodTripCount > 0 ? totalCostsAll / periodTripCount : 0;
  const costRatioReg = kpi.totalGenerado > 0 ? (totalCostsAll / kpi.totalGenerado) * 100 : 0;

  const enrichedById = useMemo(() => {
    const m = new Map<string, (typeof enriched)[0]>();
    enriched.forEach((e) => m.set(e.id, e));
    return m;
  }, [enriched]);

  const top5Routes = useMemo(() => {
    const m = new Map<string, { revenue: number; pending: number; cost: number }>();
    scopeTrips.forEach((t) => {
      const key = `${t.origen} → ${t.destino}`;
      const cur = m.get(key) ?? { revenue: 0, pending: 0, cost: 0 };
      const rev = tripRevenueUSD(t);
      cur.revenue += rev;
      if (isPendienteCobro(t)) {
        cur.pending += rev;
      }
      cur.cost += enrichedById.get(t.id)?.totalCosts ?? 0;
      m.set(key, cur);
    });
    return Array.from(m.entries())
      .map(([route, v]) => {
        const gross = v.revenue;
        const margin = gross - v.cost;
        const marginPct = gross > 0 ? (margin / gross) * 100 : 0;
        return {
          route,
          revenue: v.revenue,
          pending: v.pending,
          cost: v.cost,
          margin,
          marginPct,
        };
      })
      .sort((a, b) => b.margin - a.margin)
      .slice(0, 5);
  }, [scopeTrips, enrichedById]);

  const bestRoute = top5Routes[0];

  const tabs: { id: FinTab; label: string }[] = [
    { id: 'resumen', label: 'Resumen' },
    { id: 'ingresos', label: 'Ingresos' },
    { id: 'costos', label: 'Costos' },
    { id: 'rentabilidad', label: 'Rentabilidad' },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Finanzas</h1>
        <p className="text-sm text-[var(--text-muted)]">Análisis consolidado de ingresos, costos y rentabilidad.</p>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
        <PeriodSelector
          label="Período de análisis"
          value={selectedMonth}
          onChange={setSelectedMonth}
          availableMonths={availableMonths}
          forceDropdown
        />
      </div>

      {periodEmpty ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100">
          No hay datos para este período. Seleccioná otro mes o &quot;Todos los períodos&quot;.
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-[var(--bg-surface)] text-[var(--accent-blue)] shadow-sm ring-1 ring-[var(--border)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'resumen' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Kpi title="Total Generado" value={fmtMoney(kpi.totalGenerado)} sub={periodSub} />
            <Kpi
              title="Total Cobrado"
              value={fmtMoney(kpi.totalCobrado)}
              sub={`${collectionRate.toFixed(0)}% del generado`}
              tone="positive"
            />
            <Kpi
              title="Pendiente de Cobro"
              value={fmtMoney(kpi.totalPendienteCobro)}
              sub="Facturado sin cobrar"
              tone="warning"
            />
            <Kpi
              title="Total Costos"
              value={fmtMoney(kpi.totalCostos)}
              sub={kpi.totalGenerado > 0 ? `${costRatioPnl.toFixed(0)}% de los ingresos` : periodSub}
            />
            <Kpi
              title="Margen Neto"
              value={fmtMoney(kpi.margenNeto)}
              sub="Generado − costos"
              tone={kpi.margenNeto >= 0 ? 'positive' : 'negative'}
            />
            <Kpi
              title="Margen %"
              value={`${kpi.margenPct.toFixed(1)}%`}
              sub="Sobre total generado"
              tone={kpi.margenPct >= 20 ? 'positive' : kpi.margenPct >= 10 ? 'warning' : 'negative'}
            />
          </div>
          <ChartBox title={`Ingresos vs costos ${trendSuffix}`}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={areaData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="fdGen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COL.ingreso} stopOpacity={0.45} />
                    <stop offset="95%" stopColor={COL.ingreso} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="fdCob" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COL.cobrado} stopOpacity={0.45} />
                    <stop offset="95%" stopColor={COL.cobrado} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="fdCost" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COL.costo} stopOpacity={0.45} />
                    <stop offset="95%" stopColor={COL.costo} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v: number) => fmtMoney(v)} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="totalGenerado"
                  name="Total generado"
                  stroke={COL.ingreso}
                  fill="url(#fdGen)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="totalCobrado"
                  name="Cobrado"
                  stroke={COL.cobrado}
                  fill="url(#fdCob)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="costs"
                  name="Costos"
                  stroke={COL.costo}
                  fill="url(#fdCost)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartBox>
          <div className="overflow-hidden rounded-xl border border-[var(--border)] shadow-[var(--shadow-sm)]">
            <div className="border-b border-[var(--border)] px-4 py-3">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Rentabilidad por viaje — {periodSub}
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-elevated)' }}>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                      Viaje
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                      Cliente
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                      Ingreso (USD)
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                      Estado Cobro
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                      Costos
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                      Margen
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                      Margen %
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                  {enriched.map((row, i) => {
                    const rev = tripRevenueUSD(row);
                    const pct = row.marginPct;
                    return (
                      <tr
                        key={row.id}
                        style={{
                          backgroundColor: i % 2 === 0 ? 'var(--bg-table-row)' : 'var(--bg-table-alt)',
                        }}
                        className="hover:bg-[var(--bg-table-hover)] transition-colors duration-100"
                      >
                        <td className="px-4 py-3 font-mono text-xs text-[var(--text-muted)]">{row.id}</td>
                        <td className="px-4 py-3 text-[var(--text-primary)]">{row.clientName}</td>
                        <td className="px-4 py-3 text-right text-[var(--text-primary)]">{fmtMoney(rev)}</td>
                        <td className="px-4 py-3 text-center">
                          <CobradoStatusCell trip={row} />
                        </td>
                        <td className="px-4 py-3 text-right text-[var(--text-primary)]">
                          {fmtMoney(row.totalCosts)}
                        </td>
                        <td className="px-4 py-3 text-right text-[var(--text-primary)]">
                          {fmtMoney(row.netMargin)}
                        </td>
                        <td className="px-4 py-3 text-right" style={marginRowStyle(pct, rev)}>
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi title="Ingresos generados" value={fmtMoney(kpi.totalGenerado)} sub={periodSub} />
            <Kpi
              title="Ingresos cobrados"
              value={fmtMoney(kpi.totalCobrado)}
              sub={`Tasa de cobro ${collectionRate.toFixed(0)}%`}
              tone="positive"
            />
            <Kpi
              title="Pendiente de cobro"
              value={fmtMoney(kpi.totalPendienteCobro)}
              sub="Facturado sin cobrar"
              tone="warning"
            />
            <Kpi
              title="Ticket promedio"
              value={periodTripCount > 0 ? fmtMoney(ticketPromedio) : '—'}
              sub={`${periodTripCount} viaje(s) en el período`}
            />
          </div>
          {!isAllTime && weeklyIngresos.length > 0 ? (
            <ChartBox title={`Ingresos vs costos por semana — ${formatMonthLongEs(selectedMonth)}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyIngresos}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(v: number) => fmtMoney(v)} />
                  <Legend />
                  <Bar dataKey="ingresos" name="Ingresos cobrados" fill={COL.ingreso} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="costos" name="Costos" fill={COL.costo} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartBox>
          ) : null}
          <ChartBox title={`Ingresos por mes ${trendSuffix}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ingresosBar}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v: number) => fmtMoney(v)} />
                <Legend />
                <Bar dataKey="Ingresos" name="Generado" fill={COL.ingreso} radius={[4, 4, 0, 0]}>
                  {ingresosBar.map((d) => (
                    <Cell key={d.month} fill={COL.ingreso} fillOpacity={barOpacity(d.month)} />
                  ))}
                </Bar>
                <Bar dataKey="Cobrado" name="Cobrado" fill={COL.cobrado} radius={[4, 4, 0, 0]}>
                  {ingresosBar.map((d) => (
                    <Cell key={d.month} fill={COL.cobrado} fillOpacity={barOpacity(d.month)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <ChartBox title={`Ingresos por cliente — ${periodSub}`}>
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
                  <Tooltip formatter={(v: number) => fmtMoney(v)} />
                </PieChart>
              </ResponsiveContainer>
            </ChartBox>
            <div className="overflow-hidden rounded-xl border border-[var(--border)] shadow-[var(--shadow-sm)]">
              <div className="border-b border-[var(--border)] px-4 py-3">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Ingresos por cliente</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr style={{ backgroundColor: 'var(--bg-elevated)' }}>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                        Cliente
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                    {revenueByClient.map((row, i) => (
                      <tr
                        key={row.name}
                        style={{
                          backgroundColor: i % 2 === 0 ? 'var(--bg-table-row)' : 'var(--bg-table-alt)',
                        }}
                        className="hover:bg-[var(--bg-table-hover)] transition-colors duration-100"
                      >
                        <td className="px-4 py-3 text-[var(--text-primary)]">{row.name}</td>
                        <td className="px-4 py-3 text-right font-medium text-[var(--text-primary)]">
                          {fmtMoney(row.value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-[var(--border)] shadow-[var(--shadow-sm)]">
            <div className="border-b border-[var(--border)] px-4 py-3">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Ingresos por producto</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-elevated)' }}>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                      Producto
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                  {revenueByProduct.map((row, i) => (
                    <tr
                      key={row.name}
                      style={{
                        backgroundColor: i % 2 === 0 ? 'var(--bg-table-row)' : 'var(--bg-table-alt)',
                      }}
                      className="hover:bg-[var(--bg-table-hover)] transition-colors duration-100"
                    >
                      <td className="px-4 py-3 text-[var(--text-primary)]">{row.name}</td>
                      <td className="px-4 py-3 text-right font-medium text-[var(--text-primary)]">
                        {fmtMoney(row.value)}
                      </td>
                    </tr>
                  ))}
                  {revenueByProduct.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-4 py-6 text-center text-[var(--text-muted)]">
                        Sin datos de ingresos cobrados por producto.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'costos' && (
        <div className="space-y-6">
          <p className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-sm text-[var(--text-secondary)]">
            Los costos de combustible se imputan proporcionalmente a los viajes según km recorridos (70% de
            carga, 30% sin carga). Los márgenes por viaje son estimados.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Kpi title="Costos totales" value={fmtMoney(totalCostsAll)} sub={periodSub} />
            <Kpi
              title="Costos / ingresos"
              value={kpi.totalGenerado > 0 ? `${costRatioReg.toFixed(0)}%` : '—'}
              sub="Cuanto menor, mejor"
              tone={costRatioReg <= 70 ? 'positive' : costRatioReg <= 85 ? 'warning' : 'negative'}
            />
            <Kpi title="Costo por km" value={totalKm > 0 ? fmtMoneyPrecise(costPerKm) : '—'} sub={periodSub} />
            <Kpi
              title="Costo por viaje"
              value={periodTripCount > 0 ? fmtMoney(costPerTrip) : '—'}
              sub={`${periodTripCount} viaje(s)`}
            />
            <Kpi
              title="Categoría con mayor gasto"
              value={topCat?.category ?? '—'}
              sub={topCat ? `${fmtMoney(topCat.total)} · ${topCat.pct.toFixed(0)}%` : undefined}
              tone="accent"
            />
          </div>
          <ChartBox title={`Costos por mes ${trendSuffix}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={costosBar}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v: number) => fmtMoney(v)} />
                <Bar dataKey="Costos" fill={COL.costo} radius={[4, 4, 0, 0]}>
                  {costosBar.map((d) => (
                    <Cell key={d.month} fill={COL.costo} fillOpacity={barOpacity(d.month)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <ChartBox title={`Distribución por categoría — ${periodSub}`}>
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
                  <Tooltip formatter={(v: number) => fmtMoney(v)} />
                </PieChart>
              </ResponsiveContainer>
            </ChartBox>
            <div className="overflow-hidden rounded-xl border border-[var(--border)] shadow-[var(--shadow-sm)]">
              <div className="border-b border-[var(--border)] px-4 py-3">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Costos por categoría</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr style={{ backgroundColor: 'var(--bg-elevated)' }}>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                        Categoría
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                        Total
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                        %
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                    {catBreakdown.map((row, i) => (
                      <tr
                        key={row.category}
                        style={{
                          backgroundColor: i % 2 === 0 ? 'var(--bg-table-row)' : 'var(--bg-table-alt)',
                        }}
                        className="hover:bg-[var(--bg-table-hover)] transition-colors duration-100"
                      >
                        <td className="px-4 py-3 text-[var(--text-primary)]">{row.category}</td>
                        <td className="px-4 py-3 text-right font-medium text-[var(--text-primary)]">
                          {fmtMoney(row.total)}
                        </td>
                        <td className="px-4 py-3 text-right text-[var(--text-secondary)]">
                          {row.pct.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                    {catBreakdown.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-6 text-center text-[var(--text-muted)]">
                          Sin costos registrados.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'rentabilidad' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Kpi
              title="Margen neto"
              value={fmtMoney(kpi.margenNeto)}
              sub={periodSub}
              tone={kpi.margenNeto >= 0 ? 'positive' : 'negative'}
            />
            <Kpi
              title="Margen %"
              value={`${kpi.margenPct.toFixed(1)}%`}
              sub="Sobre ingresos generados"
              tone={kpi.margenPct >= 20 ? 'positive' : kpi.margenPct >= 10 ? 'warning' : 'negative'}
            />
            <Kpi
              title="Margen por viaje"
              value={periodTripCount > 0 ? fmtMoney(marginPerTrip) : '—'}
              sub={`${periodTripCount} viaje(s)`}
            />
            <Kpi
              title="Margen por km"
              value={totalKm > 0 ? fmtMoneyPrecise(marginPerKm) : '—'}
              sub={`${totalKm.toLocaleString('es-UY')} km`}
            />
            <Kpi
              title="Ruta más rentable"
              value={bestRoute ? bestRoute.route : '—'}
              sub={bestRoute ? `Margen ${bestRoute.marginPct.toFixed(0)}% · ${fmtMoney(bestRoute.margin)}` : undefined}
              tone="accent"
            />
          </div>
          <ChartBox title={`Ingresos, costos y margen ${trendSuffix}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rentBarData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v: number) => fmtMoney(v)} />
                <Legend />
                <Bar dataKey="Ingresos" fill={COL.ingreso} radius={[4, 4, 0, 0]}>
                  {rentBarData.map((d) => (
                    <Cell key={d.month} fill={COL.ingreso} fillOpacity={barOpacity(d.month)} />
                  ))}
                </Bar>
                <Bar dataKey="Costos" fill={COL.costo} radius={[4, 4, 0, 0]}>
                  {rentBarData.map((d) => (
                    <Cell key={d.month} fill={COL.costo} fillOpacity={barOpacity(d.month)} />
                  ))}
                </Bar>
                <Bar dataKey="Margen" fill={COL.margen} radius={[4, 4, 0, 0]}>
                  {rentBarData.map((d) => (
                    <Cell key={d.month} fill={COL.margen} fillOpacity={barOpacity(d.month)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartBox>
          <ChartBox title={`Evolución del % de margen ${trendSuffix}`}>
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
          <div className="overflow-hidden rounded-xl border border-[var(--border)] shadow-[var(--shadow-sm)]">
            <div className="border-b border-[var(--border)] px-4 py-3">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Top 5 rutas más rentables — {periodSub}
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-elevated)' }}>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                      Ruta
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                      Ingresos (USD)
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                      Pendiente
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                      Costos
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                      Margen
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                      Margen %
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                  {top5Routes.map((r, i) => {
                    const gross = r.revenue;
                    return (
                    <tr
                      key={r.route}
                      style={{
                        backgroundColor: i % 2 === 0 ? 'var(--bg-table-row)' : 'var(--bg-table-alt)',
                      }}
                      className="hover:bg-[var(--bg-table-hover)] transition-colors duration-100"
                    >
                      <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{r.route}</td>
                      <td className="px-4 py-3 text-right text-[var(--text-primary)]">{fmtMoney(r.revenue)}</td>
                      <td className="px-4 py-3 text-right text-[var(--text-primary)]">{fmtMoney(r.pending)}</td>
                      <td className="px-4 py-3 text-right text-[var(--text-primary)]">{fmtMoney(r.cost)}</td>
                      <td className="px-4 py-3 text-right" style={{ color: 'var(--accent-blue)' }}>
                        {fmtMoney(r.margin)}
                      </td>
                      <td className="px-4 py-3 text-right" style={marginRowStyle(r.marginPct, gross)}>
                        {gross > 0 ? `${r.marginPct.toFixed(1)}%` : '—'}
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
    </div>
  );
};
