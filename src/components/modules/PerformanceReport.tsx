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
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import type { Client, Cost, Trip, TripStatus, User } from '../../types';
import { tripRevenueUsd, costUsd } from '../../utils/analytics';
import { Button } from '../ui/Button';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { ArrowLeft, Download, Sparkles } from 'lucide-react';

export interface PerformanceReportProps {
  trips: Trip[];
  clients: Client[];
  costs: Cost[];
  user: User;
  onClose: () => void;
}

interface ReportSections {
  resumenEjecutivo: string;
  analisisClientes: string;
  alertas: string[];
  recomendaciones: string[];
  tituloPrincipal: string;
}

interface WeeklyMetrics {
  totalViajes: number;
  viajesCobrados: number;
  ingresoRealizado: number;
  costosOperativos: number;
  kgTransportados: number;
  kmRecorridos: number;
  clientesAtendidos: number;
}

interface HistoricalMetrics {
  totalViajes: number;
  viajesCobrados: number;
  ingresoRealizado: number;
  costosOperativos: number;
  kgTransportados: number;
  kmRecorridos: number;
  clientesAtendidos: number;
  semanasTranscurridas: number;
  avgViajesPorSemana: number;
  avgIngresoRealizadoSemanal: number;
  avgCostosSemanal: number;
  avgKgSemanal: number;
  avgKmSemanal: number;
}

const PIE_STATUS_COLORS: Record<TripStatus, string> = {
  Pendiente: '#f59e0b',
  'En Tránsito': '#3b82f6',
  Completado: '#10b981',
  Cerrado: '#64748b',
};

function localISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function calcWeeklyMetrics(trips: Trip[], costs: Cost[], _clients: Client[]): WeeklyMetrics {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekStr = localISODate(weekAgo);

  const weekTrips = trips.filter((t) => t.fecha >= weekStr);
  const weekCobrados = weekTrips.filter((t) => t.facturaCobrada === true);
  const weekCosts = costs.filter((c) => c.fecha >= weekStr);

  return {
    totalViajes: weekTrips.length,
    viajesCobrados: weekCobrados.length,
    ingresoRealizado: weekCobrados.reduce((s, t) => s + tripRevenueUsd(t), 0),
    costosOperativos: weekCosts.reduce((s, c) => s + costUsd(c), 0),
    kgTransportados: weekTrips.reduce((s, t) => s + t.pesoKg, 0),
    kmRecorridos: weekTrips.reduce((s, t) => s + t.kmRecorridos, 0),
    clientesAtendidos: new Set(weekTrips.map((t) => t.clientId)).size,
  };
}

function calcHistoricalMetrics(trips: Trip[], costs: Cost[]): HistoricalMetrics {
  if (trips.length === 0) {
    return {
      totalViajes: 0,
      viajesCobrados: 0,
      ingresoRealizado: 0,
      costosOperativos: 0,
      kgTransportados: 0,
      kmRecorridos: 0,
      clientesAtendidos: 0,
      semanasTranscurridas: 1,
      avgViajesPorSemana: 0,
      avgIngresoRealizadoSemanal: 0,
      avgCostosSemanal: 0,
      avgKgSemanal: 0,
      avgKmSemanal: 0,
    };
  }
  const sorted = [...trips].map((t) => t.fecha).sort();
  const first = sorted[0]!;
  const start = new Date(`${first}T12:00:00`).getTime();
  const weeks = Math.max(1, Math.ceil((Date.now() - start) / (7 * 86400000)));
  const cobrados = trips.filter((t) => t.facturaCobrada === true);
  const ingresoRealizado = cobrados.reduce((s, t) => s + tripRevenueUsd(t), 0);
  const costosOperativos = costs.reduce((s, c) => s + costUsd(c), 0);
  const kgTransportados = trips.reduce((s, t) => s + t.pesoKg, 0);
  const kmRecorridos = trips.reduce((s, t) => s + t.kmRecorridos, 0);
  return {
    totalViajes: trips.length,
    viajesCobrados: cobrados.length,
    ingresoRealizado,
    costosOperativos,
    kgTransportados,
    kmRecorridos,
    clientesAtendidos: new Set(trips.map((t) => t.clientId)).size,
    semanasTranscurridas: weeks,
    avgViajesPorSemana: trips.length / weeks,
    avgIngresoRealizadoSemanal: ingresoRealizado / weeks,
    avgCostosSemanal: costosOperativos / weeks,
    avgKgSemanal: kgTransportados / weeks,
    avgKmSemanal: kmRecorridos / weeks,
  };
}

