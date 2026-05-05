import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  AlertTriangle,
  Lightbulb,
  Loader2,
  Printer,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type { Client, Cost, MonthlyReportData, Trip } from '../../types';
import type { CostCategory } from '../../types';
import { Modal } from '../ui/Modal';
import { PeriodSelector } from '../ui/PeriodSelector';
import { buildWeeklyBucketsInMonth, costUsd, enrichTrips, tripRevenueUsd } from '../../utils/analytics';
import { generateMonthlyReport } from '../../utils/reportGenerator';

const CATEGORY_FILL: Record<CostCategory, string> = {
  Combustible: '#f97316',
  Mantenimiento: '#3b82f6',
  Peajes: '#eab308',
  Viáticos: '#22c55e',
  Neumáticos: '#8b5cf6',
  Seguros: '#06b6d4',
  Otros: '#94a3b8',
};

function marginPctCellColor(pct: number): string {
  if (pct > 20) return 'var(--accent-emerald)';
  if (pct >= 5) return 'var(--accent-amber)';
  return 'var(--accent-red)';
}

export interface ReportModalProps {
  open: boolean;
  onClose: () => void;
  trips: Trip[];
  costs: Cost[];
  clients: Client[];
  availableMonths: string[];
  formatAmount?: (n: number) => string;
  convertAggregateToDisplay?: (amountUSD: number) => number;
}

