/**
 * Credit Note Impact Helper — calcula el monto bruto remanente de un DTE
 * después de descontar las NCs parciales (CodRef=3) vivas sobre él.
 *
 * Por qué existe:
 * En Chile una NC con CodRef=3 ("corrige montos") reduce el monto cobrable
 * de la factura original sin emitir un documento nuevo. La factura sigue
 * vigente por el saldo neto. Tanto el flujo de caja como la cobranza
 * deben mostrar ese saldo, NO el total nominal original.
 *
 * Antes este cálculo estaba implícito: el endpoint `/api/finance/billing/credit-note`
 * actualizaba `amountPending` con el delta, pero el flujo y la cobranza
 * filtraban `creditedNetAmount: 0` (excluyendo cualquier factura con NC
 * parcial). Resultado: la factura desaparecía del forecast y el operador
 * tenía que crear un borrador manual por el saldo — workaround sin sentido
 * porque la NC parcial NO emite documento nuevo en SII.
 *
 * Reglas de signo:
 *   - `creditedNetAmount` es la SUMA NETA de NCs CodRef=3 sobre este DTE.
 *   - Para descontar del bruto (totalAmount), prorrateamos con el ratio
 *     gross/net del DTE original (preserva el IVA proporcional).
 *
 * Reglas de borde:
 *   - Si `voidedByCreditNoteId != null` → factura anulada total (CodRef=1).
 *     Esta función NO la maneja; los callers la filtran por separado en
 *     el WHERE de Prisma (semánticamente distinto).
 *   - Si `creditedGross >= totalAmount` → la NC parcial cubre todo el
 *     bruto. Devolvemos 0 y los callers deben skip (saldo cero = no
 *     proyectar).
 *   - Si `netAmount` es 0 o falsy → asumimos ratio 1 (sin IVA), aceptable
 *     para DTEs exentos (tipo 34) o boletas sin desglose.
 */

export interface DteAmountsForCreditNoteImpact {
  /** Monto bruto nominal del DTE (totalAmount). */
  totalAmount: number;
  /** Monto neto nominal del DTE (netAmount). Si 0 → ratio 1 (sin IVA). */
  netAmount: number;
  /** Suma neta de NCs CodRef=3 vivas (creditedNetAmount). */
  creditedNetAmount: number;
}

export interface CreditNoteImpact {
  /** Bruto remanente después de descontar la NC parcial proporcional. */
  grossPostNc: number;
  /** Bruto proporcional acreditado (informativo para badges/popovers). */
  creditedGross: number;
  /** true si toda la factura quedó cubierta por la NC parcial (skip flow). */
  isFullyCredited: boolean;
}

/**
 * Calcula el bruto remanente de un DTE después de NCs parciales.
 *
 * @example
 *   computeCreditNoteImpact({
 *     totalAmount: 9_346_473,
 *     netAmount: 7_854_178,
 *     creditedNetAmount: 993_625,  // NC #148 neto
 *   })
 *   // → { grossPostNc: 8_164_059, creditedGross: 1_182_414, isFullyCredited: false }
 */
export function computeCreditNoteImpact(
  dte: DteAmountsForCreditNoteImpact,
): CreditNoteImpact {
  const total = Number(dte.totalAmount) || 0;
  const net = Number(dte.netAmount) || 0;
  const creditedNet = Number(dte.creditedNetAmount) || 0;

  if (creditedNet <= 0) {
    return { grossPostNc: total, creditedGross: 0, isFullyCredited: false };
  }

  // Ratio gross/net del DTE original — preserva el IVA al prorratear.
  // Si net es 0 (DTE exento), ratio = 1 (no hay IVA que prorratear).
  const ratio = net > 0 ? total / net : 1;
  const creditedGross = Math.round(creditedNet * ratio);
  const grossPostNc = Math.max(0, total - creditedGross);

  return {
    grossPostNc,
    creditedGross,
    isFullyCredited: grossPostNc <= 0,
  };
}
