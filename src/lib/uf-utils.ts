/**
 * Utilidades puras de conversión UF/CLP.
 * No importar código server-side aquí.
 */

export function clpToUf(clp: number, ufValue: number): number {
  if (!ufValue || ufValue <= 0) return 0;
  return clp / ufValue;
}

export function ufToClp(uf: number, ufValue: number): number {
  return uf * ufValue;
}

/**
 * Normaliza un monto UF contractual a 2 decimales (half-up).
 * Estados de pago y facturación siempre trabajan con esta precisión.
 */
export function roundUfTo2(uf: number): number {
  if (!Number.isFinite(uf)) return 0;
  return Math.round(uf * 100) / 100;
}

/**
 * Convierte UF → neto CLP entero: primero 2 decimales de UF, después
 * `Math.round` al peso. El redondeo vive en el CLP, no en el T/C.
 */
export function ufToClpNet(uf: number, ufValue: number): number {
  return Math.round(roundUfTo2(uf) * (ufValue || 0));
}
