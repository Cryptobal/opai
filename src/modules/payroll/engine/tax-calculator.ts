/**
 * TAX CALCULATOR
 * Calcula impuesto único de segunda categoría según tabla SII
 * 
 * Fórmula: Impuesto = (base_tributable × factor) - rebaja
 * Los tramos están en CLP (tabla mensual SII)
 */

import type { PayrollParameters } from "./types";

/**
 * Calcular impuesto único usando tabla oficial SII (en CLP)
 * 
 * @param taxable_base_clp - Base tributable después de previsión y APV
 * @param tax_brackets - Tabla de tramos SII
 * @returns Monto impuesto en CLP (siempre >= 0)
 */
export function calculateTax(
  taxable_base_clp: number,
  tax_brackets: PayrollParameters["tax_brackets"]
): number {
  // Base negativa o cero = exento
  if (taxable_base_clp <= 0) {
    return 0;
  }

  // Asegurar que los tramos están ordenados de menor a mayor
  const sortedBrackets = [...tax_brackets].sort(
    (a, b) => a.from_clp - b.from_clp
  );

  // Buscar el tramo correspondiente (de mayor a menor para encontrar el correcto)
  let bracket = sortedBrackets[0]; // Default: primer tramo (exento)
  for (const b of sortedBrackets) {
    if (b.to_clp === null) {
      // Último tramo: aplica si la base es >= from_clp
      if (taxable_base_clp >= b.from_clp) {
        bracket = b;
      }
    } else if (taxable_base_clp >= b.from_clp && taxable_base_clp <= b.to_clp) {
      bracket = b;
    }
  }

  // Aplicar fórmula SII: (base × factor) - rebaja
  const tax = taxable_base_clp * bracket.factor - bracket.rebate_clp;

  // El impuesto no puede ser negativo
  return Math.max(0, Math.round(tax));
}

/**
 * Encontrar índice de tramo aplicado
 */
export function findTaxBracketIndex(
  taxable_base_clp: number,
  tax_brackets: PayrollParameters["tax_brackets"]
): number {
  if (taxable_base_clp <= 0) {
    return 0;
  }

  // Buscar el tramo correspondiente
  for (let i = tax_brackets.length - 1; i >= 0; i--) {
    const b = tax_brackets[i];
    if (b.to_clp === null) {
      if (taxable_base_clp >= b.from_clp) return i;
    } else if (taxable_base_clp >= b.from_clp && taxable_base_clp <= b.to_clp) {
      return i;
    }
  }

  return 0; // Default: tramo exento
}
