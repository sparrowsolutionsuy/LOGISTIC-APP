// === ENTIDADES ===
export type TripStatus = 'Pendiente' | 'En Tránsito' | 'Completado' | 'Cerrado';
export type UserRole = 'admin' | 'operativo';
export type CostCategory =
  | 'Combustible'
  | 'Mantenimiento'
  | 'Peajes'
  | 'Viáticos'
  | 'Neumáticos'
  | 'Seguros'
  | 'Otros';

export interface User {
  username: string;
  nombre: string;
  role: UserRole;
}

export interface Client {
  id: string;
  nombreComercial: string;
  departamento: string;
  localidad: string;
  latitud: number;
  longitud: number;
  rut?: string;
  email?: string;
  telefono?: string;
}

export interface Trip {
  id: string;
  fecha: string;
  clientId: string;
  estado: TripStatus;
  contenido: string;
  pesoKg: number;
  kmRecorridos: number;
  tarifa: number;
  origen: string;
  destino: string;
  facturaUrl?: string;
}

export interface Cost {
  id: string;
  fecha: string;
  tripId: string | null;
  categoria: CostCategory;
  descripcion: string;
  monto: number;
  comprobante?: string;
  registradoPor: string;
}

// === ANALYTICS ===
export interface TripWithMetrics extends Trip {
  clientName: string;
  totalCosts: number;
  netMargin: number;
  marginPct: number;
}

export interface MonthlyStats {
  month: string;
  label: string;
  revenue: number;
  costs: number;
  margin: number;
  marginPct: number;
  tripCount: number;
  tonsTransported: number;
}

export interface KPIData {
  totalRevenueMTD: number;
  totalCostsMTD: number;
  netMarginMTD: number;
  marginPctMTD: number;
  activeTrips: number;
  pendingTrips: number;
  avgRevenuePerTrip: number;
  topClient: { name: string; revenue: number } | null;
}

// === UI STATE ===
export type ActiveTab =
  | 'dashboard'
  | 'trips'
  | 'map'
  | 'costs'
  | 'financial'
  | 'clients'
  | 'newClient'
  | 'billing';

export interface AppState {
  user: User | null;
  trips: Trip[];
  clients: Client[];
  costs: Cost[];
  loading: boolean;
  offline: boolean;
}

/** Respuestas de Gemini / panel de IA */
export interface AIInsight {
  title: string;
  description: string;
  type: 'optimization' | 'alert' | 'info';
}
