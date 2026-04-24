import React, { Suspense, lazy, useEffect, useState } from 'react';
import type { BillingInfo, Client } from '../../types';
import { DEPARTAMENTOS } from '../../constants';
import { Save, User, MapPin, Hash, Mail, Phone, Info, Receipt } from 'lucide-react';

/** Iframe OSM montado en el siguiente tick para no competir con el hilo principal en el mismo frame. */
const OsmEmbedFrame = lazy(
  () =>
    new Promise<{ default: React.FC<{ src: string; onLoaded: () => void }> }>((resolve) => {
      window.setTimeout(() => {
        resolve({
          default: function OsmEmbedFrameInner({ src, onLoaded }) {
            return (
              <iframe
                title="Mapa ubicación cliente"
                className="absolute inset-0 h-full w-full border-0"
                src={src}
                loading="lazy"
                sandbox="allow-scripts allow-same-origin"
                referrerPolicy="no-referrer"
                onLoad={onLoaded}
                onError={() => {
                  /* silenciar error de red del iframe */
                }}
              />
            );
          },
        });
      }, 0);
    })
);

const MAP_LOAD_TIMEOUT_MS = 12000;

function LocationPreviewMap({ la, lo }: { la: number; lo: number }) {
  const pad = 0.06;
  const bbox = `${lo - pad},${la - pad},${lo + pad},${la + pad}`;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${la},${lo}`;
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    setMapReady(false);
    const t = window.setTimeout(() => setMapReady(true), MAP_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [src]);

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
      <p className="border-b border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600">
        Vista previa de ubicación
      </p>
      <div className="relative h-48 w-full">
        {!mapReady ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100">
            <p className="text-xs text-slate-400">Cargando mapa...</p>
          </div>
        ) : null}
        <Suspense
          fallback={
            <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
              <p className="text-xs text-slate-400">Cargando mapa...</p>
            </div>
          }
        >
          <OsmEmbedFrame src={src} onLoaded={() => setMapReady(true)} />
        </Suspense>
      </div>
    </div>
  );
}

interface ClientFormProps {
  onAddClient: (client: Client) => void | Promise<void>;
}

type FormState = Partial<
  Omit<Client, 'latitud' | 'longitud'> & { latitud: string | number; longitud: string | number }
>;

export const ClientForm: React.FC<ClientFormProps> = ({ onAddClient }) => {
  const [formData, setFormData] = useState<FormState>({
    departamento: 'Montevideo',
    rut: '',
    email: '',
    telefono: '',
  });
  const [tieneFacturacionDiferente, setTieneFacturacionDiferente] = useState(false);
  const [facturacion, setFacturacion] = useState<Partial<BillingInfo>>({});

  const handleRutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 12);
    setFormData({ ...formData, rut: val });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.nombreComercial && formData.latitud && formData.longitud && formData.rut) {
      if (formData.rut.length !== 12) {
        alert('El RUT uruguayo debe tener exactamente 12 dígitos (sin guiones).');
        return;
      }
      const lat = Number(formData.latitud);
      const lng = Number(formData.longitud);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        alert('Ingresá latitud y longitud numéricas válidas.');
        return;
      }

      const newClient: Client = {
        id: `C${Date.now()}`,
        nombreComercial: formData.nombreComercial,
        departamento: formData.departamento || 'Montevideo',
        localidad: formData.localidad || '',
        latitud: lat,
        longitud: lng,
        rut: formData.rut,
        email: formData.email || '',
        telefono: formData.telefono || '',
        tieneFacturacionDiferente,
        facturacion: tieneFacturacionDiferente
          ? {
              razonSocial: facturacion.razonSocial ?? '',
              rut: facturacion.rut ?? '',
              email: facturacion.email ?? '',
              telefono: facturacion.telefono,
              direccion: facturacion.direccion,
              condicionIVA: facturacion.condicionIVA,
            }
          : undefined,
      };
      await onAddClient(newClient);
      setFormData({
        departamento: 'Montevideo',
        nombreComercial: '',
        localidad: '',
        latitud: 0,
        longitud: 0,
        rut: '',
        email: '',
        telefono: '',
      });
      setTieneFacturacionDiferente(false);
      setFacturacion({});
      alert('Cliente registrado exitosamente');
    }
  };

  const la = Number(formData.latitud);
  const lo = Number(formData.longitud);
  const showMap =
    Number.isFinite(la) && Number.isFinite(lo) && !(la === 0 && lo === 0);

  return (
    <div className="max-w-3xl mx-auto bg-white p-8 rounded-xl shadow-md border border-slate-200">
      <div className="flex items-center mb-6">
        <User className="w-6 h-6 text-blue-900 mr-2" />
        <h2 className="text-2xl font-bold text-slate-800">Alta de Nuevo Cliente</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Nombre Comercial (Razón Social)
            </label>
            <input
              type="text"
              required
              className="w-full border-slate-300 rounded-lg p-2.5 bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none border transition-shadow"
              placeholder="Ej. AgroLogística Uruguay S.A."
              value={formData.nombreComercial || ''}
              onChange={(e) => setFormData({ ...formData, nombreComercial: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center">
            <Hash className="w-3 h-3 mr-1 text-slate-400" /> RUT (12 Dígitos)
          </label>
          <input
            type="text"
            required
            placeholder="219999990012"
            className="w-full md:w-1/2 border-slate-300 rounded-lg p-2.5 bg-slate-50 outline-none border font-mono"
            value={formData.rut || ''}
            onChange={handleRutChange}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center">
              <Mail className="w-3 h-3 mr-1 text-slate-400" /> Email
            </label>
            <input
              type="email"
              required
              placeholder="contacto@empresa.com"
              className="w-full border-slate-300 rounded-lg p-2.5 bg-slate-50 outline-none border"
              value={formData.email || ''}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center">
              <Phone className="w-3 h-3 mr-1 text-slate-400" /> Teléfono
            </label>
            <input
              type="tel"
              required
              placeholder="099 123 456"
              className="w-full border-slate-300 rounded-lg p-2.5 bg-slate-50 outline-none border"
              value={formData.telefono || ''}
              onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
            />
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center">
            <MapPin className="w-4 h-4 mr-1" /> Ubicación
          </h3>
          <div className="mb-4 flex gap-2 rounded-lg border border-blue-100 bg-blue-50/80 p-3 text-xs text-slate-700">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
            <p>
              Para obtener coordenadas, buscá la dirección en{' '}
              <strong>Google Maps</strong>, hacé clic derecho sobre el punto y copiá latitud y longitud.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Departamento</label>
              <select
                className="w-full border-slate-300 rounded-lg p-2.5 bg-slate-50 outline-none border"
                value={formData.departamento}
                onChange={(e) => setFormData({ ...formData, departamento: e.target.value })}
              >
                {DEPARTAMENTOS.map((dep) => (
                  <option key={dep} value={dep}>
                    {dep}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Localidad</label>
              <input
                type="text"
                required
                className="w-full border-slate-300 rounded-lg p-2.5 bg-slate-50 outline-none border"
                value={formData.localidad || ''}
                onChange={(e) => setFormData({ ...formData, localidad: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Latitud</label>
              <input
                type="number"
                step="any"
                required
                placeholder="-34.9011"
                className="w-full border-slate-300 rounded-lg p-2.5 bg-slate-50 outline-none border"
                value={formData.latitud || ''}
                onChange={(e) => setFormData({ ...formData, latitud: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Longitud</label>
              <input
                type="number"
                step="any"
                required
                placeholder="-56.1645"
                className="w-full border-slate-300 rounded-lg p-2.5 bg-slate-50 outline-none border"
                value={formData.longitud || ''}
                onChange={(e) => setFormData({ ...formData, longitud: e.target.value })}
              />
            </div>
          </div>
          {showMap ? <LocationPreviewMap la={la} lo={lo} /> : null}
        </div>

        <div className="border-t border-slate-100 pt-4">
          <label className="flex cursor-pointer items-center gap-3">
            <div className="relative">
              <input
                type="checkbox"
                className="sr-only"
                checked={tieneFacturacionDiferente}
                onChange={(e) => {
                  setTieneFacturacionDiferente(e.target.checked);
                  if (!e.target.checked) setFacturacion({});
                }}
              />
              <div
                className={`h-5 w-10 rounded-full transition-colors ${
                  tieneFacturacionDiferente ? 'bg-blue-900' : 'bg-slate-300'
                }`}
              />
              <div
                className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  tieneFacturacionDiferente ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700">
                La información de facturación es diferente al cliente
              </p>
              <p className="text-xs text-slate-500">
                Activar si las facturas se emiten a nombre de otra razón social
              </p>
            </div>
          </label>
        </div>
        {tieneFacturacionDiferente && (
          <div className="space-y-4 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Receipt className="h-4 w-4 text-blue-700" />
              Datos de facturación
            </h3>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Razón social *</label>
              <input
                type="text"
                required={tieneFacturacionDiferente}
                placeholder="Nombre legal de la empresa para facturas"
                className="w-full rounded-lg border border-slate-300 bg-white p-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                value={facturacion.razonSocial ?? ''}
                onChange={(e) => setFacturacion({ ...facturacion, razonSocial: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  RUT (12 dígitos) *
                </label>
                <input
                  type="text"
                  required={tieneFacturacionDiferente}
                  placeholder="219999990012"
                  className="w-full rounded-lg border border-slate-300 bg-white p-2.5 font-mono outline-none"
                  value={facturacion.rut ?? ''}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 12);
                    setFacturacion({ ...facturacion, rut: val });
                  }}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Email de facturación *
                </label>
                <input
                  type="email"
                  required={tieneFacturacionDiferente}
                  placeholder="facturacion@empresa.com"
                  className="w-full rounded-lg border border-slate-300 bg-white p-2.5 outline-none"
                  value={facturacion.email ?? ''}
                  onChange={(e) => setFacturacion({ ...facturacion, email: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Teléfono (opcional)
                </label>
                <input
                  type="tel"
                  placeholder="099 123 456"
                  className="w-full rounded-lg border border-slate-300 bg-white p-2.5 outline-none"
                  value={facturacion.telefono ?? ''}
                  onChange={(e) => setFacturacion({ ...facturacion, telefono: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Dirección fiscal (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Av. 18 de Julio 1234, Montevideo"
                  className="w-full rounded-lg border border-slate-300 bg-white p-2.5 outline-none"
                  value={facturacion.direccion ?? ''}
                  onChange={(e) => setFacturacion({ ...facturacion, direccion: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Condición IVA</label>
              <select
                className="w-full rounded-lg border border-slate-300 bg-white p-2.5 outline-none"
                value={facturacion.condicionIVA ?? ''}
                onChange={(e) => setFacturacion({ ...facturacion, condicionIVA: e.target.value })}
              >
                <option value="">Sin especificar</option>
                <option value="IVA incluido">IVA incluido (22%)</option>
                <option value="IVA exento">IVA exento</option>
                <option value="IVA mínimo">IVA mínimo (10%)</option>
              </select>
            </div>
          </div>
        )}

        <div className="pt-6">
          <button
            type="submit"
            className="w-full bg-blue-900 hover:bg-blue-800 text-white font-bold py-3 rounded-lg flex justify-center items-center transition-colors shadow-lg"
          >
            <Save className="w-5 h-5 mr-2" /> Guardar Cliente
          </button>
        </div>
      </form>
    </div>
  );
};
