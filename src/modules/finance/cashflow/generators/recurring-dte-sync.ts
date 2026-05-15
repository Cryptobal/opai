import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const SALES_CATEGORY_CODE = "ING_VENTA_CONTRATO";

type SyncAction = "created" | "updated" | "deactivated" | "reactivated" | "noop";

interface RecurringLine {
  quantity?: number | string;
  unitPrice?: number | string;
  unitPriceUf?: number | string;
  discountPct?: number | string;
}

const FREQUENCY_TO_RECURRENCE: Record<
  string,
  "MONTHLY" | "BIWEEKLY" | "WEEKLY" | "YEARLY"
> = {
  monthly: "MONTHLY",
  biweekly: "BIWEEKLY",
  weekly: "WEEKLY",
  yearly: "YEARLY",
};

/**
 * Idempotente: 1 item por FinanceDteRecurringTemplate.
 */
export async function syncRecurringDteItem(
  tenantId: string,
  templateId: string,
): Promise<{ action: SyncAction }> {
  const tpl = await prisma.financeDteRecurringTemplate.findFirst({
    where: { id: templateId, tenantId },
    select: {
      id: true,
      tenantId: true,
      name: true,
      receiverName: true,
      currency: true,
      lines: true,
      frequency: true,
      dayOfMonth: true,
      dayOfWeek: true,
      monthOfYear: true,
      startDate: true,
      endDate: true,
      ufFixingPolicy: true,
      ufFixingDay: true,
      installationId: true,
      crmAccountId: true,
      contractDocumentId: true,
      isActive: true,
    },
  });
  if (!tpl) {
    const r = await prisma.$transaction(async (tx) =>
      deactivateRecurringDteMirrorsForTemplateIds(tx, tenantId, [templateId]),
    );
    return r.itemsDeactivated > 0 || r.occurrencesDeleted > 0
      ? { action: "deactivated" }
      : { action: "noop" };
  }

  // Contrato (Document) eliminado por un path legacy o huérfano: la plantilla
  // no debe seguir generando ingreso en flujo de caja. Se auto-apaga en el
  // próximo sync/cron/backfill (defensa en profundidad además del DELETE en API).
  if (tpl.contractDocumentId) {
    const doc = await prisma.document.findFirst({
      where: { id: tpl.contractDocumentId, tenantId },
      select: { id: true },
    });
    if (!doc) {
      await prisma.$transaction(async (tx) => {
        await tx.financeDteRecurringTemplate.updateMany({
          where: { id: tpl.id, tenantId },
          data: { isActive: false },
        });
        await deactivateRecurringDteMirrorsForTemplateIds(tx, tenantId, [tpl.id]);
      });
      return { action: "deactivated" };
    }
  }

  const cat = await prisma.financeCashflowCategory.findFirst({
    where: { tenantId, code: SALES_CATEGORY_CODE, isActive: true },
    select: { id: true },
  });
  if (!cat) return { action: "noop" };

  const lines = (tpl.lines as RecurringLine[] | null) ?? [];
  const subtotal = lines.reduce((s, l) => {
    const qty = Number(l.quantity ?? 1);
    const price = Number(l.unitPrice ?? l.unitPriceUf ?? 0);
    const disc = Number(l.discountPct ?? 0) / 100;
    return s + qty * price * (1 - disc);
  }, 0);

  // El total a cobrar al cliente es subtotal + IVA 19% (en CLP).
  // Para UF, se aplica IVA al monto convertido en runtime (lo hace el
  // recurrence-engine al expandir? no — engine no aplica IVA. Guardamos
  // el monto facturable directo).
  const amount = tpl.currency === "CLP" ? subtotal * 1.19 : subtotal * 1.19;
  const amountActive = tpl.isActive && subtotal > 0;

  const existing = await prisma.financeCashflowItem.findFirst({
    where: { tenantId, source: "RECURRING_DTE", sourceRefId: templateId },
  });

  if (!amountActive) {
    if (existing && existing.isActive) {
      await prisma.financeCashflowItem.update({
        where: { id: existing.id },
        data: { isActive: false },
      });
      return { action: "deactivated" };
    }
    return { action: "noop" };
  }

  const recurrence = FREQUENCY_TO_RECURRENCE[tpl.frequency] ?? "MONTHLY";
  const data = {
    tenantId,
    categoryId: cat.id,
    kind: "INCOME" as const,
    source: "RECURRING_DTE" as const,
    sourceRefId: tpl.id,
    name: `DTE recurrente · ${tpl.name}`,
    description: `${tpl.receiverName} · ${tpl.currency}`,
    amount: Math.round(amount * 100) / 100,
    currency: tpl.currency,
    ufFixingPolicy: tpl.ufFixingPolicy,
    ufFixingDay: tpl.ufFixingDay,
    recurrence,
    dayOfMonth:
      recurrence === "MONTHLY" || recurrence === "YEARLY"
        ? (tpl.dayOfMonth ?? new Date(tpl.startDate).getDate())
        : null,
    dayOfWeek:
      recurrence === "WEEKLY" || recurrence === "BIWEEKLY"
        ? (tpl.dayOfWeek ?? new Date(tpl.startDate).getDay())
        : null,
    monthOfYear: recurrence === "YEARLY" ? tpl.monthOfYear : null,
    startDate: tpl.startDate,
    endDate: tpl.endDate,
    installationId: tpl.installationId,
    crmAccountId: tpl.crmAccountId,
    isActive: true,
  };

  if (existing) {
    await prisma.financeCashflowItem.update({ where: { id: existing.id }, data });
    return { action: existing.isActive ? "updated" : "reactivated" };
  }
  await prisma.financeCashflowItem.create({ data });
  return { action: "created" };
}

