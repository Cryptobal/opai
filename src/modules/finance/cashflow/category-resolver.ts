import type { FinanceCashflowCategory, FinanceLinkTarget } from "@prisma/client";

export interface LinkContext {
  targetType: FinanceLinkTarget;
  /** accountPlanId atado al Link directamente (cuando es EXPENSE/INCOME). */
  accountPlanId: string | null;
  /** Si es DTE_ISSUED/DTE_RECEIVED, los account ids de las líneas del DTE. */
  dteAccountIds: string[];
  /** Mapa precomputado accountPlanId → categoría. Construir con
   *  bulkResolveCategoriesFromAccounts antes de invocar. */
  accountToCategory: Map<string, FinanceCashflowCategory>;
  /** Atajo: id de la categoría EGR_SUELDO (resolver una vez por request). */
  payrollSueldoCategoryId?: string | null;
  /** Atajo: id de la categoría EGR_TURNO_EXTRA. */
  payrollTurnoExtraCategoryId?: string | null;
  /** Atajo: id de la categoría EGR_QUINCENA. */
  payrollAnticipoCategoryId?: string | null;
}

/**
 * Dado un FinanceBankTransactionLink, resuelve a qué categoría de flujo
 * de caja pertenece. Función pura — el caller precomputa los mapas y
 * shortcuts de payroll y los pasa por contexto.
 *
 * Orden de precedencia:
 *   1. PAYROLL_LIQUIDACION → EGR_SUELDO (convención)
 *      PAYROLL_ANTICIPO    → EGR_QUINCENA
 *      TE_LOTE / TE_ITEM / TE_TURNO → EGR_TURNO_EXTRA
 *      Estos atajos se aplican aunque también haya accountPlanId — el ítem
 *      proyectado de sueldos siempre vive en la categoría EGR_SUELDO, no en
 *      la cuenta contable específica que use cada tenant.
 *   2. accountPlanId del link (EXPENSE/INCOME directo) → mapping
 *   3. accounts de líneas del DTE (DTE_ISSUED/DTE_RECEIVED) → primera que matchee
 *
 * Devuelve null si no se puede resolver.
 *
 * Nota: los casts `{ id: ... } as FinanceCashflowCategory` son intencionales —
 * el caller (matcher) solo usa `.id` del retorno en los casos de payroll convention.
 */
export function resolveCategoryForLink(ctx: LinkContext): FinanceCashflowCategory | null {
  switch (ctx.targetType) {
    case "PAYROLL_LIQUIDACION":
      if (ctx.payrollSueldoCategoryId) {
        return { id: ctx.payrollSueldoCategoryId } as FinanceCashflowCategory;
      }
      break;
    case "PAYROLL_ANTICIPO":
      if (ctx.payrollAnticipoCategoryId) {
        return { id: ctx.payrollAnticipoCategoryId } as FinanceCashflowCategory;
      }
      break;
    case "TE_LOTE":
    case "TE_ITEM":
    case "TE_TURNO":
      if (ctx.payrollTurnoExtraCategoryId) {
        return { id: ctx.payrollTurnoExtraCategoryId } as FinanceCashflowCategory;
      }
      break;
  }

  if (ctx.accountPlanId) {
    const cat = ctx.accountToCategory.get(ctx.accountPlanId);
    if (cat) return cat;
  }

  for (const accId of ctx.dteAccountIds) {
    const cat = ctx.accountToCategory.get(accId);
    if (cat) return cat;
  }

  return null;
}
