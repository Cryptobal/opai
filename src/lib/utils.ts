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
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
  
  return `UF ${formatted}`;
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
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
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
