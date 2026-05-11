import "server-only";
import { prisma } from "@/lib/prisma";
import { backfillContractItems } from "./generators/sales-contract-sync";
import { recomputePayrollAmounts } from "./generators/payroll-sync";
import { recomputeTurnosExtraAmounts } from "./generators/turnos-extra-sync";
import { recomputeIvaUpcoming } from "./generators/iva-f29-sync";
import { backfillRecurringDteItems } from "./generators/recurring-dte-sync";

const ACTIVE_QUOTE_STATUSES = ["accepted", "active", "in_progress", "approved"];

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
    // Drift: hay quotes activas pero faltan items (e.g. cotización aceptada
    // recientemente que aún no se materializó). El backfill las crea.
    //
    // OJO: anteriormente también disparábamos backfill cuando había items
    // con currency=UF (lógica del bug histórico CLP×UF). Ya no aplica:
    // currency=UF es válido para contratos indexados. Re-disparar el
    // backfill en cada page-load borraba las occurrences PROJECTED que el
    // usuario había movido manualmente — efecto "la cuota vuelve sola".
    const [activeQuotes, contractItems] = await Promise.all([
      prisma.cpqQuote.count({
        where: {
          tenantId,
          status: { in: ACTIVE_QUOTE_STATUSES },
          contractStartDate: { not: null },
        },
      }),
      prisma.financeCashflowItem.count({
        where: { tenantId, source: "CONTRACT", isActive: true },
      }),
    ]);
    if (activeQuotes > 0 && contractItems < activeQuotes) {
      triggered.contracts = true;
      await backfillContractItems(tenantId);
    }

    // ── Payroll: si hay instalaciones con dotación pero menos items ──
    const [puestosRows, payrollItems] = await Promise.all([
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
        where: { tenantId, source: "PAYROLL", isActive: true },
      }),
    ]);
    const installationsWithDotacion = puestosRows.filter(
      (p) => p.installationId !== null,
    ).length;
    if (installationsWithDotacion > 0 && payrollItems < installationsWithDotacion) {
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
