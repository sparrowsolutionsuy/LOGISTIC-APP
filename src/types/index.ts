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

export interface BillingInfo {
  razonSocial: string;
  rut: string;
  email: string;
  telefono?: string;
  direccion?: string;
  condicionIVA?: string;
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
  tieneFacturacionDiferente?: boolean;
  facturacion?: BillingInfo;
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
  /** Moneda en que se pactó la tarifa (por tonelada). */
  moneda?: 'USD' | 'UYU';
  /** TC USD→UYU vigente al momento del registro. */
  tipoCambio?: number;
  /** Total tarifa en UYU de referencia (opcional, persistido). */
  tarifaUYU?: number;
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

export interface Cost {
  id: string;
  fecha: string;
  tripId: string | null;
  categoria: CostCategory;
  descripcion: string;
  monto: number;
  moneda?: 'USD' | 'UYU';
  /** Moneda de registro (alias explícito de `moneda` para UI y Sheets `currency`). */
  currency?: 'USD' | 'UYU';
  tipoCambio?: number;
  /** Siempre en USD para analytics y agregados. */
  montoUSD?: number;
  /** true solo si el registro fue generado por ejecución de costo programado. */
  isScheduled?: boolean;
  /** Día del mes (1–28) de la definición que originó el costo (opcional, auditoría). */
  scheduledDay?: number;
  /** Meses YYYY-MM en los que ya se contabilizó ejecución (opcional; idempotencia principal por fila en Sheets). */
  scheduledMonths?: string[];
  /** ID de la definición en DB_CostosProgramados que originó este costo automático. */
  scheduleId?: string;
  /** @deprecated Usar scheduleId; se mantiene por compatibilidad con filas antiguas. */
  scheduledCostId?: string;
  comprobante?: string;
  registradoPor: string;
}

/** Definición persistida en DB_CostosProgramados (Google Sheets). */
export interface ScheduledCostDefinition {
  id: string;
  categoria: CostCategory;
  descripcion: string;
  monto: number;
  dayOfMonth: number;
  active: boolean;
  creadoPor: string;
  creadoEn: string;
  /** Moneda del monto recurrente (default USD en Sheets legacy). */
  currency?: 'USD' | 'UYU';
  /** Opcional: vincular el costo generado a un viaje. */
  tripId?: string | null;
}

export type DisplayCurrency = 'USD' | 'UYU';

export interface ExchangeRateContext {
  displayCurrency: DisplayCurrency;
  currentRate: number;
  lastUpdated: string | null;
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

export interface MonthlyReportData {
  month: string;
  monthLabel: string;
  totalRevenue: number;
  totalCosts: number;
  netMargin: number;
  marginPct: number;
  totalTrips: number;
  completedTrips: number;
  pendingTrips: number;
  cancelledTrips: number;
  totalKm: number;
  totalTons: number;
  avgRevenuePerTrip: number;
  avgCostPerTrip: number;
  avgMarginPerTrip: number;
  topClientByRevenue: { name: string; revenue: number; trips: number };
  topRoute: { route: string; revenue: number; count: number };
  topProduct: { name: string; revenue: number; tons: number };
  worstMarginTrip: { id: string; client: string; marginPct: number };
  bestMarginTrip: { id: string; client: string; marginPct: number };
  costsByCategory: { category: string; total: number; pct: number }[];
  vsLastMonth: {
    revenueDelta: number;
    costsDelta: number;
    marginDelta: number;
    tripsDelta: number;
    marginPctDeltaPp: number;
  };
  aiSummary: string;
  aiAlerts: string[];
  aiRecommendations: string[];
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
