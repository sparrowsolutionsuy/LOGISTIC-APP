// === ENTIDADES ===
export type TripStatus = 'Pendiente' | 'En Tránsito' | 'Completado' | 'Cerrado';
export type UserRole = 'admin' | 'operativo';
export type CostCategory =
  | 'Combustible'
  | 'Sueldos'
  | 'Alquiler'
  | 'Cuota Banco'
  | 'Service'
  | 'Mantenimiento'
  | 'AD Blue'
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
  tarifa: number; // tarifa en la moneda original del viaje
  tarifaUYU?: number; // tarifa en UYU (calculada al momento de crear)
  moneda?: 'USD' | 'UYU'; // moneda de la tarifa
  tipoCambio?: number; // tipo de cambio al momento del viaje
  origen: string;
  destino: string;
  facturaUrl?: string;
  remitoUrl?: string;
  asignadoA?: string;
  // Campos del pipeline de facturación/cobro
  facturaGenerada?: boolean;
  facturaSolicitada?: boolean;
  facturaFechaSolicitud?: string; // ISO date string o ''
  facturaCobrada?: boolean;
  facturaFechaCobro?: string; // ISO date string o ''
  scheduledCostId?: string;
}

export type BillingStatus = 'pendiente' | 'generada' | 'solicitada' | 'cobrada';

export interface Cost {
  id: string;
  fecha: string;
  tripId: string | null;
  categoria: CostCategory;
  descripcion: string;
  monto: number; // monto en la moneda original
  moneda?: 'USD' | 'UYU'; // moneda del costo
  /** Moneda de registro (alias explícito de `moneda` para UI y Sheets `currency`). */
  currency?: 'USD' | 'UYU';
  tipoCambio?: number; // tipo de cambio usado
  montoUSD?: number; // monto convertido a USD (precalculado)
  comprobante?: string;
  registradoPor: string;
  isScheduled?: boolean;
  /** Día del mes (1–28) de la definición que originó el costo (opcional, auditoría). */
  scheduledDay?: number;
  /** Meses YYYY-MM en los que ya se contabilizó ejecución (opcional; idempotencia principal por fila en Sheets). */
  scheduledMonths?: string[];
  scheduleId?: string;
  /** @deprecated Usar scheduleId; se mantiene por compatibilidad con filas antiguas. */
  scheduledCostId?: string;
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
/** Resultado de revenue de un viaje normalizado a USD */
export interface TripRevenueUSD {
  tripId: string;
  revenueUSD: number; // ingreso generado en USD
  cobrado: boolean; // true si facturaCobrada === true
  pendienteCobro: boolean; // true si facturaSolicitada pero no cobrada
}

export interface TripWithMetrics extends Trip {
  clientName: string;
  totalCosts: number;
  netMargin: number;
  marginPct: number;
}

/** Estadísticas mensuales actualizadas */
export interface MonthlyStats {
  month: string;
  label: string;
  totalGenerado: number;
  totalCobrado: number;
  totalPendienteCobro: number;
  costs: number;
  margin: number;
  marginPct: number;
  tripCount: number;
  tonsTransported: number;
  kmRecorridos: number;
  /** @deprecated Usar totalCobrado */
  revenue?: number;
  /** @deprecated Usar totalPendienteCobro */
  pendingRevenue?: number;
}

/** KPIs del dashboard con distinción cobrado/pendiente */
export interface KPIData {
  totalGenerado: number; // suma de TODOS los ingresos del periodo (USD)
  totalCobrado: number; // suma de ingresos efectivamente cobrados (USD)
  totalPendienteCobro: number; // suma de ingresos facturados pero no cobrados (USD)
  totalCostos: number; // suma de costos del periodo (USD)
  margenNeto: number; // totalGenerado - totalCostos
  margenPct: number; // (margenNeto / totalGenerado) * 100
  viajesRealizados: number; // cantidad de viajes Completado + Cerrado
  viajesActivos: number; // En Tránsito
  viajesPendientes: number; // Pendiente
  kmRecorridos: number; // suma de kmRecorridos del periodo
  toneladasTransportadas: number; // suma pesoKg/1000 del periodo
  topCliente: { name: string; revenue: number } | null;
  /** @deprecated Usar totalGenerado */
  totalRevenueMTD?: number;
  /** @deprecated Usar totalCostos */
  totalCostsMTD?: number;
  /** @deprecated Usar margenNeto */
  netMarginMTD?: number;
  /** @deprecated Usar margenPct */
  marginPctMTD?: number;
  /** @deprecated Usar viajesActivos */
  activeTrips?: number;
  /** @deprecated Usar viajesPendientes */
  pendingTrips?: number;
  avgRevenuePerTrip?: number;
  /** @deprecated Usar topCliente */
  topClient?: { name: string; revenue: number } | null;
  /** @deprecated Usar totalPendienteCobro */
  pendingRevenue?: number;
  /** @deprecated Usar totalCobrado */
  realizedRevenue?: number;
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
