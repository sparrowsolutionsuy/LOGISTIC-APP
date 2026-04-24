import React, { useCallback, useMemo, useState } from 'react';
import type { BillingStatus, Client, Trip } from '../../types';
import { uploadInvoice } from '../../services/api';
import { useSortableTable } from '../../hooks/useSortableTable';
import { useToast } from '../../hooks/useToast';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import Badge from '../ui/Badge';
import SortableHeader from '../ui/SortableHeader';
import {
  calcDaysDiff,
  formatDateUY,
  getBillingStatus,
  getBillingStatusLabel,
  roundMoney,
  tripGrandTotalUsd,
  tripIvaUsd,
  tripSubtotalUsd,
} from '../../utils/billing';
import { Check, FileText, Loader2, Receipt, UploadCloud } from 'lucide-react';

export interface BillingViewProps {
  trips: Trip[];
  clients: Client[];
  onInvoiceUploaded: (tripId: string, url: string) => void;
  onUpdateTrip: (trip: Trip) => Promise<void>;
  formatAmount?: (n: number) => string;
  convertAggregateToDisplay?: (amountUSD: number) => number;
}

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = 'application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isFinished(t: Trip): boolean {
  return t.estado === 'Completado' || t.estado === 'Cerrado';
}

function getClientName(clients: Client[], id: string): string {
  return clients.find((c) => c.id === id)?.nombreComercial ?? 'Desconocido';
}

function getBillingClientInfo(
  trip: Trip,
  clients: Client[]
): {
  razonSocial: string;
  rut: string;
  email: string;
  telefono?: string;
  direccion?: string;
  condicionIVA?: string;
  esDiferente: boolean;
} {
  const client = clients.find((c) => c.id === trip.clientId);
  if (!client) {
    return { razonSocial: 'Desconocido', rut: '—', email: '—', esDiferente: false };
  }
  if (client.tieneFacturacionDiferente && client.facturacion) {
    return { ...client.facturacion, esDiferente: true };
  }
  return {
    razonSocial: client.nombreComercial,
    rut: client.rut ?? '—',
    email: client.email ?? '—',
    telefono: client.telefono,
    esDiferente: false,
  };
}

function daysTone(days: number): { color: string; label: string } {
  if (days <= 7) {
    return { color: 'var(--accent-emerald)', label: 'Al día' };
  }
  if (days <= 15) {
    return { color: 'var(--accent-amber)', label: 'Atención' };
  }
  return { color: 'var(--accent-red)', label: 'Urgente' };
}

function BillingCheck({
  checked,
  disabled,
  onToggle,
  ariaLabel,
}: {
  checked: boolean;
  disabled?: boolean;
  onToggle: (next: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onToggle(!checked)}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border-2 transition-colors disabled:opacity-50"
      style={{
        borderColor: checked ? 'var(--accent-emerald)' : 'var(--border-strong)',
        backgroundColor: checked ? 'var(--accent-emerald)' : 'transparent',
      }}
    >
      {checked ? <Check className="h-4 w-4 text-[var(--text-on-accent)]" strokeWidth={3} aria-hidden /> : null}
    </button>
  );
}

type MainTab = 'sin' | 'gestion' | 'cobrados';

type SinFacturaSortKey = 'fecha' | 'id' | 'clientName' | 'totalUsd' | 'diasSinFacturar' | 'pesoKg';
type GestionSortKey = 'fecha' | 'id' | 'clientName' | 'totalUsd' | 'sortKey';

interface SinFacturaRow {
  trip: Trip;
  fecha: string;
  id: string;
  clientName: string;
  totalUsd: number;
  diasSinFacturar: number;
  pesoKg: number;
}

interface GestionRow {
  trip: Trip;
  fecha: string;
  id: string;
  clientName: string;
  totalUsd: number;
  sortKey: number;
}

