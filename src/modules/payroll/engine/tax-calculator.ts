/**
 * TAX CALCULATOR
 * Calcula impuesto único de segunda categoría según tabla SII
 */

import type { PayrollParameters } from "./types";

/**
 * Calcular impuesto único usando tabla oficial SII (en CLP)
 */
export function calculateTax(
  taxable_base_clp: number,
  tax_brackets: PayrollParameters["tax_brackets"]
): number {
  // Buscar el tramo correspondiente
  const bracket = tax_brackets.find((b) => {
    if (b.to_clp === null) {
      return taxable_base_clp >= b.from_clp;
    }
    return taxable_base_clp >= b.from_clp && taxable_base_clp <= b.to_clp;
  });

  if (!bracket) {
    // Si no se encuentra tramo, asumir exento
    return 0;
  }

  // Aplicar fórmula: (base × factor) - rebaja
  const tax = taxable_base_clp * bracket.factor - bracket.rebate_clp;

  // El impuesto no puede ser negativo
  return Math.max(0, tax);
}

/**
 * Encontrar índice de tramo aplicado
 */
export function findTaxBracketIndex(
  taxable_base_clp: number,
  tax_brackets: PayrollParameters["tax_brackets"]
): number {
  const index = tax_brackets.findIndex((b) => {
    if (b.to_clp === null) {
      return taxable_base_clp >= b.from_clp;
    }
    return taxable_base_clp >= b.from_clp && taxable_base_clp <= b.to_clp;
  });

  return index >= 0 ? index : 0;
}