function formatUsd(n: number): string {
  return n.toLocaleString('es-UY', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export const ReportModal: React.FC<ReportModalProps> = ({
  open,
  onClose,
  trips,
  costs,
  clients,
  availableMonths,
  formatAmount: formatAmountProp,
  convertAggregateToDisplay: convertAggregateToDisplayProp,
}) => {
  const fmt = useMemo(() => {
    if (formatAmountProp && convertAggregateToDisplayProp) {
      return (n: number) => formatAmountProp(convertAggregateToDisplayProp(n));
    }
    return formatUsd;
  }, [formatAmountProp, convertAggregateToDisplayProp]);

  const initialMonth = availableMonths[0] ?? '';
  const [reportMonth, setReportMonth] = useState(initialMonth);
  const [generating, setGenerating] = useState(false);
  const [reportData, setReportData] = useState<MonthlyReportData | null>(null);

  useEffect(() => {
    if (availableMonths.length && !availableMonths.includes(reportMonth)) {
      setReportMonth(availableMonths[0]);
    }
  }, [availableMonths, reportMonth]);

  const runGenerate = useCallback(async () => {
    if (!reportMonth) return;
    setGenerating(true);
    try {
      const key = (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim();
      const data = await generateMonthlyReport(reportMonth, trips, costs, clients, key);
      setReportData(data);
    } finally {
      setGenerating(false);
    }
  }, [reportMonth, trips, costs, clients]);

  const weekly = useMemo(
    () => (reportMonth ? buildWeeklyBucketsInMonth(trips, costs, reportMonth) : []),
    [trips, costs, reportMonth]
  );

  const tripRows = useMemo(() => {
    if (!reportMonth) return [];
    const list = trips.filter((t) => t.fecha.startsWith(reportMonth));
    return enrichTrips(list, clients, costs);
  }, [trips, costs, clients, reportMonth]);

  const costMix = useMemo(() => {
    if (!reportMonth) return { usd: 0, uyu: 0 };
    const monthCosts = costs.filter((c) => c.fecha.startsWith(reportMonth));
    let usd = 0;
    let uyu = 0;
    monthCosts.forEach((c) => {
      if (c.currency === 'UYU' || c.moneda === 'UYU') uyu += c.monto;
      else usd += costUsd(c);
    });
    return { usd, uyu };
  }, [costs, reportMonth]);

  return (
    <Modal open={open} onClose={onClose} title="Reporte mensual" size="full">
      <div className="report-content space-y-8 text-[var(--text-primary)]">
        <div className="no-print report-section flex flex-col gap-4 border-b border-[var(--border)] pb-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            <PeriodSelector
              label="Mes del reporte"
              value={reportMonth}
              onChange={(m) => {
                if (m === 'all') return;
                setReportMonth(m);
                setReportData(null);
              }}
              availableMonths={availableMonths}
              includeAllOption={false}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={generating || !reportMonth}
              onClick={() => void runGenerate()}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent-blue)] px-4 py-2 text-sm font-medium text-white shadow hover:opacity-90 disabled:opacity-50"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {reportData ? 'Regenerar' : 'Generar reporte'}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-muted)]"
            >
              <Printer className="h-4 w-4" />
              Imprimir / PDF
            </button>
          </div>
          {generating ? (
            <p className="w-full text-sm text-[var(--text-secondary)]">Generando análisis…</p>
          ) : reportData ? (
            <p className="w-full text-sm text-[var(--accent-emerald)]">Listo</p>
          ) : null}
        </div>

        {!reportData && !generating ? (
          <p className="text-sm text-[var(--text-muted)]">Seleccioná un mes y pulsá Generar reporte.</p>
        ) : null}

        {reportData ? (
          <>
            <section className="report-section space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <div className="flex items-center gap-2 text-[var(--accent-purple)]">
                <Sparkles className="h-5 w-5" />
                <h3 className="text-sm font-bold uppercase tracking-wide">Análisis ejecutivo</h3>
              </div>
              <p className="text-sm leading-relaxed text-[var(--text-primary)]">{reportData.aiSummary}</p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-[var(--accent-red)]">Alertas</p>
                  {reportData.aiAlerts.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)]">Sin alertas destacadas.</p>
                  ) : (
                    reportData.aiAlerts.map((a) => (
                      <div
                        key={a}
                        className="flex gap-2 rounded-lg border border-red-200/50 bg-red-500/10 px-3 py-2 text-sm text-[var(--text-primary)]"
                      >
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                        <span>{a}</span>
                      </div>
                    ))
                  )}
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-[var(--accent-blue)]">Recomendaciones</p>
                  {reportData.aiRecommendations.map((r) => (
                    <div
                      key={r}
                      className="flex gap-2 rounded-lg border border-blue-200/40 bg-blue-500/10 px-3 py-2 text-sm text-[var(--text-primary)]"
                    >
                      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
                      <span>{r}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="report-section">
              <h3 className="mb-3 text-sm font-semibold text-[var(--text-secondary)]">Indicadores principales</h3>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                {[
                  {
                    label: 'Ingresos cobrados',
                    value: fmt(reportData.totalRevenue),
                    delta: reportData.vsLastMonth.revenueDelta,
                    invert: false,
                  },
                  {
                    label: 'Costos (viajes del mes)',
                    value: fmt(reportData.totalCosts),
                    delta: reportData.vsLastMonth.costsDelta,
                    invert: true,
                  },
                  {
                    label: 'Margen neto',
                    value: fmt(reportData.netMargin),
                    delta: reportData.vsLastMonth.marginDelta,
                    invert: false,
                  },
                  {
                    label: 'Margen %',
                    value: `${reportData.marginPct.toFixed(1)}%`,
                    delta: reportData.vsLastMonth.marginPctDeltaPp,
                    isPp: true,
                    invert: false,
                  },
                  {
                    label: 'Viajes del mes',
                    value: String(reportData.totalTrips),
                    delta: reportData.vsLastMonth.tripsDelta,
                    invert: false,
                  },
                  {
                    label: 'KM recorridos',
                    value: `${Math.round(reportData.totalKm)}`,
                    delta: null,
                  },
                ].map((card) => {
                  const positive =
                    card.isPp === true
                      ? card.delta! >= 0
                      : card.invert === true
                        ? card.delta! <= 0
                        : card.delta! >= 0;
                  return (
                  <div
                    key={card.label}
                    className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-3 shadow-sm"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      {card.label}
                    </p>
                    <p className="mt-1 text-lg font-bold">{card.value}</p>
                    {card.delta != null && (
                      <p
                        className={`mt-1 flex items-center gap-1 text-xs font-medium ${
                          positive ? 'text-emerald-500' : 'text-red-400'
                        }`}
                      >
                        {positive ? (
                          <TrendingUp className="h-3.5 w-3.5" />
                        ) : (
                          <TrendingDown className="h-3.5 w-3.5" />
                        )}
                        {card.isPp
                          ? `${card.delta >= 0 ? '+' : ''}${card.delta.toFixed(1)} pp vs mes ant.`
                          : `${card.delta >= 0 ? '+' : ''}${card.delta.toFixed(1)}% vs mes ant.`}
                      </p>
                    )}
                  </div>
                  );
                })}
              </div>
            </section>

            <section className="report-section grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
                <h3 className="mb-3 text-sm font-semibold">Ingresos vs costos por semana</h3>
                <div className="h-64 min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weekly}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                      <Tooltip formatter={(v: number) => fmt(v)} />
                      <Legend />
                      <Bar dataKey="ingresos" name="Ingresos" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="costos" name="Costos" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
                <h3 className="mb-3 text-sm font-semibold">Costos por categoría</h3>
                <div className="h-64 min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={reportData.costsByCategory}
                        dataKey="total"
                        nameKey="category"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        label={(props) => {
                          const name = String(props.name ?? '');
                          const pct = typeof props.percent === 'number' ? props.percent * 100 : 0;
                          return `${name} (${pct.toFixed(0)}%)`;
                        }}
                      >
                        {reportData.costsByCategory.map((e) => (
                          <Cell
                            key={e.category}
                            fill={CATEGORY_FILL[e.category as CostCategory] ?? '#94a3b8'}
                          />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => fmt(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>

            <section className="report-section grid gap-4 sm:grid-cols-2">
              {[
                {
                  t: 'Mejor cliente',
                  l1: reportData.topClientByRevenue.name,
                  l2: `${fmt(reportData.topClientByRevenue.revenue)} · ${reportData.topClientByRevenue.trips} viajes`,
                },
                {
                  t: 'Ruta destacada',
                  l1: reportData.topRoute.route,
                  l2: `${fmt(reportData.topRoute.revenue)} · ${reportData.topRoute.count} cobros`,
                },
                {
                  t: 'Mejor margen %',
                  l1: reportData.bestMarginTrip.id,
                  l2: `${reportData.bestMarginTrip.client} · ${reportData.bestMarginTrip.marginPct.toFixed(1)}%`,
                },
                {
                  t: 'Menor margen %',
                  l1: reportData.worstMarginTrip.id,
                  l2: `${reportData.worstMarginTrip.client} · ${reportData.worstMarginTrip.marginPct.toFixed(1)}%`,
                  warn: reportData.worstMarginTrip.marginPct < 0,
                },
              ].map((c) => (
                <div
                  key={c.t}
                  className={`rounded-xl border p-4 ${c.warn ? 'border-red-400/40 bg-red-500/10' : 'border-[var(--border)] bg-[var(--bg-elevated)]'}`}
                >
                  <p className="text-xs font-semibold uppercase text-[var(--text-muted)]">{c.t}</p>
                  <p className="mt-1 font-mono text-sm">{c.l1}</p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">{c.l2}</p>
                </div>
              ))}
            </section>

            <section className="report-section overflow-hidden rounded-xl border border-[var(--border)]">
              <div className="border-b border-[var(--border)] px-4 py-3">
                <h3 className="text-sm font-semibold">Viajes del mes</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px] text-sm">
                  <thead>
                    <tr className="bg-[var(--bg-elevated)]">
                      {['ID', 'Fecha', 'Cliente', 'Ruta', 'Producto', 'Ingreso', 'Costos', 'Margen', 'Margen %'].map(
                        (h) => (
                          <th
                            key={h}
                            className="px-3 py-2 text-left text-xs font-semibold uppercase text-[var(--text-secondary)]"
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {tripRows.map((row, i) => {
                      const ing = tripRevenueUsd(row);
                      const pctOp = ing > 0 ? ((ing - row.totalCosts) / ing) * 100 : 0;
                      return (
                        <tr
                          key={row.id}
                          className={i % 2 ? 'bg-[var(--bg-table-alt)]' : 'bg-[var(--bg-table-row)]'}
                        >
                          <td className="px-3 py-2 font-mono text-xs">{row.id}</td>
                          <td className="px-3 py-2">{row.fecha}</td>
                          <td className="px-3 py-2">{row.clientName}</td>
                          <td className="px-3 py-2">
                            {row.origen} → {row.destino}
                          </td>
                          <td className="px-3 py-2">{row.contenido}</td>
                          <td className="px-3 py-2 text-right">{fmt(ing)}</td>
                          <td className="px-3 py-2 text-right">{fmt(row.totalCosts)}</td>
                          <td className="px-3 py-2 text-right">{fmt(ing - row.totalCosts)}</td>
                          <td
                            className="px-3 py-2 text-right font-medium"
                            style={{
                              color: ing > 0 ? marginPctCellColor(pctOp) : 'var(--text-muted)',
                            }}
                          >
                            {ing > 0 ? `${pctOp.toFixed(1)}%` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="report-section space-y-3">
              <h3 className="text-sm font-semibold">Desglose de costos del mes</h3>
              <div className="overflow-hidden rounded-xl border border-[var(--border)]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[var(--bg-elevated)]">
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Categoría</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Total (USD eq.)</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase">%</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Registros</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.costsByCategory.map((row, i) => {
                      const count = costs.filter(
                        (c) =>
                          c.fecha.startsWith(reportMonth) &&
                          c.categoria === row.category
                      ).length;
                      return (
                        <tr key={row.category} className={i % 2 ? 'bg-[var(--bg-table-alt)]' : ''}>
                          <td className="px-3 py-2">{row.category}</td>
                          <td className="px-3 py-2 text-right">{fmt(row.total)}</td>
                          <td className="px-3 py-2 text-right">{row.pct.toFixed(1)}%</td>
                          <td className="px-3 py-2 text-right">{count}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {(costMix.uyu > 0 || costMix.usd > 0) && (
                <p className="text-xs text-[var(--text-secondary)]">
                  Subtotal aprox.: USD {costMix.usd.toLocaleString('es-UY', { maximumFractionDigits: 0 })} · $U{' '}
                  {costMix.uyu.toLocaleString('es-UY', { maximumFractionDigits: 0 })} (montos originales en UYU)
                </p>
              )}
            </section>
          </>
        ) : null}
      </div>
    </Modal>
  );
};