export const BillingView: React.FC<BillingViewProps> = ({
  trips,
  clients,
  onInvoiceUploaded,
  onUpdateTrip,
  formatAmount: formatAmountProp,
  convertAggregateToDisplay: convertAggregateToDisplayProp,
}) => {
  const { showToast } = useToast();

  const fmtAgg = useCallback(
    (usd: number) => {
      if (formatAmountProp && convertAggregateToDisplayProp) {
        return formatAmountProp(convertAggregateToDisplayProp(usd));
      }
      return `USD ${usd.toLocaleString('es-UY', { maximumFractionDigits: 0 })}`;
    },
    [formatAmountProp, convertAggregateToDisplayProp]
  );
  const [mainTab, setMainTab] = useState<MainTab>('sin');

  const [sinClient, setSinClient] = useState('');
  const [sinDateFrom, setSinDateFrom] = useState('');
  const [sinDateTo, setSinDateTo] = useState('');
  const [sinSearch, setSinSearch] = useState('');
  const [sinSelected, setSinSelected] = useState<Set<string>>(() => new Set());

  const [gestionEstado, setGestionEstado] = useState<'todos' | BillingStatus>('todos');
  const [gestionClient, setGestionClient] = useState('');
  const [gestionDateFrom, setGestionDateFrom] = useState('');
  const [gestionDateTo, setGestionDateTo] = useState('');

  const [cobroMonth, setCobroMonth] = useState('');
  const [expandedClients, setExpandedClients] = useState<Set<string>>(() => new Set());

  const [invoiceModalTrip, setInvoiceModalTrip] = useState<Trip | null>(null);
  const [markGenInModal, setMarkGenInModal] = useState(false);
  const [emailSummaryOpen, setEmailSummaryOpen] = useState(false);

  const [uploadTarget, setUploadTarget] = useState<Trip | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadLabel, setUploadLabel] = useState('');

  const currentMonthPrefix = useMemo(() => todayIso().slice(0, 7), []);

  const kpis = useMemo(() => {
    const finished = trips.filter(isFinished);
    const sinFacturar = finished.filter((t) => t.facturaGenerada !== true).length;
    const solicitadas = finished.filter((t) => t.facturaSolicitada === true && t.facturaCobrada !== true).length;
    const cobradasMes = finished.filter(
      (t) =>
        t.facturaCobrada === true &&
        t.facturaFechaCobro &&
        t.facturaFechaCobro.slice(0, 7) === currentMonthPrefix
    ).length;
    const cobradosConFechas = finished.filter((t) => t.facturaCobrada === true && t.facturaFechaCobro);
    let avgCobro = 0;
    if (cobradosConFechas.length > 0) {
      const sum = cobradosConFechas.reduce(
        (acc, t) => acc + calcDaysDiff(t.fecha, t.facturaFechaCobro),
        0
      );
      avgCobro = Math.round((sum / cobradosConFechas.length) * 10) / 10;
    }
    return { sinFacturar, solicitadas, cobradasMes, avgCobro, cobradosCount: cobradosConFechas.length };
  }, [trips, currentMonthPrefix]);

  const sinFacturaBase = useMemo(
    () =>
      trips.filter(
        (t) => isFinished(t) && t.facturaGenerada !== true
      ),
    [trips]
  );

  const sinFacturaFiltered = useMemo(() => {
    return sinFacturaBase.filter((t) => {
      if (sinClient && t.clientId !== sinClient) {
        return false;
      }
      if (sinDateFrom && t.fecha < sinDateFrom) {
        return false;
      }
      if (sinDateTo && t.fecha > sinDateTo) {
        return false;
      }
      if (sinSearch.trim()) {
        const q = sinSearch.trim().toLowerCase();
        const blob = `${t.id} ${t.origen} ${t.destino} ${t.contenido}`.toLowerCase();
        if (!blob.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [sinFacturaBase, sinClient, sinDateFrom, sinDateTo, sinSearch]);

  const sinFacturaRows: SinFacturaRow[] = useMemo(() => {
    const rows = sinFacturaFiltered.map((t) => ({
      trip: t,
      fecha: t.fecha,
      id: t.id,
      clientName: getClientName(clients, t.clientId),
      totalUsd: tripSubtotalUsd(t),
      diasSinFacturar: calcDaysDiff(t.fecha),
      pesoKg: t.pesoKg,
    }));
    rows.sort((a, b) => b.diasSinFacturar - a.diasSinFacturar);
    return rows;
  }, [sinFacturaFiltered, clients]);

  const { sorted: sinSorted, sort: sinSort, handleSort: sinHandleSort } = useSortableTable<
    SinFacturaRow,
    SinFacturaSortKey
  >(sinFacturaRows, { column: 'diasSinFacturar', direction: 'desc' });

  const gestionBase = useMemo(() => trips.filter(isFinished), [trips]);

  const gestionFiltered = useMemo(() => {
    return gestionBase.filter((t) => {
      if (gestionClient && t.clientId !== gestionClient) {
        return false;
      }
      if (gestionDateFrom && t.fecha < gestionDateFrom) {
        return false;
      }
      if (gestionDateTo && t.fecha > gestionDateTo) {
        return false;
      }
      if (gestionEstado !== 'todos') {
        const st = getBillingStatus(t);
        if (st !== gestionEstado) {
          return false;
        }
      }
      return true;
    });
  }, [gestionBase, gestionClient, gestionDateFrom, gestionDateTo, gestionEstado]);

  const gestionRows: GestionRow[] = useMemo(() => {
    const rows = gestionFiltered.map((t) => ({
      trip: t,
      fecha: t.fecha,
      id: t.id,
      clientName: getClientName(clients, t.clientId),
      totalUsd: tripGrandTotalUsd(t),
      sortKey: (t.facturaSolicitada ? 1e15 : 0) + new Date(`${t.fecha}T12:00:00`).getTime(),
    }));
    rows.sort((a, b) => b.sortKey - a.sortKey || b.fecha.localeCompare(a.fecha));
    return rows;
  }, [gestionFiltered, clients]);

  const { sorted: gestionSorted, sort: gestionSort, handleSort: gestionHandleSort } = useSortableTable<
    GestionRow,
    GestionSortKey
  >(gestionRows, { column: 'sortKey', direction: 'desc' });

  const cobradosTrips = useMemo(
    () =>
      trips.filter(
        (t) => t.facturaCobrada === true && (!cobroMonth || (t.facturaFechaCobro ?? '').startsWith(cobroMonth))
      ),
    [trips, cobroMonth]
  );

  const cobroMonthOptions = useMemo(() => {
    const s = new Set<string>();
    trips
      .filter((t) => t.facturaCobrada && t.facturaFechaCobro)
      .forEach((t) => s.add(t.facturaFechaCobro!.slice(0, 7)));
    return Array.from(s).sort((a, b) => b.localeCompare(a));
  }, [trips]);

  const cobradosByClient = useMemo(() => {
    const m = new Map<string, Trip[]>();
    for (const t of cobradosTrips) {
      const arr = m.get(t.clientId) ?? [];
      arr.push(t);
      m.set(t.clientId, arr);
    }
    return Array.from(m.entries())
      .map(([clientId, list]) => {
        const totalUsd = list.reduce((acc, tr) => acc + tripGrandTotalUsd(tr), 0);
        const daysList = list.map((tr) => calcDaysDiff(tr.fecha, tr.facturaFechaCobro));
        const avgDays = daysList.length ? daysList.reduce((a, b) => a + b, 0) / daysList.length : 0;
        return {
          clientId,
          name: getClientName(clients, clientId),
          trips: list,
          count: list.length,
          totalUsd,
          avgDays,
        };
      })
      .sort((a, b) => a.avgDays - b.avgDays);
  }, [cobradosTrips, clients]);

  const cobradosAnalytics = useMemo(() => {
    const total = cobradosTrips.reduce((acc, t) => acc + tripGrandTotalUsd(t), 0);
    const daysArr = cobradosTrips.map((t) => calcDaysDiff(t.fecha, t.facturaFechaCobro));
    const avg =
      daysArr.length > 0 ? Math.round((daysArr.reduce((a, b) => a + b, 0) / daysArr.length) * 10) / 10 : 0;
    const ranked = cobradosByClient.filter((c) => c.count > 0);
    const fastest = ranked[0];
    const slowest = ranked.length > 1 ? ranked[ranked.length - 1] : null;
    return { total, avg, fastest, slowest };
  }, [cobradosTrips, cobradosByClient]);

  const toggleSinSelect = useCallback((id: string) => {
    setSinSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) {
        n.delete(id);
      } else {
        n.add(id);
      }
      return n;
    });
  }, []);

  const selectedSinTrips = useMemo(
    () => trips.filter((t) => sinSelected.has(t.id)),
    [trips, sinSelected]
  );

  const runUpload = useCallback(
    (trip: Trip, file: File) => {
      if (file.size > MAX_BYTES) {
        showToast('El archivo supera 5 MB.', 'warning');
        return;
      }
      const clientName = getClientName(clients, trip.clientId).replace(/\s+/g, '');
      const ext = file.name.includes('.') ? file.name.split('.').pop() : 'pdf';
      const fileName = `Factura_${trip.id}_${clientName}.${ext ?? 'pdf'}`;
      const mimeType = file.type || 'application/octet-stream';
      setUploadLabel(file.name);
      setUploading(true);
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        try {
          const raw = reader.result;
          if (typeof raw !== 'string') {
            showToast('No se pudo leer el archivo.', 'warning');
            return;
          }
          const parts = raw.split(',');
          const fileData = parts.length > 1 ? parts[1] : '';
          if (!fileData) {
            showToast('No se pudo obtener el contenido del archivo.', 'warning');
            return;
          }
          const url = await uploadInvoice(trip.id, fileData, fileName, mimeType);
          if (url) {
            onInvoiceUploaded(trip.id, url);
            setUploadTarget(null);
            showToast('Factura adjuntada correctamente.', 'success');
          } else {
            showToast('No se recibió URL de factura.', 'warning');
          }
        } catch (e) {
          console.error(e);
          showToast('Error al subir la factura.', 'error');
        } finally {
          setUploading(false);
          setUploadLabel('');
        }
      };
      reader.onerror = () => {
        setUploading(false);
        setUploadLabel('');
        showToast('Error al leer el archivo.', 'error');
      };
    },
    [clients, onInvoiceUploaded, showToast]
  );

  const safeUpdate = useCallback(
    async (trip: Trip) => {
      try {
        await onUpdateTrip(trip);
      } catch (e) {
        console.error(e);
        showToast('No se pudo guardar el viaje.', 'error');
      }
    },
    [onUpdateTrip, showToast]
  );

  const copyText = async (text: string, okMsg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(okMsg, 'success');
    } catch {
      showToast('No se pudo copiar al portapapeles.', 'warning');
    }
  };

  const buildInvoiceBlock = (trip: Trip): string => {
    const billingInfo = getBillingClientInfo(trip, clients);
    const client = clients.find((c) => c.id === trip.clientId) ?? null;
    const sub = tripSubtotalUsd(trip);
    const iva = tripIvaUsd(trip);
    const tot = tripGrandTotalUsd(trip);
    const lines = [
      '── CLIENTE ──────────────────────────',
      `Razón Social:     ${billingInfo.razonSocial}`,
      `RUT:              ${billingInfo.rut}`,
      `Email:            ${billingInfo.email}`,
      `Teléfono:         ${billingInfo.telefono ?? ''}`,
      `Departamento:     ${client?.departamento ?? ''} / ${client?.localidad ?? ''}`,
      `Condición IVA:    ${billingInfo.condicionIVA ?? ''}`,
      `Dirección fiscal: ${billingInfo.direccion ?? ''}`,
      '',
      '── SERVICIO ─────────────────────────',
      `N° Referencia:    ${trip.id}`,
      `Fecha de viaje:   ${formatDateUY(trip.fecha)}`,
      `Origen:           ${trip.origen}`,
      `Destino:          ${trip.destino}`,
      `Contenido:        ${trip.contenido}`,
      '',
      '── VALORES ──────────────────────────',
      `Peso cargado:     ${trip.pesoKg} kg / ${(trip.pesoKg / 1000).toFixed(3)} toneladas`,
      `Kilómetros:       ${trip.kmRecorridos} km`,
      `Tarifa unitaria:  USD ${trip.tarifa} / tonelada`,
      `Subtotal:         USD ${sub.toFixed(2)}`,
      `IVA (22%):        USD ${iva.toFixed(2)}`,
      `TOTAL:            USD ${tot.toFixed(2)}`,
    ];
    return lines.join('\n');
  };

  const padBottom = sinSelected.size > 0 ? 'pb-28' : '';

  return (
    <div className={`space-y-6 ${padBottom}`}>
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Facturación integral</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Pipeline de facturas, solicitud de pago y cobros — integrado con viajes completados o cerrados.
        </p>
      </div>

      <div
        className="flex flex-wrap gap-3"
        style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}
      >
        <Card className="min-w-[140px] flex-1" padding="md" title="Sin facturar">
          <p className="text-2xl font-bold" style={{ color: 'var(--accent-amber)' }}>
            {kpis.sinFacturar}
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Completados / cerrados sin PDF generado</p>
        </Card>
        <Card className="min-w-[140px] flex-1" padding="md" title="Solicitadas">
          <p className="text-2xl font-bold" style={{ color: 'var(--accent-blue)' }}>
            {kpis.solicitadas}
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Pago solicitado, pendiente de cobro</p>
        </Card>
        <Card className="min-w-[140px] flex-1" padding="md" title="Cobradas este mes">
          <p className="text-2xl font-bold" style={{ color: 'var(--accent-emerald)' }}>
            {kpis.cobradasMes}
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Mes calendario actual</p>
        </Card>
        <Card className="min-w-[140px] flex-1" padding="md" title="Tiempo promedio cobro">
          <p className="text-2xl font-bold" style={{ color: 'var(--text-muted)' }}>
            {kpis.cobradosCount === 0 ? '—' : `${kpis.avgCobro} días`}
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Desde fecha viaje hasta cobro</p>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-3">
        {(
          [
            { id: 'sin' as const, label: 'Sin Factura' },
            { id: 'gestion' as const, label: 'Gestión' },
            { id: 'cobrados' as const, label: 'Cobrados' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setMainTab(t.id)}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            style={{
              backgroundColor: mainTab === t.id ? 'var(--accent-blue-muted)' : 'transparent',
              color: mainTab === t.id ? 'var(--accent-blue)' : 'var(--text-secondary)',
              border: `1px solid ${mainTab === t.id ? 'var(--accent-blue)' : 'var(--border)'}`,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {mainTab === 'sin' && (
        <section className="space-y-4">
          <Card title="Filtros" padding="md">
            <div className="flex flex-col gap-3 md:flex-row md:flex-wrap">
              <label className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
                Cliente
                <select
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-sm text-[var(--text-primary)]"
                  value={sinClient}
                  onChange={(e) => setSinClient(e.target.value)}
                >
                  <option value="">Todos</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombreComercial}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
                Desde
                <input
                  type="date"
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-sm text-[var(--text-primary)]"
                  value={sinDateFrom}
                  onChange={(e) => setSinDateFrom(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
                Hasta
                <input
                  type="date"
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-sm text-[var(--text-primary)]"
                  value={sinDateTo}
                  onChange={(e) => setSinDateTo(e.target.value)}
                />
              </label>
              <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs text-[var(--text-secondary)]">
                Buscar
                <input
                  type="search"
                  placeholder="ID, origen, destino, contenido…"
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-sm text-[var(--text-primary)]"
                  value={sinSearch}
                  onChange={(e) => setSinSearch(e.target.value)}
                />
              </label>
            </div>
          </Card>

          <div className="overflow-hidden rounded-xl border border-[var(--border)] shadow-[var(--shadow-sm)]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                    <th className="w-10 px-2 py-3 text-center text-[var(--text-secondary)]" scope="col">
                      <span className="sr-only">Seleccionar</span>
                    </th>
                    <SortableHeader
                      label="Fecha"
                      column="fecha"
                      currentColumn={sinSort.column}
                      direction={sinSort.direction}
                      onClick={(c) => sinHandleSort(c as SinFacturaSortKey)}
                    />
                    <SortableHeader
                      label="ID"
                      column="id"
                      currentColumn={sinSort.column}
                      direction={sinSort.direction}
                      onClick={(c) => sinHandleSort(c as SinFacturaSortKey)}
                    />
                    <SortableHeader
                      label="Cliente"
                      column="clientName"
                      currentColumn={sinSort.column}
                      direction={sinSort.direction}
                      onClick={(c) => sinHandleSort(c as SinFacturaSortKey)}
                    />
                    <th
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
                    >
                      Ruta
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
                    >
                      Contenido
                    </th>
                    <SortableHeader
                      label="Kg"
                      column="pesoKg"
                      currentColumn={sinSort.column}
                      direction={sinSort.direction}
                      onClick={(c) => sinHandleSort(c as SinFacturaSortKey)}
                      align="right"
                    />
                    <th
                      scope="col"
                      className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
                    >
                      Km
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
                    >
                      Tarifa USD/ton
                    </th>
                    <SortableHeader
                      label="Total USD"
                      column="totalUsd"
                      currentColumn={sinSort.column}
                      direction={sinSort.direction}
                      onClick={(c) => sinHandleSort(c as SinFacturaSortKey)}
                      align="right"
                    />
                    <SortableHeader
                      label="Días sin facturar"
                      column="diasSinFacturar"
                      currentColumn={sinSort.column}
                      direction={sinSort.direction}
                      onClick={(c) => sinHandleSort(c as SinFacturaSortKey)}
                      align="center"
                    />
                    <th
                      scope="col"
                      className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
                    >
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                  {sinSorted.map((row, i) => {
                    const { trip } = row;
                    const tone = daysTone(row.diasSinFacturar);
                    const sel = sinSelected.has(trip.id);
                    return (
                      <tr
                        key={trip.id}
                        style={{
                          backgroundColor: i % 2 === 0 ? 'var(--bg-table-row)' : 'var(--bg-table-alt)',
                        }}
                        className="hover:bg-[var(--bg-table-hover)]"
                      >
                        <td className="px-2 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={sel}
                            onChange={() => toggleSinSelect(trip.id)}
                            aria-label={`Seleccionar viaje ${trip.id}`}
                            className="h-4 w-4 rounded border-[var(--border-strong)]"
                          />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-[var(--text-primary)]">{trip.fecha}</td>
                        <td className="px-4 py-3 font-mono text-xs text-[var(--text-primary)]">{trip.id}</td>
                        <td className="px-4 py-3 text-[var(--text-primary)]">{row.clientName}</td>
                        <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">
                          {trip.origen} → {trip.destino}
                        </td>
                        <td className="max-w-[140px] truncate px-4 py-3 text-xs text-[var(--text-secondary)]">
                          {trip.contenido}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-[var(--text-primary)]">
                          {trip.pesoKg.toLocaleString('es-UY')}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-[var(--text-primary)]">
                          {trip.kmRecorridos}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-[var(--text-primary)]">{trip.tarifa}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--text-primary)]">
                          ${row.totalUsd.toLocaleString('es-UY', { maximumFractionDigits: 0 })}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-xs font-semibold" style={{ color: tone.color }}>
                            {row.diasSinFacturar} ({tone.label})
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            icon={<FileText className="h-4 w-4" aria-hidden />}
                            aria-label={`Datos para factura ${trip.id}`}
                            onClick={() => {
                              setMarkGenInModal(false);
                              setInvoiceModalTrip(trip);
                            }}
                          >
                            <span className="sr-only">Datos factura</span>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {sinSorted.length === 0 && (
                    <tr>
                      <td colSpan={12} className="px-4 py-12 text-center text-[var(--text-muted)]">
                        No hay viajes pendientes de generar factura con los filtros actuales.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {mainTab === 'gestion' && (
        <section className="space-y-4">
          <Card title="Filtros" padding="md">
            <div className="flex flex-col gap-3 md:flex-row md:flex-wrap">
              <label className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
                Estado facturación
                <select
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-sm text-[var(--text-primary)]"
                  value={gestionEstado}
                  onChange={(e) => setGestionEstado(e.target.value as 'todos' | BillingStatus)}
                >
                  <option value="todos">Todos</option>
                  {( ['pendiente', 'generada', 'solicitada', 'cobrada'] as const).map((s) => (
                    <option key={s} value={s}>
                      {getBillingStatusLabel(s)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
                Cliente
                <select
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-sm text-[var(--text-primary)]"
                  value={gestionClient}
                  onChange={(e) => setGestionClient(e.target.value)}
                >
                  <option value="">Todos</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombreComercial}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
                Desde
                <input
                  type="date"
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-sm text-[var(--text-primary)]"
                  value={gestionDateFrom}
                  onChange={(e) => setGestionDateFrom(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
                Hasta
                <input
                  type="date"
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-sm text-[var(--text-primary)]"
                  value={gestionDateTo}
                  onChange={(e) => setGestionDateTo(e.target.value)}
                />
              </label>
            </div>
          </Card>

          <div className="overflow-hidden rounded-xl border border-[var(--border)] shadow-[var(--shadow-sm)]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                    <SortableHeader
                      label="Fecha"
                      column="fecha"
                      currentColumn={gestionSort.column}
                      direction={gestionSort.direction}
                      onClick={(c) => gestionHandleSort(c as GestionSortKey)}
                    />
                    <SortableHeader
                      label="ID"
                      column="id"
                      currentColumn={gestionSort.column}
                      direction={gestionSort.direction}
                      onClick={(c) => gestionHandleSort(c as GestionSortKey)}
                    />
                    <SortableHeader
                      label="Cliente"
                      column="clientName"
                      currentColumn={gestionSort.column}
                      direction={gestionSort.direction}
                      onClick={(c) => gestionHandleSort(c as GestionSortKey)}
                    />
                    <th
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
                    >
                      Ruta
                    </th>
                    <SortableHeader
                      label="Total USD"
                      column="totalUsd"
                      currentColumn={gestionSort.column}
                      direction={gestionSort.direction}
                      onClick={(c) => gestionHandleSort(c as GestionSortKey)}
                      align="right"
                    />
                    <th
                      scope="col"
                      className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
                    >
                      Generada
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
                    >
                      Solicitada
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
                    >
                      Cobrada
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
                    >
                      Días
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
                    >
                      Estado
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
                    >
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                  {gestionSorted.map((row, i) => {
                    const { trip } = row;
                    const d = trip.facturaCobrada
                      ? calcDaysDiff(trip.fecha, trip.facturaFechaCobro)
                      : calcDaysDiff(trip.fecha);
                    const tone = daysTone(d);
                    const tip = trip.facturaCobrada
                      ? `Cobrado en ${d} día${d === 1 ? '' : 's'}`
                      : `En curso — ${d} día${d === 1 ? '' : 's'} desde el viaje`;
                    return (
                      <tr
                        key={trip.id}
                        style={{
                          backgroundColor: i % 2 === 0 ? 'var(--bg-table-row)' : 'var(--bg-table-alt)',
                        }}
                        className="hover:bg-[var(--bg-table-hover)]"
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-[var(--text-primary)]">{trip.fecha}</td>
                        <td className="px-4 py-3 font-mono text-xs text-[var(--text-primary)]">{trip.id}</td>
                        <td className="px-4 py-3 text-[var(--text-primary)]">{row.clientName}</td>
                        <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">
                          {trip.origen} → {trip.destino}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--text-primary)]">
                          ${row.totalUsd.toLocaleString('es-UY', { maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <BillingCheck
                            checked={trip.facturaGenerada === true}
                            ariaLabel={`Factura generada ${trip.id}`}
                            onToggle={(checked) =>
                              void safeUpdate({ ...trip, facturaGenerada: checked })
                            }
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <BillingCheck
                            checked={trip.facturaSolicitada === true}
                            ariaLabel={`Factura solicitada ${trip.id}`}
                            onToggle={(checked) =>
                              void safeUpdate({
                                ...trip,
                                facturaSolicitada: checked,
                                facturaFechaSolicitud: checked ? todayIso() : undefined,
                              })
                            }
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <BillingCheck
                            checked={trip.facturaCobrada === true}
                            ariaLabel={`Factura cobrada ${trip.id}`}
                            onToggle={(checked) =>
                              void safeUpdate({
                                ...trip,
                                facturaCobrada: checked,
                                facturaFechaCobro: checked ? todayIso() : undefined,
                              })
                            }
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className="cursor-help text-xs font-semibold underline decoration-dotted"
                            style={{ color: tone.color }}
                            title={tip}
                          >
                            {d}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge billingStatus={getBillingStatus(trip)} size="sm" />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            icon={<FileText className="h-4 w-4" aria-hidden />}
                            aria-label={`Datos para factura ${trip.id}`}
                            onClick={() => {
                              setMarkGenInModal(false);
                              setInvoiceModalTrip(trip);
                            }}
                          >
                            <span className="sr-only">Datos factura</span>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {gestionSorted.length === 0 && (
                    <tr>
                      <td colSpan={11} className="px-4 py-12 text-center text-[var(--text-muted)]">
                        No hay viajes que coincidan con los filtros.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {mainTab === 'cobrados' && (
        <section className="space-y-4">
          <Card title="Filtros" padding="md">
            <label className="flex max-w-xs flex-col gap-1 text-xs text-[var(--text-secondary)]">
              Mes de cobro
              <select
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-sm text-[var(--text-primary)]"
                value={cobroMonth}
                onChange={(e) => setCobroMonth(e.target.value)}
              >
                <option value="">Todos los meses</option>
                {cobroMonthOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          </Card>

          <div
            className="flex flex-wrap gap-3"
            style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}
          >
            <Card className="min-w-[160px] flex-1" padding="md" title="Total cobrado (filtro)">
              <p className="text-xl font-bold text-[var(--accent-emerald)]">
                {fmtAgg(cobradosAnalytics.total)}
              </p>
            </Card>
            <Card className="min-w-[160px] flex-1" padding="md" title="Tiempo promedio de cobro">
              <p className="text-xl font-bold text-[var(--text-primary)]">
                {cobradosTrips.length === 0 ? '—' : `${cobradosAnalytics.avg} días`}
              </p>
            </Card>
            <Card className="min-w-[160px] flex-1" padding="md" title="Cliente más rápido">
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                {cobradosAnalytics.fastest?.name ?? '—'}
              </p>
              {cobradosAnalytics.fastest && (
                <p className="text-xs text-[var(--text-muted)]">
                  ~{Math.round(cobradosAnalytics.fastest.avgDays * 10) / 10} días prom.
                </p>
              )}
            </Card>
            <Card className="min-w-[160px] flex-1" padding="md" title="Cliente más lento">
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                {cobradosAnalytics.slowest?.name ?? '—'}
              </p>
              {cobradosAnalytics.slowest && (
                <p className="text-xs text-[var(--text-muted)]">
                  ~{Math.round(cobradosAnalytics.slowest.avgDays * 10) / 10} días prom.
                </p>
              )}
            </Card>
          </div>

          <div className="overflow-hidden rounded-xl border border-[var(--border)] shadow-[var(--shadow-sm)]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-[var(--text-secondary)]">
                      Cliente
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-[var(--text-secondary)]">
                      Viajes
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-[var(--text-secondary)]">
                      Total cobrado
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-[var(--text-secondary)]">
                      Prom. días cobro
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                  {cobradosByClient.map((row, i) => {
                    const open = expandedClients.has(row.clientId);
                    return (
                      <React.Fragment key={row.clientId}>
                        <tr
                          style={{
                            backgroundColor: i % 2 === 0 ? 'var(--bg-table-row)' : 'var(--bg-table-alt)',
                          }}
                          className="cursor-pointer hover:bg-[var(--bg-table-hover)]"
                          onClick={() =>
                            setExpandedClients((prev) => {
                              const n = new Set(prev);
                              if (n.has(row.clientId)) {
                                n.delete(row.clientId);
                              } else {
                                n.add(row.clientId);
                              }
                              return n;
                            })
                          }
                        >
                          <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{row.name}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-[var(--text-primary)]">
                            {row.count}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--text-primary)]">
                            {fmtAgg(row.totalUsd)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-[var(--text-primary)]">
                            {Math.round(row.avgDays * 10) / 10}
                          </td>
                        </tr>
                        {open && (
                          <tr style={{ backgroundColor: 'var(--bg-muted)' }}>
                            <td colSpan={4} className="px-4 py-3">
                              <div className="overflow-x-auto">
                                <table className="w-full min-w-[520px] text-xs">
                                  <thead>
                                    <tr className="text-left text-[var(--text-muted)]">
                                      <th className="py-1 pr-2">ID</th>
                                      <th className="py-1 pr-2">Fecha viaje</th>
                                      <th className="py-1 pr-2">Fecha cobro</th>
                                      <th className="py-1 pr-2">Días</th>
                                      <th className="py-1 text-right">Total USD</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {row.trips.map((t) => (
                                      <tr key={t.id} className="text-[var(--text-primary)]">
                                        <td className="py-1 pr-2 font-mono">{t.id}</td>
                                        <td className="py-1 pr-2">{t.fecha}</td>
                                        <td className="py-1 pr-2">{t.facturaFechaCobro ?? '—'}</td>
                                        <td className="py-1 pr-2">
                                          {calcDaysDiff(t.fecha, t.facturaFechaCobro)}
                                        </td>
                                        <td className="py-1 text-right font-medium">
                                          {fmtAgg(tripGrandTotalUsd(t))}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {cobradosByClient.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-12 text-center text-[var(--text-muted)]">
                        No hay cobros registrados para el período seleccionado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {sinSelected.size > 0 && (
        <div
          className="fixed inset-x-0 bottom-0 z-[70] flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3 shadow-[var(--shadow-lg)]"
          style={{
            backgroundColor: 'var(--bg-surface)',
            paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
          }}
        >
          <p className="text-sm font-medium text-[var(--text-primary)]">
            {sinSelected.size} viaje(s) seleccionado(s)
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setEmailSummaryOpen(true)}>
              Ver resumen para correo
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={async () => {
                const list = trips.filter((t) => sinSelected.has(t.id));
                for (const t of list) {
                  await safeUpdate({ ...t, facturaGenerada: true });
                }
                setSinSelected(new Set());
                showToast('Marcados como generada.', 'success');
              }}
            >
              Marcar como Generada
            </Button>
          </div>
        </div>
      )}

      <Modal
        open={!!invoiceModalTrip && !uploadTarget}
        onClose={() => {
          setInvoiceModalTrip(null);
          setMarkGenInModal(false);
        }}
        title={invoiceModalTrip ? `Datos para generar factura — ${invoiceModalTrip.id}` : ''}
        size="lg"
      >
        {invoiceModalTrip && (
          <div className="space-y-4 text-sm text-[var(--text-secondary)]">
            {getBillingClientInfo(invoiceModalTrip, clients).esDiferente && (
              <div className="flex items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--accent-amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent-amber)_10%,transparent)] px-3 py-1.5 text-xs text-[var(--accent-amber)]">
                <Receipt size={12} />
                Usando datos de facturación específicos (distintos al cliente operativo)
              </div>
            )}
            <pre className="whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4 font-mono text-xs text-[var(--text-primary)]">
              {buildInvoiceBlock(invoiceModalTrip)}
            </pre>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  void copyText(
                    buildInvoiceBlock(invoiceModalTrip),
                    'Copiado.'
                  )
                }
              >
                Copiar todo
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={<UploadCloud className="h-4 w-4" aria-hidden />}
                disabled={uploading}
                onClick={() => setUploadTarget(invoiceModalTrip)}
              >
                Adjuntar PDF de factura
              </Button>
            </div>
            <label className="flex cursor-pointer items-start gap-2 text-[var(--text-primary)]">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-[var(--border-strong)]"
                checked={markGenInModal}
                onChange={(e) => setMarkGenInModal(e.target.checked)}
              />
              <span>Marcar factura como generada</span>
            </label>
            <div className="flex justify-end gap-2 border-t border-[var(--border-subtle)] pt-4">
              <Button type="button" variant="ghost" size="sm" onClick={() => setInvoiceModalTrip(null)}>
                Cerrar
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={!markGenInModal}
                onClick={async () => {
                  await safeUpdate({ ...invoiceModalTrip, facturaGenerada: true });
                  setInvoiceModalTrip(null);
                  setMarkGenInModal(false);
                }}
              >
                Aplicar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!uploadTarget}
        onClose={() => {
          if (!uploading) {
            setUploadTarget(null);
          }
        }}
        title="Adjuntar PDF de factura"
        size="md"
      >
        {uploadTarget && (
          <div className="space-y-4 text-sm text-[var(--text-secondary)]">
            <p>
              Viaje <span className="font-mono font-medium text-[var(--text-primary)]">{uploadTarget.id}</span>
            </p>
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--bg-elevated)] p-6">
              <FileText className="mb-2 h-8 w-8 text-[var(--text-muted)]" aria-hidden />
              <span style={{ color: 'var(--accent-blue)' }}>Elegir archivo</span>
              <input
                type="file"
                accept={ACCEPT}
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f && uploadTarget) {
                    runUpload(uploadTarget, f);
                  }
                }}
              />
            </label>
            {uploading && (
              <div className="flex items-center justify-center gap-2" style={{ color: 'var(--accent-blue)' }}>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Subiendo{uploadLabel ? `: ${uploadLabel}` : '…'}
              </div>
            )}
            <div className="flex justify-end">
              <Button type="button" variant="ghost" size="sm" disabled={uploading} onClick={() => setUploadTarget(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={emailSummaryOpen}
        onClose={() => setEmailSummaryOpen(false)}
        title="Resumen de viajes para solicitud de pago"
        size="lg"
      >
        <EmailSummaryBody
          trips={selectedSinTrips}
          clients={clients}
          onCopyTsv={() => {
            const rows = emailSummaryTsvRows(selectedSinTrips);
            void copyText(rows.join('\n'), 'Tabla copiada (TSV).');
          }}
          onMarkSolicitados={async () => {
            const hoy = todayIso();
            for (const t of selectedSinTrips) {
              await safeUpdate({
                ...t,
                facturaSolicitada: true,
                facturaFechaSolicitud: hoy,
              });
            }
            setSinSelected(new Set());
            setEmailSummaryOpen(false);
            showToast('Marcados como solicitados.', 'success');
          }}
        />
      </Modal>
    </div>
  );
};

function emailSummaryTsvRows(trips: Trip[]): string[] {
  const header = [
    'Fecha',
    'Lugar de Carga',
    'Producto',
    'Lugar de destino',
    'Mat Camion',
    'Kg cargados',
    'Km',
    'Remito Proveedor',
    'Moneda',
    'P.Unitario',
    'Precio',
    'IVA',
    'TOTAL',
  ].join('\t');
  const body = trips.map((t) => {
    const precio = roundMoney(t.tarifa * (t.pesoKg / 1000));
    const iva = roundMoney(precio * 0.22);
    const total = roundMoney(precio + iva);
    return [
      t.fecha,
      t.origen,
      t.contenido,
      t.destino,
      '',
      String(t.pesoKg),
      String(t.kmRecorridos),
      t.remitoUrl ?? '',
      'USD',
      String(t.tarifa),
      String(precio),
      String(iva),
      String(total),
    ].join('\t');
  });
  const sumKg = trips.reduce((a, t) => a + t.pesoKg, 0);
  const sumPrecio = roundMoney(trips.reduce((a, t) => a + t.tarifa * (t.pesoKg / 1000), 0));
  const sumIva = roundMoney(sumPrecio * 0.22);
  const sumTot = roundMoney(sumPrecio + sumIva);
  const footer = ['TOTALES', '', '', '', '', String(sumKg), '', '', '', '', String(sumPrecio), String(sumIva), String(sumTot)].join(
    '\t'
  );
  return [header, ...body, footer];
}

function EmailSummaryBody({
  trips,
  clients,
  onCopyTsv,
  onMarkSolicitados,
}: {
  trips: Trip[];
  clients: Client[];
  onCopyTsv: () => void;
  onMarkSolicitados: () => void;
}) {
  const precios = useMemo(
    () =>
      trips.map((t) => {
        const precio = roundMoney(t.tarifa * (t.pesoKg / 1000));
        const iva = roundMoney(precio * 0.22);
        const total = roundMoney(precio + iva);
        return { t, precio, iva, total };
      }),
    [trips]
  );
  const totals = useMemo(() => {
    const sumKg = trips.reduce((a, t) => a + t.pesoKg, 0);
    const sumPrecio = roundMoney(trips.reduce((a, t) => a + t.tarifa * (t.pesoKg / 1000), 0));
    const sumIva = roundMoney(sumPrecio * 0.22);
    const sumTot = roundMoney(sumPrecio + sumIva);
    return { sumKg, sumPrecio, sumIva, sumTot };
  }, [trips]);

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-white text-slate-900">
        <table className="w-full min-w-[900px] border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-300 bg-slate-100">
              {[
                'Fecha',
                'Lugar de Carga',
                'Producto',
                'Lugar de destino',
                'Mat Camion',
                'Kg cargados',
                'Km',
                'Remito Proveedor',
                'Moneda',
                'P.Unitario',
                'Precio',
                'IVA',
                'TOTAL',
              ].map((h) => (
                <th key={h} className="border border-slate-300 px-2 py-2 text-left font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {precios.map(({ t, precio, iva, total }) => (
              <tr key={t.id}>
                <td className="border border-slate-300 px-2 py-1">{t.fecha}</td>
                <td className="border border-slate-300 px-2 py-1">{t.origen}</td>
                <td className="border border-slate-300 px-2 py-1">{t.contenido}</td>
                <td className="border border-slate-300 px-2 py-1">{t.destino}</td>
                <td className="border border-slate-300 px-2 py-1" />
                <td className="border border-slate-300 px-2 py-1 text-right">{t.pesoKg}</td>
                <td className="border border-slate-300 px-2 py-1 text-right">{t.kmRecorridos}</td>
                <td className="border border-slate-300 px-2 py-1 break-all">{t.remitoUrl ?? ''}</td>
                <td className="border border-slate-300 px-2 py-1">USD</td>
                <td className="border border-slate-300 px-2 py-1 text-right">{t.tarifa}</td>
                <td className="border border-slate-300 px-2 py-1 text-right">{precio}</td>
                <td className="border border-slate-300 px-2 py-1 text-right">{iva}</td>
                <td className="border border-slate-300 px-2 py-1 text-right font-semibold">{total}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 font-semibold">
              <td className="border border-slate-300 px-2 py-1" colSpan={5}>
                Totales
              </td>
              <td className="border border-slate-300 px-2 py-1 text-right">{totals.sumKg}</td>
              <td className="border border-slate-300 px-2 py-1" />
              <td className="border border-slate-300 px-2 py-1" />
              <td className="border border-slate-300 px-2 py-1">USD</td>
              <td className="border border-slate-300 px-2 py-1" />
              <td className="border border-slate-300 px-2 py-1 text-right">{totals.sumPrecio}</td>
              <td className="border border-slate-300 px-2 py-1 text-right">{totals.sumIva}</td>
              <td className="border border-slate-300 px-2 py-1 text-right">{totals.sumTot}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-[var(--text-muted)]">
        Clientes: {trips.map((t) => getClientName(clients, t.clientId)).join(', ')}
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCopyTsv}>
          Copiar tabla
        </Button>
        <Button type="button" variant="primary" size="sm" onClick={() => void onMarkSolicitados()}>
          Marcar seleccionados como Solicitados
        </Button>
      </div>
    </div>
  );
}
