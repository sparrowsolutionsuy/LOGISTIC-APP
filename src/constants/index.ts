import type { ActiveTab, Client, Cost, Trip, TripStatus } from '../types';

// Uruguay departments (operational reference)
export const DEPARTAMENTOS = [
  'Artigas',
  'Canelones',
  'Cerro Largo',
  'Colonia',
  'Durazno',
  'Flores',
  'Florida',
  'Lavalleja',
  'Maldonado',
  'Montevideo',
  'Paysandú',
  'Río Negro',
  'Rivera',
  'Rocha',
  'Salto',
  'San José',
  'Soriano',
  'Tacuarembó',
  'Treinta y Tres',
] as const;

export const MAP_CENTER: [number, number] = [-32.522779, -55.765835];
export const MAP_ZOOM = 7;

export const BASE_GDC = {
  nombre: 'Paso de los Toros',
  lat: -32.811,
  lng: -56.52,
} as const;

export const ROUTE_NAMES: Record<ActiveTab, string> = {
  dashboard: 'Dashboard',
  trips: 'Gestión Viajes',
  map: 'Mapa Estratégico',
  costs: 'Costos',
  financial: 'Finanzas',
  clients: 'Directorio Clientes',
  newClient: 'Nuevo Cliente',
  billing: 'Facturación',
};

export const STATUS_COLORS: Record<
  TripStatus,
  { bg: string; text: string; border: string }
> = {
  Pendiente: {
    bg: 'bg-amber-500/15',
    text: 'text-amber-300',
    border: 'border-amber-500/30',
  },
  'En Tránsito': {
    bg: 'bg-blue-500/15',
    text: 'text-blue-300',
    border: 'border-blue-500/30',
  },
  Completado: {
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-300',
    border: 'border-emerald-500/30',
  },
  Cerrado: {
    bg: 'bg-slate-500/20',
    text: 'text-slate-200',
    border: 'border-slate-500/35',
  },
};

const C_MVD: Client = {
  id: 'C-MVD',
  nombreComercial: 'Terminal Agrícola Montevideo S.A.',
  departamento: 'Montevideo',
  localidad: 'Montevideo',
  latitud: -34.9011,
  longitud: -56.1645,
  rut: '210123450011',
  email: 'ops@tamvd.com.uy',
  telefono: '092 000 111',
};

const C_SAL: Client = {
  id: 'C-SAL',
  nombreComercial: 'Silos del Norte — Salto',
  departamento: 'Salto',
  localidad: 'Salto',
  latitud: -31.3833,
  longitud: -57.9667,
  rut: '211234560018',
  email: 'carga@silosdelnorte.uy',
  telefono: '0473 22 334',
};

const C_RIV: Client = {
  id: 'C-RIV',
  nombreComercial: 'Frigorífico Rivera Logistics',
  departamento: 'Rivera',
  localidad: 'Rivera',
  latitud: -30.9021,
  longitud: -55.5509,
  rut: '212345670014',
  email: 'logistica@frigorivera.uy',
  telefono: '098 445 990',
};

const C_PDE: Client = {
  id: 'C-PDE',
  nombreComercial: 'Puerto Logístico Punta del Este',
  departamento: 'Maldonado',
  localidad: 'Punta del Este',
  latitud: -34.96,
  longitud: -54.95,
  rut: '213456780012',
  email: 'coordinacion@pdeport.uy',
  telefono: '094 771 200',
};

const MOCK_CLIENTS: Client[] = [C_MVD, C_SAL, C_RIV, C_PDE];

