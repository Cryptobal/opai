import "server-only";
import { prisma } from "@/lib/prisma";
import { recomputePayrollAmounts } from "./generators/payroll-sync";
import { recomputeTurnosExtraAmounts } from "./generators/turnos-extra-sync";
import { recomputeIvaUpcoming } from "./generators/iva-f29-sync";
import { backfillRecurringDteItems } from "./generators/recurring-dte-sync";

/**
 * Self-heal: detecta si el tenant tiene drift entre datos fuente y items
 * materializados, y dispara backfill silencioso. Idempotente y barato si
 * ya está sincronizado (solo cuenta filas).
 *
 * Diseñado para llamarse desde page.tsx con `after()` de Next.js para no
 * bloquear el render. La primera carga de un tenant tras desplegar este
 * código pagará el costo del backfill (~2-5s); subsiguientes son ~50ms.
 *
 * Nunca lanza errores hacia el caller — el sync se hace best-effort.
 */
export async function ensureCashflowSynced(tenantId: string): Promise<{
  triggered: { contracts: boolean; payroll: boolean; recurringDte: boolean };
}> {
  const triggered = {
    contracts: false,
    payroll: false,
    recurringDte: false,
  };

  try {
    // ── Contratos ──
    // Auto-sync desde CpqQuote → FinanceCashflowItem deprecado (2026-05-11).
    // Los contratos se agregan manualmente desde el tab "Contratos" de la
    // cuenta CRM. Mantenemos la key `contracts` en el shape de retorno por
    // compatibilidad con callers, pero siempre es false.

    // ── Payroll: cada instalación con dotación debe tener 2 items
    //    (PAYROLL_LIQUIDO + PAYROLL_PREVIRED). El legacy `source=PAYROLL`
    //    quedó eliminado el 2026-05-11; no lo contamos ni lo recreamos.
    const [puestosRows, liquidoItems, previRedItems] = await Promise.all([
      prisma.opsPuestoOperativo.findMany({
        where: {
          tenantId,
          active: true,
          salaryStructureId: { not: null },
        },
        select: { installationId: true },
        distinct: ["installationId"],
      }),
      prisma.financeCashflowItem.count({
        where: { tenantId, source: "PAYROLL_LIQUIDO", isActive: true },
      }),
      prisma.financeCashflowItem.count({
        where: { tenantId, source: "PAYROLL_PREVIRED", isActive: true },
      }),
    ]);
    const installationsWithDotacion = puestosRows.filter(
      (p) => p.installationId !== null,
    ).length;
    // Si falta cualquiera de las dos variantes para alguna instalación,
    // disparamos el recompute (que crea/actualiza ambas).
    if (
      installationsWithDotacion > 0 &&
      (liquidoItems < installationsWithDotacion ||
        previRedItems < installationsWithDotacion)
    ) {
      triggered.payroll = true;
      await recomputePayrollAmounts(tenantId);
    }

    // ── DTE recurrentes: mirror 1:1 con templates activos ──
    const [activeTemplates, dteItems] = await Promise.all([
      prisma.financeDteRecurringTemplate.count({
        where: { tenantId, isActive: true },
      }),
      prisma.financeCashflowItem.count({
        where: { tenantId, source: "RECURRING_DTE", isActive: true },
      }),
    ]);
    if (activeTemplates > 0 && dteItems < activeTemplates) {
      triggered.recurringDte = true;
      await backfillRecurringDteItems(tenantId);
    }

    // Turnos extra y IVA siempre se recomputan en cron nightly.
    // No los disparamos desde el page-load para no agregar latencia
    // en el primer load (el cron los cubre).
    void recomputeTurnosExtraAmounts;
    void recomputeIvaUpcoming;
  } catch (err) {
    console.error("[cashflow] ensureCashflowSynced error:", err);
  }

  return { triggered };
}
