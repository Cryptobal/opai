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
