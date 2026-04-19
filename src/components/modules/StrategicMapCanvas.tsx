import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import 'leaflet/dist/leaflet.css';
import type { Client, Trip } from '../../types';
import { MAP_CENTER, MAP_ZOOM } from '../../constants';
import { MapPin, Truck } from 'lucide-react';

const DefaultIcon = L.icon({
  iconUrl,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.mergeOptions({ icon: DefaultIcon });

function activeTripsTowardClient(clientId: string, trips: Trip[]): number {
  return trips.filter(
    (t) =>
      t.clientId === clientId &&
      (t.estado === 'Pendiente' || t.estado === 'En Tránsito')
  ).length;
}

function clientMarkerIcon(hasActive: boolean): L.DivIcon {
  const color = hasActive ? '#16a34a' : '#64748b';
  return L.divIcon({
    className: 'gdc-leaflet-div-icon',
    html: `<div style="width:18px;height:18px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function MapFlyTo({
  target,
  token,
}: {
  target: { lat: number; lng: number } | null;
  token: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (!target) {
      return;
    }
    map.flyTo([target.lat, target.lng], 9, { duration: 0.8 });
  }, [map, target, token]);
  return null;
}

export interface StrategicMapCanvasProps {
  clients: Client[];
  trips: Trip[];
  flyTarget: { lat: number; lng: number } | null;
  flyToken: number;
}

const StrategicMapCanvas: React.FC<StrategicMapCanvasProps> = ({
  clients,
  trips,
  flyTarget,
  flyToken,
}) => {
  return (
    <MapContainer
      center={MAP_CENTER}
      zoom={MAP_ZOOM}
      scrollWheelZoom
      className="z-0 h-full min-h-[320px] w-full rounded-xl"
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapFlyTo target={flyTarget} token={flyToken} />
      {clients.map((client) => {
        const activeCount = activeTripsTowardClient(client.id, trips);
        const hasActive = activeCount > 0;
        return (
          <Marker
            key={client.id}
            position={[client.latitud, client.longitud]}
            icon={clientMarkerIcon(hasActive)}
          >
            <Popup>
              <div className="min-w-[200px] text-slate-800">
                <h3 className="mb-1 text-base font-bold">{client.nombreComercial}</h3>
                <p className="flex items-center gap-1 text-sm text-slate-600">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {client.localidad}, {client.departamento}
                </p>
                <p className="mt-2 flex items-center gap-1 border-t border-slate-100 pt-2 text-sm font-medium text-slate-700">
                  <Truck className="h-3 w-3 text-emerald-600" />
                  Viajes activos hacia este cliente:{' '}
                  <span className="text-emerald-700">{activeCount}</span>
                </p>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
};

export default StrategicMapCanvas;
