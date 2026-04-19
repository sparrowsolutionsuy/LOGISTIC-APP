import React, { useMemo, useState } from 'react';
import type { Trip, Client } from '../../types';
import { uploadInvoice } from '../../services/api';
import { Modal } from '../ui/Modal';
import {
  UploadCloud,
  CheckCircle,
  Loader2,
  ExternalLink,
  Calendar,
  AlertTriangle,
  FileText,
} from 'lucide-react';

interface BillingViewProps {
  trips: Trip[];
  clients: Client[];
  onInvoiceUploaded: (tripId: string, url: string) => void;
}

function getClientName(clients: Client[], id: string): string {
  return clients.find((c) => c.id === id)?.nombreComercial ?? 'Desconocido';
}

function tripTarifaTotal(t: Trip): number {
  return t.tarifa * (t.pesoKg / 1000);
}

/** Días transcurridos desde la fecha del viaje (referencia de “completado”). */
function daysSince(dateStr: string): number {
  const start = new Date(`${dateStr}T12:00:00`);
  const now = new Date();
  return Math.floor((now.getTime() - start.getTime()) / 86400000);
}

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = 'application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png';

export const BillingView: React.FC<BillingViewProps> = ({ trips, clients, onInvoiceUploaded }) => {
  const [tab, setTab] = useState<'pending' | 'invoiced'>('pending');
  const [invoicedMonth, setInvoicedMonth] = useState('');
  const [uploadTrip, setUploadTrip] = useState<Trip | null>(null);
  const [uploading, setUploading] = useState(false);
  const [filePreview, setFilePreview] = useState('');

  const pendingTrips = useMemo(
    () => trips.filter((t) => t.estado === 'Completado' && !t.facturaUrl),
    [trips]
  );

  const invoicedTrips = useMemo(
    () => trips.filter((t) => t.estado === 'Cerrado' && Boolean(t.facturaUrl)),
    [trips]
  );

  const invoicedFiltered = useMemo(
    () =>
      invoicedMonth
        ? invoicedTrips.filter((t) => t.fecha.startsWith(invoicedMonth))
        : invoicedTrips,
    [invoicedTrips, invoicedMonth]
  );

  const monthOptions = useMemo(() => {
    const s = new Set<string>();
    invoicedTrips.forEach((t) => s.add(t.fecha.slice(0, 7)));
    return Array.from(s).sort((a, b) => b.localeCompare(a));
  }, [invoicedTrips]);

  const runUpload = (trip: Trip, file: File) => {
    if (file.size > MAX_BYTES) {
      alert('El archivo supera 5 MB.');
      return;
    }
    const clientName = getClientName(clients, trip.clientId).replace(/\s+/g, '');
    const ext = file.name.includes('.') ? file.name.split('.').pop() : 'pdf';
    const fileName = `Factura_${trip.id}_${clientName}.${ext ?? 'pdf'}`;
    const mimeType = file.type || 'application/octet-stream';
    setFilePreview(file.name);
    setUploading(true);

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      try {
        const raw = reader.result;
        if (typeof raw !== 'string') {
          alert('No se pudo leer el archivo.');
          return;
        }
        const parts = raw.split(',');
        const fileData = parts.length > 1 ? parts[1] : '';
        if (!fileData) {
          alert('No se pudo obtener el contenido del archivo.');
          return;
        }
        const url = await uploadInvoice(trip.id, fileData, fileName, mimeType);
        if (url) {
          onInvoiceUploaded(trip.id, url);
          setUploadTrip(null);
          setFilePreview('');
        } else {
          alert('No se recibió URL de factura. Verificá la configuración.');
        }
      } catch (e) {
        console.error(e);
        alert('Error al subir la factura.');
      } finally {
        setUploading(false);
        setFilePreview('');
      }
    };
    reader.onerror = () => {
      setUploading(false);
      setFilePreview('');
      alert('Error al leer el archivo.');
    };
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Facturación y cierre</h2>
            <p className="text-sm text-slate-500">Pendientes de factura y viajes facturados.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTab('pending')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                tab === 'pending'
                  ? 'border border-amber-200 bg-amber-100 text-amber-800'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Pendientes de factura
            </button>
            <button
              type="button"
              onClick={() => setTab('invoiced')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                tab === 'invoiced'
                  ? 'border border-emerald-200 bg-emerald-100 text-emerald-800'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Facturados
            </button>
          </div>
        </div>

        {tab === 'invoiced' && (
          <div className="mb-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <Calendar className="h-4 w-4 text-slate-400" />
            <span className="text-sm text-slate-600">Filtrar por mes:</span>
            <select
              className="rounded-lg border border-slate-300 bg-slate-50 p-2 text-sm outline-none"
              value={invoicedMonth}
              onChange={(e) => setInvoicedMonth(e.target.value)}
            >
              <option value="">Todos los meses</option>
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-left text-sm text-slate-600">
          <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-700">
            <tr>
              <th className="p-4">Cliente</th>
              <th className="p-4">Ruta</th>
              <th className="p-4">Fecha</th>
              <th className="p-4 text-right">Tarifa (total)</th>
              {tab === 'pending' && <th className="p-4">Estado</th>}
              <th className="p-4 text-center">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(tab === 'pending' ? pendingTrips : invoicedFiltered).map((trip) => {
              const days = daysSince(trip.fecha);
              const overdue = tab === 'pending' && days > 7;
              return (
                <tr
                  key={trip.id}
                  className={overdue ? 'border-l-4 border-amber-500 bg-amber-50/60' : 'hover:bg-slate-50'}
                >
                  <td className="p-4">
                    <div className="font-medium text-slate-900">{getClientName(clients, trip.clientId)}</div>
                    <div className="font-mono text-[10px] text-slate-400">{trip.id}</div>
                  </td>
                  <td className="p-4 text-xs">
                    {trip.origen} → {trip.destino}
                  </td>
                  <td className="p-4 whitespace-nowrap">
                    {trip.fecha}
                    {tab === 'invoiced' && (
                      <span className="ml-2 block text-[10px] font-normal text-slate-400">
                        (fecha de cierre / registro)
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-right font-semibold text-slate-800">
                    ${tripTarifaTotal(trip).toLocaleString('es-UY', { maximumFractionDigits: 0 })}
                  </td>
                  {tab === 'pending' && (
                    <td className="p-4">
                      <div className="flex flex-col gap-1 text-xs">
                        <span>Hace {days} día{days === 1 ? '' : 's'}</span>
                        {overdue && (
                          <span className="inline-flex items-center gap-1 font-semibold text-amber-800">
                            <AlertTriangle className="h-3 w-3" />
                            Más de 7 días sin facturar
                          </span>
                        )}
                      </div>
                    </td>
                  )}
                  <td className="p-4 text-center">
                    {tab === 'pending' ? (
                      <button
                        type="button"
                        onClick={() => setUploadTrip(trip)}
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
                      >
                        <UploadCloud className="h-3 w-3" />
                        Subir factura
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => trip.facturaUrl && window.open(trip.facturaUrl, '_blank', 'noopener,noreferrer')}
                        className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Ver factura
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {(tab === 'pending' ? pendingTrips : invoicedFiltered).length === 0 && (
              <tr>
                <td colSpan={tab === 'pending' ? 6 : 5} className="p-12 text-center text-slate-400">
                  <CheckCircle className="mx-auto mb-2 h-10 w-10 text-slate-300" />
                  No hay registros en esta sección.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={!!uploadTrip}
        onClose={() => {
          if (!uploading) {
            setUploadTrip(null);
            setFilePreview('');
          }
        }}
        title="Subir factura"
        size="md"
      >
        {uploadTrip && (
          <div className="space-y-4 text-sm text-slate-600">
            <p>
              Viaje <span className="font-mono font-medium">{uploadTrip.id}</span> —{' '}
              {getClientName(clients, uploadTrip.clientId)}
            </p>
            <p className="rounded-lg bg-slate-50 p-2 text-xs">
              PDF, JPG o PNG. Máximo 5 MB. Al completar, el viaje pasará a <strong>Cerrado</strong>.
            </p>
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/80 p-6 hover:border-blue-400">
              <FileText className="mb-2 h-8 w-8 text-slate-400" />
              <span className="text-blue-700">Elegir archivo</span>
              <input
                type="file"
                accept={ACCEPT}
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f && uploadTrip) {
                    runUpload(uploadTrip, f);
                  }
                }}
              />
            </label>
            {uploading && (
              <div className="flex items-center justify-center gap-2 text-blue-700">
                <Loader2 className="h-4 w-4 animate-spin" />
                Subiendo{filePreview ? `: ${filePreview}` : '…'}
              </div>
            )}
            <div className="flex justify-end">
              <button
                type="button"
                disabled={uploading}
                className="rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                onClick={() => setUploadTrip(null)}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
