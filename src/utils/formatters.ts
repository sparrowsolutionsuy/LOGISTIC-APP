export const formatCurrency = (v: number): string =>
  `USD ${v.toLocaleString('es-UY', { minimumFractionDigits: 0 })}`;

export const formatDate = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('es-UY');

export const formatTons = (kg: number): string => `${(kg / 1000).toFixed(1)} t`;

export const formatKm = (km: number): string => `${km.toLocaleString('es-UY')} km`;

export const formatPct = (n: number): string => `${n.toFixed(1)}%`;
