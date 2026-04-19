import React, { useState } from 'react';
import type { Client } from '../../types';
import { DEPARTAMENTOS } from '../../constants';
import { Save, User, MapPin, Hash, Mail, Phone } from 'lucide-react';

interface ClientFormProps {
  onAddClient: (client: Client) => void;
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

  const handleRutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 12);
    setFormData({ ...formData, rut: val });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.nombreComercial && formData.latitud && formData.longitud && formData.rut) {
      if (formData.rut.length !== 12) {
        alert('El RUT debe tener 12 dígitos.');
        return;
      }

      const newClient: Client = {
        id: `C${Date.now()}`,
        nombreComercial: formData.nombreComercial,
        departamento: formData.departamento || 'Montevideo',
        localidad: formData.localidad || '',
        latitud: Number(formData.latitud),
        longitud: Number(formData.longitud),
        rut: formData.rut,
        email: formData.email || '',
        telefono: formData.telefono || '',
      };
      onAddClient(newClient);
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
      alert('Cliente registrado exitosamente');
    }
  };

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
        </div>

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
