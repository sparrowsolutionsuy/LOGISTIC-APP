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
  /** URL del remito escaneado en Google Drive (u origen mock). */
  remitoUrl?: string;
  /** Usuario operativo asignado (viajes visibles solo para ese usuario). */
  asignadoA?: string;
  /** Factura PDF creada en app externa. */
  facturaGenerada?: boolean;
  /** Mail enviado al cliente solicitando pago. */
  facturaSolicitada?: boolean;
  /** ISO date: cuándo se envió el mail de solicitud. */
  facturaFechaSolicitud?: string;
  /** Dinero recibido. */
  facturaCobrada?: boolean;
  /** ISO date: cuándo se cobró. */
  facturaFechaCobro?: string;
}

export type BillingStatus = 'pendiente' | 'generada' | 'solicitada' | 'cobrada';

export type RemitoConfidenceLevel = 'high' | 'medium' | 'low';

export interface RemitoScalarField<T> {
  value: T;
  confidence: RemitoConfidenceLevel;
}

/** Datos extraídos de un remito por IA (Gemini Vision). */
export interface RemitoExtracted {
  fecha: RemitoScalarField<string | null>;
  origen: RemitoScalarField<string | null>;
  destino: RemitoScalarField<string | null>;
  contenido: RemitoScalarField<string | null>;
  pesoKg: RemitoScalarField<number | null>;
  proveedor: RemitoScalarField<string | null>;
  numeroRemito: RemitoScalarField<string | null>;
  /** Texto completo reconocido (útil para depuración). */
  rawText: string;
}

export type RemitoExtractionResult =
  | { success: true; data: RemitoExtracted }
  | { success: false; error: string };

export interface Cost {
  id: string;
  fecha: string;
  tripId: string | null;
  categoria: CostCategory;
  descripcion: string;
  monto: number;
  /** Referencia al costo programado que lo originó (si aplica). */
  scheduledCostId?: string;
  comprobante?: string;
  registradoPor: string;
}

export type ScheduledCostFrequency = 'monthly';

export interface ScheduledCost {
  id: string;
  nombre: string;
  categoria: CostCategory;
  descripcion: string;
  monto: number;
  activo: boolean;
  frecuencia: ScheduledCostFrequency;
  diaDelMes: number;
  tripId: string | null;
  creadoEn: string;
  ultimaEjecucion: string | null;
}

// === ANALYTICS ===
export interface TripWithMetrics extends Trip {
  clientName: string;
  totalCosts: number;
  /** Ingreso contabilizado solo si el viaje está cobrado (mismo criterio que KPIs). */
  revenueRealized: number;
  netMargin: number;
  marginPct: number;
}

export interface MonthlyStats {
  month: string;
  label: string;
  /** Ingresos realizados (solo viajes con `facturaCobrada` en ese mes). */
  revenue: number;
  /** Ingreso bruto pendiente de cobro (Completado/Cerrado sin cobrar, fecha del viaje en el mes). */
  pendingRevenue: number;
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
  /** Suma de ingreso bruto (trip tarifa × ton) en viajes terminados aún no cobrados. */
  pendingRevenue: number;
  /** Igual a `totalRevenueMTD` (ingresos realizados en el mes MTD). */
  realizedRevenue: number;
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
  | 'billing'
  | 'report';

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
