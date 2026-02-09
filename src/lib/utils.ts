import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combina clases de Tailwind evitando conflictos
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formatea números como moneda chilena (CLP)
 * Ejemplo: 1234567 → "$1.234.567"
 */
export function formatCLP(value: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Formatea números en UF (Unidad de Fomento)
 * Ejemplos:
 *   60 → "UF 60"
 *   1234.56 → "UF 1.234,56"
 * 
 * Formato: punto separador de miles, coma para decimales, espacio antes de "UF"
 */
export function formatUF(value: number): string {
  const formatted = new Intl.NumberFormat('es-CL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  
  return `UF ${formatted}`;
}

/**
 * Formatea números con separadores locales (es-CL).
 * Por defecto usa 0 decimales.
 */
export function formatNumber(
  value: number,
  options: { minDecimals?: number; maxDecimals?: number } = {}
): string {
  const { minDecimals = 0, maxDecimals = minDecimals } = options;
  return new Intl.NumberFormat('es-CL', {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
  }).format(value);
}

/**
 * Parsea números locales (miles con . y decimales con ,).
 */
export function parseLocalizedNumber(value: string): number {
  if (!value) return 0;
  const cleaned = value
    .trim()
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Formatea moneda automáticamente según el tipo
 * @param value - Valor numérico
 * @param currency - 'CLF' para UF, 'CLP' para pesos, 'UF' para UF, 'USD' para dólares
 */
export function formatCurrency(value: number, currency: string = 'CLP'): string {
  // Normalizar currency (CLF = UF)
  const normalizedCurrency = currency.toUpperCase();
  
  if (normalizedCurrency === 'CLF' || normalizedCurrency === 'UF') {
    return formatUF(value);
  } else if (normalizedCurrency === 'CLP') {
    return formatCLP(value);
  } else if (normalizedCurrency === 'USD') {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  } else {
    // Fallback a CLP
    return formatCLP(value);
  }
}

/**
 * Formatea fechas en español chileno
 */
export function formatDate(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleDateString('es-CL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Formatea fechas en formato corto
 */
export function formatDateShort(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleDateString('es-CL', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Escapa caracteres especiales para RegExp
 */
export function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Convierte fecha a formato relativo en español
 * @example timeAgo(new Date('2026-02-06')) → "hace 3 días"
 */
export function timeAgo(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - dateObj.getTime()) / 1000);
  
  if (diffInSeconds < 60) return 'hace unos segundos';
  if (diffInSeconds < 3600) {
    const mins = Math.floor(diffInSeconds / 60);
    return `hace ${mins} ${mins === 1 ? 'minuto' : 'minutos'}`;
  }
  if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `hace ${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  }
  if (diffInSeconds < 2592000) {
    const days = Math.floor(diffInSeconds / 86400);
    return `hace ${days} ${days === 1 ? 'día' : 'días'}`;
  }
  if (diffInSeconds < 31536000) {
    const months = Math.floor(diffInSeconds / 2592000);
    return `hace ${months} ${months === 1 ? 'mes' : 'meses'}`;
  }
  const years = Math.floor(diffInSeconds / 31536000);
  return `hace ${years} ${years === 1 ? 'año' : 'años'}`;
}