/**
 * Al desactivar o eliminar plantillas DTE recurrentes vinculadas a un contrato CRM,
 * el espejo `FinanceCashflowItem` (source=RECURRING_DTE, sourceRefId=templateId)
 * debe apagarse en la misma transacción. Si sólo actualizamos `FinanceDteRecurringTemplate.isActive`,
 * el ítem del flujo queda vivo hasta el cron y la proyección sigue sumando ese ingreso
 * — o reaparece al dedupe CONTRACT vs RECURRING al borrar sólo el DOCUMENT.
 *
 * Replica la limpieza de `deactivateContractCashflowItems` (occurrences PROJECTED sin match).
 */
export async function deactivateRecurringDteMirrorsForTemplateIds(
  tx: Prisma.TransactionClient,
  tenantId: string,
  templateIds: string[],
): Promise<{ itemsDeactivated: number; occurrencesDeleted: number }> {
  if (templateIds.length === 0) {
    return { itemsDeactivated: 0, occurrencesDeleted: 0 };
  }

  const items = await tx.financeCashflowItem.findMany({
    where: {
      tenantId,
      source: "RECURRING_DTE",
      sourceRefId: { in: templateIds },
    },
    select: { id: true },
  });
  if (items.length === 0) {
    return { itemsDeactivated: 0, occurrencesDeleted: 0 };
  }
  const itemIds = items.map((i) => i.id);

  const occDel = await tx.financeCashflowOccurrence.deleteMany({
    where: {
      tenantId,
      itemId: { in: itemIds },
      status: "PROJECTED",
      bankTransactionId: null,
      dteId: null,
    },
  });

  const itemUpd = await tx.financeCashflowItem.updateMany({
    where: { id: { in: itemIds } },
    data: { isActive: false },
  });

  return {
    itemsDeactivated: itemUpd.count,
    occurrencesDeleted: occDel.count,
  };
}

/**
 * Al eliminar el Document del contrato (cualquier DELETE que borre el PDF row),
 * las plantillas `FinanceDteRecurringTemplate` con `contractDocumentId` apuntando
 * ahí deben desactivarse y apagarse sus espejos `FinanceCashflowItem` (RECURRING_DTE)
 * en la misma transacción. Si no, la dedupe CONTRACT↔RECURRING_DTE deja de aplicar
 * (ya no hay CONTRACT activo) y el flujo vuelve a sumar la recurrente — bug típico
 * tras borrar el contrato solo vía módulo Documentos.
 */
export async function cascadeRecurringDteForDeletedContractDocument(
  tx: Prisma.TransactionClient,
  tenantId: string,
  contractDocumentId: string,
): Promise<{ templatesTouched: number; itemsDeactivated: number; occurrencesDeleted: number }> {
  const linked = await tx.financeDteRecurringTemplate.findMany({
    where: { tenantId, contractDocumentId },
    select: { id: true },
  });
  const templateIds = linked.map((t) => t.id);
  if (templateIds.length === 0) {
    return { templatesTouched: 0, itemsDeactivated: 0, occurrencesDeleted: 0 };
  }

  await tx.financeDteRecurringTemplate.updateMany({
    where: { tenantId, contractDocumentId },
    data: { isActive: false },
  });

  const mir = await deactivateRecurringDteMirrorsForTemplateIds(
    tx,
    tenantId,
    templateIds,
  );

  return {
    templatesTouched: templateIds.length,
    itemsDeactivated: mir.itemsDeactivated,
    occurrencesDeleted: mir.occurrencesDeleted,
  };
}

export interface RecurringDteStats {
  created: number;
  updated: number;
  reactivated: number;
  deactivated: number;
}

export async function backfillRecurringDteItems(
  tenantId: string,
): Promise<RecurringDteStats> {
  const tpls = await prisma.financeDteRecurringTemplate.findMany({
    where: { tenantId },
    select: { id: true },
  });
  const stats: RecurringDteStats = {
    created: 0,
    updated: 0,
    reactivated: 0,
    deactivated: 0,
  };
  for (const t of tpls) {
    const r = await syncRecurringDteItem(tenantId, t.id);
    if (r.action === "created") stats.created++;
    else if (r.action === "updated") stats.updated++;
    else if (r.action === "reactivated") stats.reactivated++;
    else if (r.action === "deactivated") stats.deactivated++;
  }
  return stats;
}

export async function setRecurringDteItemsActive(
  tenantId: string,
  active: boolean,
): Promise<{ affected: number }> {
  const r = await prisma.financeCashflowItem.updateMany({
    where: { tenantId, source: "RECURRING_DTE" },
    data: { isActive: active },
  });
  return { affected: r.count };
}
