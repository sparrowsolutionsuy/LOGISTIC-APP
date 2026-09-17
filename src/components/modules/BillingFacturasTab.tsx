import React, { useMemo, useState } from 'react';
import type { BillingStatus, Client, Trip } from '../../types';
import { useSortableTable } from '../../hooks/useSortableTable';
import Badge from '../ui/Badge';
import { Card } from '../ui/Card';
import SortableHeader from '../ui/SortableHeader';
import {
  formatDateUY,
  getBillingStatus,
  getBillingStatusLabel,
  tripGrandTotalNativo,
} from '../../utils/billing';
import { filterFacturasCatalog, tripInFacturasCatalog } from '../../utils/billingFacturas';
import { ExternalLink } from 'lucide-react';

export interface BillingFacturasTabProps {
  trips: Trip[];
  clients: Client[];
}

type FacturasSortKey =
  | 'fecha'
  | 'id'
  | 'clientName'
  | 'statusLabel'
  | 'fechaSolicitud'
  | 'fechaCobro'
  | 'montoSort';

interface FacturasRow {
  trip: Trip;
  fecha: string;
  id: string;
  clientName: string;
  status: BillingStatus;
  statusLabel: string;
  fechaSolicitud: string;
  fechaCobro: string;
  montoSort: number;
  montoLabel: string;
}

function clientName(clients: Client[], id: string): string {
  return clients.find((c) => c.id === id)?.nombreComercial ?? 'Desconocido';
}

function formatMoneyNativo(trip: Trip): { label: string; sort: number } {
  const { monto, moneda } = tripGrandTotalNativo(trip);
  return {
    sort: monto,
    label: `${moneda} ${monto.toLocaleString('es-UY', { maximumFractionDigits: 2 })}`,
  };
}

export const BillingFacturasTab: React.FC<BillingFacturasTabProps> = ({ trips, clients }) => {
  const [clientId, setClientId] = useState('');
  const [status, setStatus] = useState<'todos' | BillingStatus>('todos');
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState('');

  const catalogBase = useMemo(() => trips.filter(tripInFacturasCatalog), [trips]);

  const monthOptions = useMemo(() => {
    const s = new Set<string>();
    for (const t of catalogBase) {
      if (t.fecha.length >= 7) {
        s.add(t.fecha.slice(0, 7));
      }
    }
    return Array.from(s).sort((a, b) => b.localeCompare(a));
  }, [catalogBase]);

  const filtered = useMemo(
    () =>
      filterFacturasCatalog(trips, {
        clientId,
        status,
        search,
        month,
        clientNameOf: (id) => clientName(clients, id),
      }),
    [trips, clientId, status, search, month, clients]
  );

  const rows: FacturasRow[] = useMemo(() => {
    return filtered.map((t) => {
      const st = getBillingStatus(t);
      const money = formatMoneyNativo(t);
      return {
        trip: t,
        fecha: t.fecha,
        id: t.id,
        clientName: clientName(clients, t.clientId),
        status: st,
        statusLabel: getBillingStatusLabel(st),
        fechaSolicitud: t.facturaFechaSolicitud ?? '',
        fechaCobro: t.facturaFechaCobro ?? '',
        montoSort: money.sort,
        montoLabel: money.label,
      };
    });
  }, [filtered, clients]);

  const { sorted, sort, handleSort } = useSortableTable<FacturasRow, FacturasSortKey>(rows, {
    column: 'fecha',
    direction: 'desc',
  });

  return (
    <section className="space-y-4">
      <Card title="Filtros" padding="md">
        <div className="flex flex-col gap-3 md:flex-row md:flex-wrap">
          <label className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
            Cliente
            <select
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-sm text-[var(--text-primary)]"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
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
            Estado facturación
            <select
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-sm text-[var(--text-primary)]"
              value={status}
              onChange={(e) => setStatus(e.target.value as 'todos' | BillingStatus)}
            >
              <option value="todos">Todos</option>
              {(['pendiente', 'generada', 'solicitada', 'cobrada'] as const).map((s) => (
                <option key={s} value={s}>
                  {getBillingStatusLabel(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
            Mes del viaje
            <select
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-sm text-[var(--text-primary)]"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            >
              <option value="">Todos</option>
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs text-[var(--text-secondary)]">
            Buscar
            <input
              type="search"
              placeholder="ID o cliente…"
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-sm text-[var(--text-primary)]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
      </Card>

      <div className="overflow-hidden rounded-xl border border-[var(--border)] shadow-[var(--shadow-sm)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                <SortableHeader
                  label="Viaje"
                  column="id"
                  currentColumn={sort.column}
                  direction={sort.direction}
                  onClick={(c) => handleSort(c as FacturasSortKey)}
                />
                <SortableHeader
                  label="Fecha"
                  column="fecha"
                  currentColumn={sort.column}
                  direction={sort.direction}
                  onClick={(c) => handleSort(c as FacturasSortKey)}
                />
                <SortableHeader
                  label="Cliente"
                  column="clientName"
                  currentColumn={sort.column}
                  direction={sort.direction}
                  onClick={(c) => handleSort(c as FacturasSortKey)}
                />
                <SortableHeader
                  label="Estado"
                  column="statusLabel"
                  currentColumn={sort.column}
                  direction={sort.direction}
                  onClick={(c) => handleSort(c as FacturasSortKey)}
                />
                <SortableHeader
                  label="Fecha solicitud"
                  column="fechaSolicitud"
                  currentColumn={sort.column}
                  direction={sort.direction}
                  onClick={(c) => handleSort(c as FacturasSortKey)}
                />
                <SortableHeader
                  label="Fecha cobro"
                  column="fechaCobro"
                  currentColumn={sort.column}
                  direction={sort.direction}
                  onClick={(c) => handleSort(c as FacturasSortKey)}
                />
                <SortableHeader
                  label="Monto"
                  column="montoSort"
                  currentColumn={sort.column}
                  direction={sort.direction}
                  onClick={(c) => handleSort(c as FacturasSortKey)}
                  align="right"
                />
                <th
                  scope="col"
                  className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
                >
                  Factura
                </th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
              {sorted.map((row, i) => {
                const url = row.trip.facturaUrl?.trim();
                return (
                  <tr
                    key={row.id}
                    style={{
                      backgroundColor: i % 2 === 0 ? 'var(--bg-table-row)' : 'var(--bg-table-alt)',
                    }}
                    className="hover:bg-[var(--bg-table-hover)]"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-[var(--text-primary)]">{row.id}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-[var(--text-primary)]">
                      {formatDateUY(row.fecha)}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-primary)]">{row.clientName}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge billingStatus={row.status} size="sm" />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[var(--text-secondary)]">
                      {row.fechaSolicitud ? formatDateUY(row.fechaSolicitud) : '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[var(--text-secondary)]">
                      {row.fechaCobro ? formatDateUY(row.fechaCobro) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--text-primary)]">
                      {row.montoLabel}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent-blue)] hover:underline"
                        >
                          <ExternalLink size={12} aria-hidden />
                          Abrir
                        </a>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">Sin archivo</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-[var(--text-muted)]">
                    No hay facturas que coincidan con los filtros actuales.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};

export default BillingFacturasTab;