const MOCK_TRIPS: Trip[] = [
  {
    id: 'V2026-001',
    fecha: '2026-01-08',
    clientId: 'C-MVD',
    estado: 'Cerrado',
    contenido: 'Soja',
    pesoKg: 28500,
    kmRecorridos: 312,
    tarifa: 44,
    origen: 'Mercedes',
    destino: 'Montevideo',
    facturaUrl: 'https://drive.google.com/file/d/example-mvd-001/view',
  },
  {
    id: 'V2026-002',
    fecha: '2026-01-14',
    clientId: 'C-SAL',
    estado: 'Completado',
    contenido: 'Trigo',
    pesoKg: 30000,
    kmRecorridos: 410,
    tarifa: 46,
    origen: 'Salto',
    destino: 'Nueva Palmira',
  },
  {
    id: 'V2026-003',
    fecha: '2026-02-02',
    clientId: 'C-RIV',
    estado: 'En Tránsito',
    contenido: 'Maíz',
    pesoKg: 29200,
    kmRecorridos: 180,
    tarifa: 30,
    origen: 'Rivera',
    destino: 'Montevideo',
  },
  {
    id: 'V2026-004',
    fecha: '2026-02-11',
    clientId: 'C-PDE',
    estado: 'Pendiente',
    contenido: 'Arroz',
    pesoKg: 26000,
    kmRecorridos: 0,
    tarifa: 38,
    origen: 'Treinta y Tres',
    destino: 'Punta del Este',
  },
  {
    id: 'V2026-005',
    fecha: '2026-02-18',
    clientId: 'C-MVD',
    estado: 'Completado',
    contenido: 'Cebada',
    pesoKg: 27500,
    kmRecorridos: 220,
    tarifa: 36,
    origen: 'Durazno',
    destino: 'Montevideo',
  },
  {
    id: 'V2026-006',
    fecha: '2026-03-05',
    clientId: 'C-SAL',
    estado: 'Cerrado',
    contenido: 'Soja',
    pesoKg: 28800,
    kmRecorridos: 395,
    tarifa: 43,
    origen: 'Paysandú',
    destino: 'Salto',
  },
  {
    id: 'V2026-007',
    fecha: '2026-03-12',
    clientId: 'C-RIV',
    estado: 'Pendiente',
    contenido: 'Fertilizante',
    pesoKg: 24000,
    kmRecorridos: 0,
    tarifa: 52,
    origen: 'Montevideo',
    destino: 'Rivera',
  },
  {
    id: 'V2026-008',
    fecha: '2026-03-20',
    clientId: 'C-PDE',
    estado: 'En Tránsito',
    contenido: 'Madera aserrada',
    pesoKg: 22000,
    kmRecorridos: 95,
    tarifa: 41,
    origen: 'Maldonado',
    destino: 'Punta del Este',
  },
];

const MOCK_COSTS: Cost[] = [
  {
    id: 'K001',
    fecha: '2026-01-08',
    tripId: 'V2026-001',
    categoria: 'Combustible',
    descripcion: 'Diesel ruta Mercedes–Montevideo',
    monto: 1850,
    registradoPor: 'admin',
  },
  {
    id: 'K002',
    fecha: '2026-01-14',
    tripId: 'V2026-002',
    categoria: 'Peajes',
    descripcion: 'Peajes RN y accesos puerto',
    monto: 420,
    registradoPor: 'admin',
  },
  {
    id: 'K003',
    fecha: '2026-02-03',
    tripId: 'V2026-003',
    categoria: 'Viáticos',
    descripcion: 'Pernocte conductor Rivera',
    monto: 2100,
    registradoPor: 'operativo',
  },
  {
    id: 'K004',
    fecha: '2026-02-12',
    tripId: 'V2026-004',
    categoria: 'Mantenimiento',
    descripcion: 'Control pre-viaje y lubricación',
    monto: 780,
    registradoPor: 'admin',
  },
  {
    id: 'K005',
    fecha: '2026-02-19',
    tripId: 'V2026-005',
    categoria: 'Neumáticos',
    descripcion: 'Desgaste proporcional neumáticos',
    monto: 950,
    registradoPor: 'admin',
  },
  {
    id: 'K006',
    fecha: '2026-03-06',
    tripId: 'V2026-006',
    categoria: 'Seguros',
    descripcion: 'Prima flota proporcional viaje',
    monto: 310,
    registradoPor: 'admin',
  },
];

/** Dataset local usado como fallback y seeds */
export const MOCK_DATA = {
  clients: MOCK_CLIENTS,
  trips: MOCK_TRIPS,
  costs: MOCK_COSTS,
} as const;