function buildFallbackReport(
  weekly: WeeklyMetrics,
  historical: HistoricalMetrics,
  clients: Client[],
  trips: Trip[]
): ReportSections {
  const diffViajes = weekly.totalViajes - historical.avgViajesPorSemana;
  return {
    tituloPrincipal: 'Reporte operativo — GDC Logistics',
    resumenEjecutivo: `En la última semana se registraron ${weekly.totalViajes} viajes (${weekly.viajesCobrados} cobrados), frente a un promedio histórico de ${historical.avgViajesPorSemana.toFixed(1)} viajes por semana (${diffViajes >= 0 ? '+' : ''}${diffViajes.toFixed(1)} vs. promedio). El ingreso realizado en la semana fue USD ${weekly.ingresoRealizado.toLocaleString('es-UY', { maximumFractionDigits: 0 })} y los costos operativos USD ${weekly.costosOperativos.toLocaleString('es-UY', { maximumFractionDigits: 0 })}. A nivel histórico, el ingreso realizado acumulado asciende a USD ${historical.ingresoRealizado.toLocaleString('es-UY', { maximumFractionDigits: 0 })} sobre ${historical.totalViajes} viajes.`,
    analisisClientes: `Se contabilizan ${clients.length} clientes en cartera y ${new Set(trips.map((t) => t.clientId)).size} clientes con al menos un viaje registrado. La concentración de ingresos cobrados depende del pipeline de facturación: revisá viajes completados sin marca de cobro para mejorar el flujo de caja.`,
    alertas: [
      weekly.viajesCobrados < weekly.totalViajes
        ? `${weekly.totalViajes - weekly.viajesCobrados} viaje(s) de la semana aún sin cobro registrado.`
        : 'Todos los viajes de la semana tienen cobro registrado o no hay viajes en el período.',
      weekly.costosOperativos > weekly.ingresoRealizado && weekly.ingresoRealizado > 0
        ? 'Costos semanales superan ingresos realizados en el período.'
        : 'Relación costos / ingresos realizados dentro de rangos habituales (o sin ingresos en la semana).',
      trips.length === 0 ? 'No hay datos de viajes cargados.' : 'Dataset disponible para seguimiento continuo.',
    ],
    recomendaciones: [
      'Priorizar cobros de viajes completados con mayor antigüedad.',
      'Revisar costos fijos vs. ingresos realizados por cliente estratégico.',
      'Mantener actualizado el estado de facturación en la pestaña Facturación.',
    ],
  };
}

