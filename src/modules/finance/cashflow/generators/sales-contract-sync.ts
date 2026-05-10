import "server-only";
import { prisma } from "@/lib/prisma";
import { addMonths } from "date-fns";

const ACTIVE_QUOTE_STATUSES = ["accepted", "active", "in_progress", "approved"] as const;
const SALES_CATEGORY_CODE = "ING_VENTA_CONTRATO";

type SyncAction = "created" | "updated" | "deactivated" | "reactivated" | "noop";

/**
 * Idempotente: garantiza que cada CpqQuote activo con contractStartDate
 * tenga su FinanceCashflowItem espejo con source=CONTRACT, sourceRefId=quoteId.
 *
 * Llamar:
 *  - al crear/actualizar/cambiar status de un CpqQuote
 *  - al cambiar contractStartDate, contractDuration, paymentDays, paymentDayMode,
 *    paymentTerms, monthlyCost, currency, installationId, realAnnualIncrement
 *  - en backfill manual y desde el cron nightly
 *
 * Reglas:
 *  - Si el quote sale de los estados activos → marcar item como inactive (no borrar
 *    para preservar history de occurrences materializadas y conciliadas).
 *  - Si vuelve a activarse → reactivar item.
 *  - Si cambian campos relevantes → upsert con los nuevos valores.
 *  - Nunca tocar amountOverride de occurrences ya materializadas.
 */
export async function syncContractItemForQuote(
  tenantId: string,
  quoteId: string,
): Promise<{ action: SyncAction }> {
  const quote = await prisma.cpqQuote.findFirst({
    where: { id: quoteId, tenantId },
    select: {
      id: true,
      tenantId: true,
      code: true,
      name: true,
      clientName: true,
      accountId: true,
      installationId: true,
      installation: { select: { name: true } },
      monthlyCost: true,
      currency: true,
      contractStartDate: true,
      contractDuration: true,
      paymentDays: true,
      paymentDayMode: true,
      paymentTerms: true,
      realAnnualIncrement: true,
      status: true,
    },
  });
  if (!quote) return { action: "noop" };

  const isActive =
    (ACTIVE_QUOTE_STATUSES as readonly string[]).includes(quote.status) &&
    quote.contractStartDate !== null &&
    Number(quote.monthlyCost ?? 0) > 0;

  const cat = await prisma.financeCashflowCategory.findFirst({
    where: { tenantId, code: SALES_CATEGORY_CODE, isActive: true },
    select: { id: true },
  });
  if (!cat) return { action: "noop" }; // tenant aún no inicializó cashflow

  const existing = await prisma.financeCashflowItem.findFirst({
    where: { tenantId, source: "CONTRACT", sourceRefId: quote.id },
  });

  if (!isActive) {
    if (existing && existing.isActive) {
      await prisma.financeCashflowItem.update({
        where: { id: existing.id },
        data: { isActive: false },
      });
      return { action: "deactivated" };
    }
    return { action: "noop" };
  }

  // Mapear paymentDayMode a dayOfMonth.
  // - SPECIFIC_DAY → dayOfMonth = paymentDays (cap 1..28 para evitar months sin día 31)
  // - LAST_BUSINESS_DAY → dayOfMonth = -1 (recurrence-engine usa último día del mes)
  // - FIRST_BUSINESS_DAY / FIRST_MONDAY → dayOfMonth = 1 (aproximación; el engine
  //   no resuelve "día hábil" sin extensión de schema). El usuario puede ajustar
  //   la occurrence individual con shift-day si necesita corrección puntual.
  const dom =
    quote.paymentDayMode === "LAST_BUSINESS_DAY"
      ? -1
      : quote.paymentDayMode === "SPECIFIC_DAY"
        ? Math.min(Math.max(quote.paymentDays ?? 5, 1), 28)
        : 1;

  // Postpago = se factura el mes siguiente al servicio prestado.
  const isPostpago =
    (quote.paymentTerms ?? "").toLowerCase().includes("contrafactura") ||
    (quote.paymentTerms ?? "").toLowerCase().includes("post");

  const startDate = isPostpago
    ? addMonths(quote.contractStartDate!, 1)
    : quote.contractStartDate!;
  const endDate = addMonths(quote.contractStartDate!, quote.contractDuration ?? 12);

  const name = quote.installation?.name ?? quote.clientName ?? quote.name ?? quote.code;
  const description = `Contrato ${quote.code} · ${quote.installation?.name ?? "sin instalación"}`;

  const data = {
    tenantId,
    categoryId: cat.id,
    kind: "INCOME" as const,
    source: "CONTRACT" as const,
    sourceRefId: quote.id,
    name,
    description,
    amount: Number(quote.monthlyCost),
    currency: quote.currency,
    recurrence: "MONTHLY" as const,
    dayOfMonth: dom,
    dayOfWeek: null,
    monthOfYear: null,
    startDate,
    endDate,
    installationId: quote.installationId,
    crmAccountId: quote.accountId,
    isActive: true,
  };

  if (existing) {
    await prisma.financeCashflowItem.update({
      where: { id: existing.id },
      data,
    });
    return { action: existing.isActive ? "updated" : "reactivated" };
  }
  await prisma.financeCashflowItem.create({ data });
  return { action: "created" };
}

export interface BackfillContractStats {
  created: number;
  updated: number;
  reactivated: number;
  deactivated: number;
}

/** Backfill: sincroniza todos los quotes del tenant. */
export async function backfillContractItems(tenantId: string): Promise<BackfillContractStats> {
  const quotes = await prisma.cpqQuote.findMany({
    where: { tenantId },
    select: { id: true },
  });
  const stats: BackfillContractStats = {
    created: 0,
    updated: 0,
    reactivated: 0,
    deactivated: 0,
  };
  for (const q of quotes) {
    const r = await syncContractItemForQuote(tenantId, q.id);
    if (r.action === "created") stats.created++;
    else if (r.action === "updated") stats.updated++;
    else if (r.action === "reactivated") stats.reactivated++;
    else if (r.action === "deactivated") stats.deactivated++;
  }
  return stats;
}

/** Toggle masivo: activa/desactiva todos los items source=CONTRACT del tenant. */
export async function setContractItemsActive(
  tenantId: string,
  active: boolean,
): Promise<{ affected: number }> {
  const result = await prisma.financeCashflowItem.updateMany({
    where: { tenantId, source: "CONTRACT" },
    data: { isActive: active },
  });
  return { affected: result.count };
}
