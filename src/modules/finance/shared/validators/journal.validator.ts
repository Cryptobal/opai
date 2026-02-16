/**
 * Validates double-entry bookkeeping rules
 */

import type { JournalLineInput } from "../types/accounting.types";

export function validateDoubleEntry(lines: JournalLineInput[]): {
  valid: boolean;
  error?: string;
  totalDebit: number;
  totalCredit: number;
} {
  if (!lines || lines.length < 2) {
    return { valid: false, error: "Un asiento requiere al menos 2 lineas", totalDebit: 0, totalCredit: 0 };
  }

  let totalDebit = 0;
  let totalCredit = 0;

  for (const line of lines) {
    if (line.debit < 0 || line.credit < 0) {
      return { valid: false, error: "Los montos no pueden ser negativos", totalDebit: 0, totalCredit: 0 };
    }
    if (line.debit > 0 && line.credit > 0) {
      return { valid: false, error: "Una linea no puede tener debito y credito al mismo tiempo", totalDebit: 0, totalCredit: 0 };
    }
    if (line.debit === 0 && line.credit === 0) {
      return { valid: false, error: "Una linea debe tener debito o credito mayor a cero", totalDebit: 0, totalCredit: 0 };
    }
    totalDebit += line.debit;
    totalCredit += line.credit;
  }

  // Round to 2 decimals for comparison
  const roundedDebit = Math.round(totalDebit * 100) / 100;
  const roundedCredit = Math.round(totalCredit * 100) / 100;

  if (roundedDebit !== roundedCredit) {
    return {
      valid: false,
      error: `Debitos (${roundedDebit}) no igualan creditos (${roundedCredit})`,
      totalDebit: roundedDebit,
      totalCredit: roundedCredit,
    };
  }

  return { valid: true, totalDebit: roundedDebit, totalCredit: roundedCredit };
}