async function generateReport(
  weekly: WeeklyMetrics,
  historical: HistoricalMetrics,
  clients: Client[],
  trips: Trip[],
  weekStr: string
): Promise<ReportSections> {
  const weekTrips = trips.filter((t) => t.fecha >= weekStr);
  const byEstado = weekTrips.reduce<Record<string, number>>((acc, t) => {
    acc[t.estado] = (acc[t.estado] ?? 0) + 1;
    return acc;
  }, {});

  const body = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1200,
    messages: [
      {
        role: 'user',
        content: `Sos analista logístico senior para GDC, empresa de transporte de carga pesada en Uruguay.

Analizá los siguientes datos y generá un reporte ejecutivo en español.

MÉTRICAS ÚLTIMA SEMANA:
${JSON.stringify(weekly, null, 2)}

MÉTRICAS HISTÓRICAS (promedios semanales):
${JSON.stringify(historical, null, 2)}

CLIENTES ACTIVOS: ${clients.length}
VIAJES ÚLTIMA SEMANA POR ESTADO: ${JSON.stringify(byEstado)}

Respondé SOLO con JSON válido sin markdown, con esta estructura exacta:
{
  "resumenEjecutivo": "2-3 párrafos con análisis comparativo semana vs histórico",
  "analisisClientes": "1-2 párrafos sobre comportamiento de clientes y cobros",
  "alertas": ["alerta 1", "alerta 2", "alerta 3"],
  "recomendaciones": ["recomendación 1", "recomendación 2", "recomendación 3"],
  "tituloPrincipal": "título conciso para el reporte"
}`,
      },
    ],
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
  };
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined;
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Anthropic HTTP ${response.status}`);
  }

  const data = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const text = (data.content ?? []).map((i) => i.text ?? '').join('');
  const cleaned = text.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleaned) as ReportSections;
  } catch {
    throw new Error('Respuesta IA no es JSON válido');
  }
}

function last7DaysSeries(trips: Trip[], costs: Cost[]) {
  const out: { label: string; ingresos: number; costos: number }[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = localISODate(d);
    const label = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    const ingresos = trips
      .filter((t) => {
        if (t.facturaCobrada !== true) {
          return false;
        }
        const cob = t.facturaFechaCobro?.slice(0, 10);
        return cob === ds || (!cob && t.fecha === ds);
      })
      .reduce((s, t) => s + tripRevenueUsd(t), 0);
    const costos = costs
      .filter((c) => c.fecha.slice(0, 10) === ds)
      .reduce((s, c) => s + costUsd(c), 0);
    out.push({ label, ingresos, costos });
  }
  return out;
}

function pieWeekByStatus(trips: Trip[], weekStr: string) {
  const weekTrips = trips.filter((t) => t.fecha >= weekStr);
  const statuses: TripStatus[] = ['Pendiente', 'En Tránsito', 'Completado', 'Cerrado'];
  return statuses.map((name) => ({
    name,
    value: weekTrips.filter((t) => t.estado === name).length,
  }));
}

function topClientsRealized(trips: Trip[], clients: Client[], limit = 5) {
  const m = new Map<string, number>();
  trips
    .filter((t) => t.facturaCobrada === true)
    .forEach((t) => {
      m.set(t.clientId, (m.get(t.clientId) ?? 0) + tripRevenueUsd(t));
    });
  return Array.from(m.entries())
    .map(([id, ingreso]) => ({
      name: clients.find((c) => c.id === id)?.nombreComercial ?? id,
      ingreso,
    }))
    .sort((a, b) => b.ingreso - a.ingreso)
    .slice(0, limit);
}

export const PerformanceReport: React.FC<PerformanceReportProps> = ({
  trips,
  clients,
  costs,
  user,
  onClose,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sections, setSections] = useState<ReportSections | null>(null);

  const weekStr = useMemo(() => {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return localISODate(weekAgo);
  }, []);

  const weekly = useMemo(() => calcWeeklyMetrics(trips, costs, clients), [trips, costs, clients]);
  const historical = useMemo(() => calcHistoricalMetrics(trips, costs), [trips, costs]);

  const barCompare = useMemo(
    () => [
      {
        metric: 'Viajes',
        semana: weekly.totalViajes,
        historico: historical.avgViajesPorSemana,
      },
      {
        metric: 'Ingresos USD',
        semana: weekly.ingresoRealizado,
        historico: historical.avgIngresoRealizadoSemanal,
      },
      {
        metric: 'Costos USD',
        semana: weekly.costosOperativos,
        historico: historical.avgCostosSemanal,
      },
      {
        metric: 'Kg (tons)',
        semana: weekly.kgTransportados / 1000,
        historico: historical.avgKgSemanal / 1000,
      },
    ],
    [weekly, historical]
  );

  const dailySeries = useMemo(() => last7DaysSeries(trips, costs), [trips, costs]);
  const pieData = useMemo(() => pieWeekByStatus(trips, weekStr), [trips, weekStr]);
  const clientBars = useMemo(() => topClientsRealized(trips, clients), [trips, clients]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSections(null);
    const hasKey = Boolean(import.meta.env.VITE_ANTHROPIC_API_KEY);
    if (!hasKey) {
      setSections(buildFallbackReport(weekly, historical, clients, trips));
      setLoading(false);
      return;
    }
    try {
      const data = await generateReport(weekly, historical, clients, trips, weekStr);
      setError(null);
      setSections(data);
    } catch (e) {
      console.error('[PerformanceReport]', e);
      setSections(buildFallbackReport(weekly, historical, clients, trips));
      setError('No se pudo generar el texto con IA; se muestra un resumen automático. Podés reintentar.');
    } finally {
      setLoading(false);
    }
  }, [weekly, historical, clients, trips, weekStr]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = 'gdc-performance-print-styles';
    if (document.getElementById(id)) {
      return;
    }
    const el = document.createElement('style');
    el.id = id;
    el.textContent = `
