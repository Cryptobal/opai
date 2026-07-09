/** Helpers de formato de monto en pesos chilenos, compartidos por el quick-add
 *  y el editor de monto de celda (B4B). Se extrajeron de QuickAddInline para no
 *  duplicar la lógica de separadores de miles / parseo. */

/** Formatea un string numérico con separadores de miles (formato chileno).
 *  Ej. "1234567" → "1.234.567". */
export function formatThousands(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Convierte un string con separadores ("10.000") a número (10000). */
export function parseAmount(formatted: string): number {
  const digits = formatted.replace(/\D/g, "");
  return digits ? parseInt(digits, 10) : 0;
}
