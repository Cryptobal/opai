import "server-only";
import { prisma } from "@/lib/prisma";
import { recomputePayrollAmounts } from "./generators/payroll-sync";
import { recomputeTurnosExtraAmounts } from "./generators/turnos-extra-sync";
import { recomputeIvaUpcoming } from "./generators/iva-f29-sync";
import { backfillRecurringDteItems } from "./generators/recurring-dte-sync";
import { recomputeRetiroSociosAmounts } from "./generators/retiro-socios-sync";
import { recomputeQuincenaAmount } from "./generators/quincena-sync";

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
  triggered: {
    contracts: boolean;
    payroll: boolean;
    recurringDte: boolean;
    retiroSocios: boolean;
    quincena: boolean;
  };
}> {
  const triggered = {
    contracts: false,
    payroll: false,
    recurringDte: false,
    retiroSocios: false,
    quincena: false,
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

    // ── DTE recurrentes: mirror 1:1 con plantillas (activas e inactivas) ──
    // Idempotente: actualiza dayOfMonth/montos si el usuario editó la plantilla
    // sin pasar por un backfill explícito. Incluye inactivas para apagar espejos.
    const templateCount = await prisma.financeDteRecurringTemplate.count({
      where: { tenantId },
    });
    if (templateCount > 0) {
      triggered.recurringDte = true;
      await backfillRecurringDteItems(tenantId);
    }

    // Turnos extra y IVA siempre se recomputan en cron nightly.
    // No los disparamos desde el page-load para no agregar latencia
    // en el primer load (el cron los cubre).
    void recomputeTurnosExtraAmounts;
    void recomputeIvaUpcoming;

    // ── Retiro socios: dispara cuando hay % > 0 configurado y faltan
    //    items proyectados para el horizonte esperado. Best-effort.
    const retiroCfg = await prisma.financeCashflowConfig.findUnique({
      where: { tenantId },
      select: { retiroSocioPctVentas: true, horizonMonthsDefault: true },
    });
    const retiroPct = Number(retiroCfg?.retiroSocioPctVentas ?? 0);
    if (retiroPct > 0) {
      const horizon = retiroCfg?.horizonMonthsDefault ?? 12;
      const retiroItems = await prisma.financeCashflowItem.count({
        where: { tenantId, source: "RETIRO_SOCIO", isActive: true },
      });
      if (retiroItems < horizon) {
        triggered.retiroSocios = true;
        await recomputeRetiroSociosAmounts(tenantId);
      }
    }

    // ── Quincena / anticipo guardias: dispara cuando existe la categoría
    //    EGR_QUINCENA activa y aún no hay item materializado. Idempotente:
    //    si ya existe, el cron nightly se encarga de mantenerlo al día.
    const quincenaCat = await prisma.financeCashflowCategory.findFirst({
      where: { tenantId, code: "EGR_QUINCENA", isActive: true },
      select: { id: true },
    });
    if (quincenaCat) {
      const quincenaItem = await prisma.financeCashflowItem.count({
        where: { tenantId, source: "QUINCENA", isActive: true },
      });
      if (quincenaItem === 0) {
        triggered.quincena = true;
        await recomputeQuincenaAmount(tenantId);
      }
    }
  } catch (err) {
    console.error("[cashflow] ensureCashflowSynced error:", err);
  }

  return { triggered };
}