@media print {
  body * { visibility: hidden !important; }
  #report-print-root, #report-print-root * { visibility: visible !important; }
  #report-print-root { position: absolute; left: 0; top: 0; width: 100%; background: #fff !important; color: #0f172a !important; }
  .no-print { display: none !important; }
  .recharts-surface { max-width: 100% !important; }
}
`;
    document.head.appendChild(el);
    return () => {
      el.remove();
    };
  }, []);

  return (
    <div
      id="report-print-root"
      className="mx-auto max-w-6xl space-y-8 px-4 py-6 text-[var(--text-primary)]"
    >
      <header className="flex flex-col gap-4 border-b border-[var(--border)] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            {user.nombre} · {user.role}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-[var(--text-primary)]">
            {sections?.tituloPrincipal ?? 'Reporte de rendimiento'}
          </h1>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<Download size={16} aria-hidden />}
            onClick={() => window.print()}
          >
            Descargar PDF
          </Button>
          <Button variant="ghost" size="sm" icon={<ArrowLeft size={16} aria-hidden />} onClick={onClose}>
            Volver
          </Button>
        </div>
      </header>

      {loading && (
        <div className="space-y-6">
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-10">
            <LoadingSpinner size="lg" />
            <p className="text-sm font-medium text-[var(--text-secondary)]">Analizando datos operativos…</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-28 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]"
              />
            ))}
          </div>
        </div>
      )}

      {error && !loading && sections && (
        <div className="no-print rounded-xl border border-[var(--accent-amber)] bg-[color-mix(in_srgb,var(--accent-amber)_12%,transparent)] p-4 text-sm text-[var(--text-primary)]">
          <p>{error}</p>
          <Button className="mt-3" variant="secondary" size="sm" onClick={() => void load()}>
            Reintentar
          </Button>
        </div>
      )}

      {!loading && sections && (
        <>
          <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-6 shadow-[var(--shadow-sm)]">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-[var(--text-primary)]">
              <Sparkles className="h-5 w-5 text-[var(--accent-blue)]" aria-hidden />
              Resumen ejecutivo
            </h2>
            <div className="space-y-3 whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-secondary)]">
              {sections.resumenEjecutivo}
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Semana actual vs histórico
            </h2>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
                <h3 className="mb-2 text-sm font-medium text-[var(--text-secondary)]">
                  Comparativo (semana vs promedio / semana)
                </h3>
                <div className="h-64 min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barCompare} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="metric" tick={{ fontSize: 10 }} stroke="var(--text-muted)" />
                      <YAxis tick={{ fontSize: 10 }} stroke="var(--text-muted)" />
                      <Tooltip
                        contentStyle={{
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                        }}
                      />
                      <Legend />
                      <Bar dataKey="semana" name="Esta semana" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="historico" name="Promedio histórico" fill="#64748b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
                <h3 className="mb-2 text-sm font-medium text-[var(--text-secondary)]">
                  Ingresos realizados vs costos (últimos 7 días)
                </h3>
                <div className="h-64 min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dailySeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="prIng" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="prCost" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#64748b" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#64748b" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="var(--text-muted)" />
                      <YAxis tick={{ fontSize: 10 }} stroke="var(--text-muted)" />
                      <Tooltip />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="ingresos"
                        name="Ingresos realizados"
                        stroke="#10b981"
                        fill="url(#prIng)"
                      />
                      <Area type="monotone" dataKey="costos" name="Costos" stroke="#64748b" fill="url(#prCost)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
                <h3 className="mb-2 text-sm font-medium text-[var(--text-secondary)]">
                  Viajes por estado (semana)
                </h3>
                <div className="h-64 min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_STATUS_COLORS[entry.name as TripStatus] ?? '#94a3b8'} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
                <h3 className="mb-2 text-sm font-medium text-[var(--text-secondary)]">
                  Top clientes por ingreso cobrado (histórico)
                </h3>
                <div className="h-64 min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={clientBars}
                      margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis type="number" tick={{ fontSize: 10 }} stroke="var(--text-muted)" />
                      <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 10 }} stroke="var(--text-muted)" />
                      <Tooltip />
                      <Bar dataKey="ingreso" name="Ingreso USD" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-6 shadow-[var(--shadow-sm)]">
            <h2 className="mb-3 text-lg font-semibold text-[var(--text-primary)]">Análisis por cliente</h2>
            <p className="mb-4 whitespace-pre-wrap text-sm text-[var(--text-secondary)]">{sections.analisisClientes}</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-elevated)' }}>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--text-secondary)]">Cliente</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-[var(--text-secondary)]">
                      Ingreso cobrado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {clientBars.map((r, i) => (
                    <tr
                      key={r.name}
                      style={{
                        backgroundColor: i % 2 === 0 ? 'var(--bg-table-row)' : 'var(--bg-table-alt)',
                      }}
                    >
                      <td className="px-3 py-2 text-[var(--text-primary)]">{r.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-[var(--text-primary)]">
                        USD {r.ingreso.toLocaleString('es-UY', { maximumFractionDigits: 0 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-6 shadow-[var(--shadow-sm)]">
            <h2 className="mb-3 text-lg font-semibold text-[var(--text-primary)]">Alertas y recomendaciones</h2>
            <ul className="mb-4 list-disc space-y-2 pl-5 text-sm text-[var(--text-secondary)]">
              {sections.alertas.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
            <ul className="list-decimal space-y-2 pl-5 text-sm text-[var(--text-secondary)]">
              {sections.recomendaciones.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
};
