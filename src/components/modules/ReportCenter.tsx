import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  PieChart,
  Pie,
  BarChart,
} from 'recharts';
import {
  AlertTriangle,
  CalendarDays,
  CalendarRange,
  Download,
  History,
  Lightbulb,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import type { Client, Cost, GeneralReportData, ReportEmailEntry, ReportScope, Trip } from '../../types';
import type { CostCategory } from '../../types';
import { Modal } from '../ui/Modal';
import { generateReport, fmtPerKm, type ReportParams } from '../../utils/reportData';
import {
  type ChartImage,
  downloadReportPdf,
  reportFileName,
  reportPdfBase64,
  svgToPngDataUrl,
} from '../../utils/pdfReport';
import { IS_MOCK, sendReportByEmail } from '../../services/api';
import { isValidEmail } from '../../utils/savedEmails';
import {
  MAX_REPORT_EMAILS,
  activeReportEmails,
  hasMigratedLocalEmails,
  localEmailsToMigrate,
  markLocalEmailsMigrated,
} from '../../utils/reportEmails';
import { monthLabel, tripRevenueUSD } from '../../utils/analytics';

const CATEGORY_FILL: Record<CostCategory, string> = {
  Combustible: '#f97316',
  Sueldos: '#22c55e',
  Alquiler: '#8b5cf6',
  'Cuota Banco': '#06b6d4',
  Service: '#eab308',
  Mantenimiento: '#3b82f6',
  'AD Blue': '#14b8a6',
  Otros: '#94a3b8',
};

const AXIS = '#64748b';
const GRID = '#cbd5e1';

function formatUsd(n: number): string {
  return n.toLocaleString('es-UY', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export interface ReportCenterProps {
  open: boolean;
  onClose: () => void;
  trips: Trip[];
  costs: Cost[];
  clients: Client[];
  availableMonths: string[];
  formatAmount?: (n: number) => string;
  convertAggregateToDisplay?: (amountUSD: number) => number;
  /** Authorized emails from Sheet (DB_ReportEmails). */
  reportEmails?: ReportEmailEntry[];
  onAddReportEmail?: (email: string) => Promise<boolean>;
  onToggleAutoMonthly?: (email: string, autoMonthly: boolean) => Promise<boolean>;
  onRemoveReportEmail?: (email: string) => Promise<boolean>;
  /** One-shot migrate localStorage → Sheet. */
  onMigrateLocalEmails?: (emails: string[]) => Promise<void>;
}

const SCOPE_OPTIONS: { id: ReportScope; label: string; icon: React.ReactNode }[] = [
  { id: 'mensual', label: 'Mensual', icon: <CalendarDays size={15} aria-hidden /> },
  { id: 'semanal', label: 'Semanal', icon: <CalendarRange size={15} aria-hidden /> },
  { id: 'historico', label: 'Histórico', icon: <History size={15} aria-hidden /> },
];

const WEEK_LABELS = ['Semana 1 (1–7)', 'Semana 2 (8–14)', 'Semana 3 (15–21)', 'Semana 4 (22–fin)'];

export const ReportCenter: React.FC<ReportCenterProps> = ({
  open,
  onClose,
  trips,
  costs,
  clients,
  availableMonths,
  formatAmount: formatAmountProp,
  convertAggregateToDisplay: convertAggregateToDisplayProp,
  reportEmails = [],
  onAddReportEmail,
  onToggleAutoMonthly,
  onRemoveReportEmail,
  onMigrateLocalEmails,
}) => {
  const fmt = useMemo(() => {
    if (formatAmountProp && convertAggregateToDisplayProp) {
      return (n: number) => formatAmountProp(convertAggregateToDisplayProp(n));
    }
    return formatUsd;
  }, [formatAmountProp, convertAggregateToDisplayProp]);

  const [scope, setScope] = useState<ReportScope>('mensual');
  const [month, setMonth] = useState(availableMonths[0] ?? '');
  const [weekIndex, setWeekIndex] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [data, setData] = useState<GeneralReportData | null>(null);

  // Email
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [newEmailInput, setNewEmailInput] = useState('');
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [managing, setManaging] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const trendRef = useRef<HTMLDivElement>(null);
  const pieRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<HTMLDivElement>(null);

  const authorized = useMemo(() => activeReportEmails(reportEmails), [reportEmails]);

  useEffect(() => {
    if (!open || !onMigrateLocalEmails || hasMigratedLocalEmails()) return;
    const toMigrate = localEmailsToMigrate(reportEmails);
    void (async () => {
      try {
        if (toMigrate.length > 0) {
          await onMigrateLocalEmails(toMigrate);
        }
        markLocalEmailsMigrated();
      } catch {
        /* leave flag unset so we retry next open */
      }
    })();
  }, [open, onMigrateLocalEmails, reportEmails]);

  useEffect(() => {
    // Drop selections that are no longer authorized.
    setSelectedEmails((prev) => prev.filter((e) => authorized.some((a) => a.email === e)));
  }, [authorized]);

  useEffect(() => {
    if (availableMonths.length && !availableMonths.includes(month)) {
      setMonth(availableMonths[0]);
    }
  }, [availableMonths, month]);

  // Invalida el reporte al cambiar de parámetros.
  useEffect(() => {
    setData(null);
    setFeedback(null);
  }, [scope, month, weekIndex]);

  const params = useMemo<ReportParams>(
    () => ({ scope, month: scope === 'historico' ? undefined : month, weekIndex }),
    [scope, month, weekIndex]
  );

  const canGenerate = scope === 'historico' ? trips.length > 0 : Boolean(month);

  const runGenerate = useCallback(async () => {
    if (!canGenerate) return;
    setGenerating(true);
    setFeedback(null);
    try {
      const key = (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim();
      const result = await generateReport(params, trips, costs, clients, key);
      setData(result);
    } finally {
      setGenerating(false);
    }
  }, [canGenerate, params, trips, costs, clients]);

  const captureCharts = useCallback(async (): Promise<ChartImage[]> => {
    const out: ChartImage[] = [];
    const grab = async (ref: React.RefObject<HTMLDivElement>, title: string) => {
      const svg = ref.current?.querySelector('svg.recharts-surface') as SVGSVGElement | null;
      if (!svg) return;
      const img = await svgToPngDataUrl(svg);
      if (img) out.push({ ...img, title });
    };
    await grab(trendRef, data?.seriesKind === 'semanal' ? 'Evolución semanal' : 'Evolución del período');
    await grab(pieRef, 'Costos por categoría');
    await grab(clientRef, 'Ingresos por cliente');
    return out;
  }, [data]);

  const handleDownload = useCallback(async () => {
    if (!data) return;
    const charts = await captureCharts();
    downloadReportPdf(data, fmt, charts);
  }, [data, fmt, captureCharts]);

  const toggleSelected = useCallback((email: string) => {
    setSelectedEmails((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]
    );
  }, []);

  const handleAddAuthorized = useCallback(async () => {
    const clean = newEmailInput.trim().toLowerCase();
    if (!isValidEmail(clean)) {
      setFeedback({ type: 'err', text: 'Ingresá un email válido.' });
      return;
    }
    if (authorized.length >= MAX_REPORT_EMAILS) {
      setFeedback({ type: 'err', text: `Máximo ${MAX_REPORT_EMAILS} correos autorizados.` });
      return;
    }
    if (!onAddReportEmail) return;
    setManaging(true);
    setFeedback(null);
    try {
      const ok = await onAddReportEmail(clean);
      if (ok) {
        setNewEmailInput('');
        setSelectedEmails((prev) => (prev.includes(clean) ? prev : [...prev, clean]));
        setFeedback({ type: 'ok', text: `Agregado ${clean}.` });
      } else {
        setFeedback({ type: 'err', text: 'No se pudo agregar el email.' });
      }
    } finally {
      setManaging(false);
    }
  }, [newEmailInput, authorized.length, onAddReportEmail]);

  const handleSend = useCallback(async () => {
    if (!data) return;
    if (selectedEmails.length === 0) {
      setFeedback({ type: 'err', text: 'Seleccioná al menos un destinatario de la lista autorizada.' });
      return;
    }
    const allowed = new Set(authorized.map((a) => a.email));
    const targets = selectedEmails.filter((e) => allowed.has(e));
    if (targets.length === 0) {
      setFeedback({ type: 'err', text: 'Los destinatarios deben estar en la lista autorizada.' });
      return;
    }
    setSending(true);
    setFeedback(null);
    try {
      const charts = await captureCharts();
      const pdfBase64 = reportPdfBase64(data, fmt, charts);
      const subject = `${data.title} · ${data.periodLabel} — GDC`;
      const message = `Hola,\n\nAdjuntamos el ${data.title.toLowerCase()} correspondiente a ${data.periodLabel}.\n\nResumen ejecutivo:\n${data.aiSummary}${
        data.aiCommentary ? `\n\nComentario:\n${data.aiCommentary}` : ''
      }\n\nSaludos,\nGDC Transporte de Carga`;
      const res = await sendReportByEmail({
        to: targets.join(','),
        subject,
        message,
        pdfBase64,
        fileName: reportFileName(data),
        monthKey: data.rangeStart || month || undefined,
      });
      if (res.ok) {
        setFeedback({
          type: 'ok',
          text: IS_MOCK
            ? `Envío simulado a ${targets.join(', ')} (modo demo).`
            : `Reporte enviado a ${targets.join(', ')}.`,
        });
      } else {
        setFeedback({ type: 'err', text: res.error ?? 'No se pudo enviar el reporte.' });
      }
    } catch (e) {
      setFeedback({ type: 'err', text: e instanceof Error ? e.message : 'Error al enviar.' });
    } finally {
      setSending(false);
    }
  }, [data, selectedEmails, authorized, fmt, captureCharts, month]);

  return (
    <Modal open={open} onClose={onClose} title="Generar reporte" size="full">
      <div className="space-y-6 text-[var(--text-primary)]">
        {/* Controles */}
        <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Tipo de reporte
            </p>
            <div className="flex flex-wrap gap-2">
              {SCOPE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setScope(opt.id)}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    scope === opt.id
                      ? 'border-[var(--accent-blue)] bg-[var(--accent-blue)] text-white shadow'
                      : 'border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]'
                  }`}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
            {scope !== 'historico' && (
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-[var(--text-muted)]">Mes</span>
                <select
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  disabled={availableMonths.length === 0}
                  className="min-w-[180px] rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  {availableMonths.length === 0 ? (
                    <option value="">Sin datos</option>
                  ) : (
                    availableMonths.map((ym) => (
                      <option key={ym} value={ym}>
                        {monthLabel(ym)}
                      </option>
                    ))
                  )}
                </select>
              </label>
            )}

            {scope === 'semanal' && (
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-[var(--text-muted)]">Semana</span>
                <select
                  value={weekIndex}
                  onChange={(e) => setWeekIndex(Number(e.target.value))}
                  className="min-w-[180px] rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  {WEEK_LABELS.map((label, i) => (
                    <option key={label} value={i}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {scope === 'historico' && (
              <p className="text-sm text-[var(--text-secondary)]">
                Incluye toda la operativa registrada hasta la fecha.
              </p>
            )}

            <div className="flex flex-1 flex-wrap items-end justify-end gap-2">
              <button
                type="button"
                onClick={() => void runGenerate()}
                disabled={generating || !canGenerate}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent-blue)] px-4 py-2 text-sm font-semibold text-white shadow hover:opacity-90 disabled:opacity-50"
              >
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {data ? 'Regenerar' : 'Generar reporte'}
              </button>
              <button
                type="button"
                onClick={() => void handleDownload()}
                disabled={!data}
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-muted)] disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                Descargar PDF
              </button>
              <button
                type="button"
                onClick={() => setEmailEnabled((v) => !v)}
                disabled={!data}
                className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50 ${
                  emailEnabled
                    ? 'border-[var(--accent-blue)] bg-[var(--accent-blue-muted)] text-[var(--accent-blue)]'
                    : 'border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-muted)]'
                }`}
              >
                <Mail className="h-4 w-4" />
                Enviar por email
              </button>
            </div>
          </div>

          {/* Panel de email — lista autorizada + multi-select on-demand */}
          {emailEnabled && (
            <div className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Correos autorizados
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <label className="flex flex-1 flex-col gap-1">
                    <span className="text-xs font-medium text-[var(--text-muted)]">Agregar email</span>
                    <input
                      type="email"
                      value={newEmailInput}
                      onChange={(e) => setNewEmailInput(e.target.value)}
                      placeholder="reports@example.com"
                      className="rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleAddAuthorized()}
                    disabled={managing || !newEmailInput.trim() || !onAddReportEmail}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium hover:bg-[var(--bg-muted)] disabled:opacity-50"
                  >
                    {managing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Agregar
                  </button>
                </div>
                {authorized.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">
                    No hay correos autorizados. Agregá destinatarios para enviar reportes.
                  </p>
                ) : (
                  <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
                    {authorized.map((entry) => {
                      const selected = selectedEmails.includes(entry.email);
                      return (
                        <li
                          key={entry.email}
                          className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm"
                        >
                          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleSelected(entry.email)}
                              className="rounded border-[var(--border)]"
                            />
                            <span className="truncate font-medium">{entry.email}</span>
                          </label>
                          <label className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                            <input
                              type="checkbox"
                              checked={entry.autoMonthly}
                              disabled={!onToggleAutoMonthly || managing}
                              onChange={() => {
                                if (!onToggleAutoMonthly) return;
                                setManaging(true);
                                void onToggleAutoMonthly(entry.email, !entry.autoMonthly).finally(() =>
                                  setManaging(false)
                                );
                              }}
                              className="rounded border-[var(--border)]"
                            />
                            Auto mensualmente
                          </label>
                          {onRemoveReportEmail && (
                            <button
                              type="button"
                              aria-label={`Quitar ${entry.email}`}
                              disabled={managing}
                              onClick={() => {
                                setManaging(true);
                                void onRemoveReportEmail(entry.email).finally(() => setManaging(false));
                                setSelectedEmails((prev) => prev.filter((e) => e !== entry.email));
                              }}
                              className="text-[var(--text-muted)] hover:text-[var(--accent-red)] disabled:opacity-50"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p className="text-[11px] text-[var(--text-muted)]">
                  Solo se puede enviar a correos de esta lista. «Auto mensualmente» recibe el HTML del día 5
                  (mes anterior).
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
                <p className="text-xs text-[var(--text-muted)]">
                  {selectedEmails.length} seleccionado{selectedEmails.length === 1 ? '' : 's'}
                </p>
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={sending || !data || selectedEmails.length === 0}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--accent-emerald)] px-4 py-2 text-sm font-semibold text-white shadow hover:opacity-90 disabled:opacity-50"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Enviar PDF
                </button>
              </div>

              {IS_MOCK && (
                <p className="text-xs text-[var(--text-muted)]">
                  Modo demo: el envío real requiere Apps Script redeployado (`sendReportEmail` + hojas
                  ReportEmails/ReportLog).
                </p>
              )}
            </div>
          )}

          {feedback && (
            <p
              className={`text-sm font-medium ${
                feedback.type === 'ok' ? 'text-[var(--accent-emerald)]' : 'text-[var(--accent-red)]'
              }`}
            >
              {feedback.text}
            </p>
          )}
        </div>

        {/* Estado vacío */}
        {!data && !generating && (
          <p className="text-sm text-[var(--text-muted)]">
            Elegí el tipo de reporte y el período, luego pulsá <strong>Generar reporte</strong>.
          </p>
        )}
        {generating && (
          <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Generando análisis…
          </p>
        )}

        {data && <ReportBody data={data} fmt={fmt} trendRef={trendRef} pieRef={pieRef} clientRef={clientRef} />}
      </div>
    </Modal>
  );
};

interface ReportBodyProps {
  data: GeneralReportData;
  fmt: (n: number) => string;
  trendRef: React.RefObject<HTMLDivElement>;
  pieRef: React.RefObject<HTMLDivElement>;
  clientRef: React.RefObject<HTMLDivElement>;
}

const ReportBody: React.FC<ReportBodyProps> = ({ data, fmt, trendRef, pieRef, clientRef }) => {
  const cmp = data.comparison;

  const kpis: { label: string; value: string; delta?: number; isPp?: boolean; invert?: boolean; sub?: string }[] = [
    { label: 'Ingresos generados', value: fmt(data.totalGenerado), delta: cmp.available ? cmp.revenueDelta : undefined },
    { label: 'Ingresos cobrados', value: fmt(data.totalCobrado), sub: `${data.collectionRate.toFixed(0)}% de cobranza` },
    { label: 'Pendiente de cobro', value: fmt(data.totalPendiente), sub: 'Facturado sin cobrar' },
    { label: 'Costos totales', value: fmt(data.totalCostos), delta: cmp.available ? cmp.costsDelta : undefined, invert: true },
    { label: 'Margen neto', value: fmt(data.netMargin), delta: cmp.available ? cmp.marginDelta : undefined },
    { label: 'Margen %', value: `${data.marginPct.toFixed(1)}%`, delta: cmp.available ? cmp.marginPctDeltaPp : undefined, isPp: true },
    { label: 'Viajes', value: String(data.totalTrips), sub: `${data.completedTrips} completados` },
    { label: 'Ticket promedio', value: fmt(data.avgTicket), sub: 'Ingreso por viaje' },
    {
      label: 'Costo por km',
      value: fmtPerKm(data.costPerKm),
      sub: `${Math.round(data.totalKm).toLocaleString('es-UY')} km`,
    },
    { label: 'Ingreso por km', value: fmtPerKm(data.revenuePerKm), sub: 'Generado / km' },
    {
      label: 'Margen por km',
      value: fmtPerKm(data.marginPerKm ?? data.revenuePerKm - data.costPerKm),
      sub: 'Ingreso/km − Costo/km',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Resumen ejecutivo */}
      <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
        <div className="flex items-center gap-2 text-[var(--accent-purple)]">
          <Sparkles className="h-5 w-5" />
          <h3 className="text-sm font-bold uppercase tracking-wide">Análisis ejecutivo · {data.periodLabel}</h3>
        </div>
        <p className="text-sm leading-relaxed text-[var(--text-primary)]">{data.aiSummary}</p>
        {data.aiCommentary?.trim() && (
          <div className="space-y-3 border-t border-[var(--border)] pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Comentario
            </p>
            {data.aiCommentary
              .split(/\n\n+/)
              .map((p) => p.trim())
              .filter(Boolean)
              .map((p) => (
                <p key={p.slice(0, 48)} className="text-sm leading-relaxed text-[var(--text-primary)]">
                  {p}
                </p>
              ))}
          </div>
        )}
      </section>

      {/* KPIs */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-[var(--text-secondary)]">Indicadores principales</h3>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {kpis.map((card) => {
            const positive =
              card.delta == null
                ? true
                : card.isPp
                  ? card.delta >= 0
                  : card.invert
                    ? card.delta <= 0
                    : card.delta >= 0;
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
                    {positive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                    {`${card.delta >= 0 ? '+' : ''}${card.delta.toFixed(1)}${card.isPp ? ' pp' : '%'} ${cmp.label}`}
                  </p>
                )}
                {card.delta == null && card.sub && (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">{card.sub}</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Charts: tendencia + categorías */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div ref={trendRef} className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
          <h3 className="mb-3 text-sm font-semibold">
            {data.seriesKind === 'semanal' ? 'Evolución semanal' : 'Evolución del período'}
          </h3>
          <div className="h-72 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.series}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS }} />
                <YAxis tick={{ fontSize: 11, fill: AXIS }} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="ingresos" name="Ingresos" fill="#3b82f6" radius={[3, 3, 0, 0]}>
                  {data.series.map((p) => (
                    <Cell key={p.key} fillOpacity={p.highlight ? 1 : 0.55} />
                  ))}
                </Bar>
                <Bar dataKey="costos" name="Costos" fill="#f59e0b" radius={[3, 3, 0, 0]}>
                  {data.series.map((p) => (
                    <Cell key={p.key} fillOpacity={p.highlight ? 1 : 0.55} />
                  ))}
                </Bar>
                <Line type="monotone" dataKey="margen" name="Margen" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div ref={pieRef} className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
          <h3 className="mb-3 text-sm font-semibold">Costos por categoría</h3>
          <div className="h-72 min-w-0">
            {data.costsByCategory.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
                Sin costos en el período.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.costsByCategory}
                    dataKey="total"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    outerRadius={95}
                    label={(props) => {
                      const name = String(props.name ?? '');
                      const pct = typeof props.percent === 'number' ? props.percent * 100 : 0;
                      return `${name} ${pct.toFixed(0)}%`;
                    }}
                    labelLine={false}
                  >
                    {data.costsByCategory.map((e) => (
                      <Cell key={e.category} fill={CATEGORY_FILL[e.category as CostCategory] ?? '#94a3b8'} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmt(v)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </section>

      {/* Chart: ingresos por cliente */}
      {data.clientBreakdown.length > 0 && (
        <section ref={clientRef} className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
          <h3 className="mb-3 text-sm font-semibold">Ingresos por cliente</h3>
          <div className="h-72 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.clientBreakdown} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: AXIS }} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: AXIS }} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Bar dataKey="revenue" name="Ingresos" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Destacados */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { t: 'Mejor cliente', l1: data.topClient.name, l2: `${fmt(data.topClient.revenue)} · ${data.topClient.trips} viajes` },
          { t: 'Ruta destacada', l1: data.topRoute.route, l2: `${fmt(data.topRoute.revenue)} · ${data.topRoute.count} viajes` },
          { t: 'Producto top', l1: data.topProduct.name, l2: `${fmt(data.topProduct.revenue)} · ${data.topProduct.tons.toFixed(1)} t` },
          { t: 'Mejor margen', l1: data.bestMarginTrip.id, l2: `${data.bestMarginTrip.client} · ${data.bestMarginTrip.marginPct.toFixed(1)}%` },
          {
            t: 'Menor margen',
            l1: data.worstMarginTrip.id,
            l2: `${data.worstMarginTrip.client} · ${data.worstMarginTrip.marginPct.toFixed(1)}%`,
            warn: data.worstMarginTrip.marginPct < 0,
          },
          { t: 'Revenue por km', l1: fmtPerKm(data.revenuePerKm), l2: `Costo/km: ${fmtPerKm(data.costPerKm)} · Margen/km: ${fmtPerKm(data.marginPerKm ?? data.revenuePerKm - data.costPerKm)}` },
        ].map((c) => (
          <div
            key={c.t}
            className={`rounded-xl border p-4 ${
              c.warn
                ? 'border-red-400/40 bg-red-500/10'
                : 'border-[var(--border)] bg-[var(--bg-elevated)]'
            }`}
          >
            <p className="text-xs font-semibold uppercase text-[var(--text-muted)]">{c.t}</p>
            <p className="mt-1 truncate text-sm font-medium" title={c.l1}>{c.l1}</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{c.l2}</p>
          </div>
        ))}
      </section>

      {/* Alertas y recomendaciones */}
      <section className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--accent-red)]">
            <AlertTriangle className="h-4 w-4" /> Alertas y riesgos
          </p>
          {data.aiAlerts.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">Sin alertas destacadas.</p>
          ) : (
            data.aiAlerts.map((a) => (
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
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--accent-blue)]">
            <Lightbulb className="h-4 w-4" /> Recomendaciones y oportunidades
          </p>
          {data.aiRecommendations.map((r) => (
            <div
              key={r}
              className="flex gap-2 rounded-lg border border-blue-200/40 bg-blue-500/10 px-3 py-2 text-sm text-[var(--text-primary)]"
            >
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
              <span>{r}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Tabla de viajes */}
      {data.trips.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-[var(--border)]">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <h3 className="text-sm font-semibold">Detalle de viajes ({data.trips.length})</h3>
          </div>
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="sticky top-0">
                <tr className="bg-[var(--bg-elevated)]">
                  {['ID', 'Fecha', 'Cliente', 'Ruta', 'Ingreso', 'Costos', 'Margen %'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase text-[var(--text-secondary)]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.trips.map((row, i) => {
                  const ing = tripRevenueUSD(row);
                  const pct = ing > 0 ? ((ing - row.totalCosts) / ing) * 100 : 0;
                  const color = ing <= 0 ? 'var(--text-muted)' : pct > 20 ? 'var(--accent-emerald)' : pct >= 5 ? 'var(--accent-amber)' : 'var(--accent-red)';
                  return (
                    <tr key={row.id} className={i % 2 ? 'bg-[var(--bg-table-alt)]' : 'bg-[var(--bg-table-row)]'}>
                      <td className="px-3 py-2 font-mono text-xs">{row.id}</td>
                      <td className="px-3 py-2">{row.fecha}</td>
                      <td className="px-3 py-2">{row.clientName}</td>
                      <td className="px-3 py-2">{row.origen} → {row.destino}</td>
                      <td className="px-3 py-2 text-right">{fmt(ing)}</td>
                      <td className="px-3 py-2 text-right">{fmt(row.totalCosts)}</td>
                      <td className="px-3 py-2 text-right font-medium" style={{ color }}>
                        {ing > 0 ? `${pct.toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="text-xs text-[var(--text-muted)]">
        Reporte generado el{' '}
        {new Date(data.generatedAt).toLocaleString('es-UY', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
        . Margen calculado sobre ingresos generados; combustible imputado por km recorrido.
      </p>
    </div>
  );
};
