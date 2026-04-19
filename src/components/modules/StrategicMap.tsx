import React, { useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { Icon } from 'leaflet';
import type { Client, Trip } from '../../types';
import { DEPARTAMENTOS, MAP_CENTER, MAP_ZOOM } from '../../constants';
import { Filter, MapPin, Truck, Mail, Phone } from 'lucide-react';

const customIcon = new Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

interface StrategicMapProps {
  clients: Client[];
  trips: Trip[];
}

export const StrategicMap: React.FC<StrategicMapProps> = ({ clients, trips }) => {
  const [selectedDept, setSelectedDept] = useState<string>('Todos');
  const [selectedClient, setSelectedClient] = useState<string>('Todos');

  const filteredClients = clients.filter((c) => {
    if (selectedDept !== 'Todos' && c.departamento !== selectedDept) {
      return false;
    }
    if (selectedClient !== 'Todos' && c.id !== selectedClient) {
      return false;
    }
    return true;
  });

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col space-y-4">
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-center gap-4">
        <div className="flex items-center text-slate-700 font-medium">
          <Filter className="text-slate-500 w-5 h-5 mr-2" />
          Filtros:
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-sm text-slate-500">Departamento:</span>
          <select
            className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2 outline-none"
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
          >
            <option value="Todos">Todos</option>
            {DEPARTAMENTOS.map((dep) => (
              <option key={dep} value={dep}>
                {dep}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-sm text-slate-500">Cliente:</span>
          <select
            className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2 outline-none max-w-[200px]"
            value={selectedClient}
            onChange={(e) => setSelectedClient(e.target.value)}
          >
            <option value="Todos">Todos</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.nombreComercial}
              </option>
            ))}
          </select>
        </div>

        <span className="text-sm text-slate-500 ml-auto">
          Mostrando {filteredClients.length} clientes
        </span>
      </div>

      <div className="flex-grow rounded-xl overflow-hidden shadow-lg border border-slate-300 relative z-0">
        <MapContainer
          center={MAP_CENTER}
          zoom={MAP_ZOOM}
          scrollWheelZoom
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {filteredClients.map((client) => (
            <Marker
              key={client.id}
              position={[client.latitud, client.longitud]}
              icon={customIcon}
            >
              <Popup>
                <div className="min-w-[200px]">
                  <h3 className="font-bold text-slate-800 text-lg mb-1">
                    {client.nombreComercial}
                  </h3>
                  <div className="space-y-1 text-sm text-slate-600">
                    <p className="flex items-center">
                      <MapPin className="w-3 h-3 mr-1" /> {client.localidad}, {client.departamento}
                    </p>
                    {client.email && (
                      <p className="flex items-center">
                        <Mail className="w-3 h-3 mr-1" /> {client.email}
                      </p>
                    )}
                    {client.telefono && (
                      <p className="flex items-center">
                        <Phone className="w-3 h-3 mr-1" /> {client.telefono}
                      </p>
                    )}
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-1">
                      Últimos Viajes
                    </p>
                    {trips
                      .filter((t) => t.clientId === client.id)
                      .slice(0, 2)
                      .map((trip) => (
                        <div key={trip.id} className="flex items-center text-xs mb-1">
                          <Truck className="w-3 h-3 mr-1 text-blue-500" />
                          <span>
                            {trip.fecha} - {trip.pesoKg / 1000}t {trip.contenido}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
};
