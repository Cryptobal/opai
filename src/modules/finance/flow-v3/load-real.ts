import "server-only";
import { prisma } from "@/lib/prisma";
import { bulkResolveCategoriesFromAccounts } from "@/modules/finance/cashflow/categoryAccount.service";
import { ymdToDate } from "./weeks";
import { deriveReal, type DteRefInput, type RealTxInput } from "./derive-real";
import type { FlowRowRef, RealByRow } from "./types";

/**
 * Carga movimientos bancarios visibles del rango (excluye ocultos y
 * transferencias internas/comisiones excluidas del saldo) + referencias de
 * DTEs conciliados, y deriva la capa REAL. Solo lecturas.
 */
export async function loadReal(
  tenantId: string,
  rows: FlowRowRef[],
  weeks: string[],
): Promise<RealByRow> {
  if (weeks.length === 0) return new Map();
  const from = ymdToDate(weeks[0])!;
  const lastMonday = ymdToDate(weeks[weeks.length - 1])!;
  const to = new Date(lastMonday.getTime() + 6 * 86_400_000); // domingo de la última semana

  const [txs, categories] = await Promise.all([
    prisma.financeBankTransaction.findMany({
      where: {
        tenantId,
        transactionDate: { gte: from, lte: to },
        hiddenAt: null,
        excludedReason: null,
      },
      select: {
        id: true,
        transactionDate: true,
        amount: true,
        description: true,
        links: {
          select: { targetType: true, targetId: true, amount: true, accountPlanId: true },
        },
      },
    }),
    prisma.financeCashflowCategory.findMany({
      where: { tenantId },
      select: { id: true, code: true },
    }),
  ]);

  const dteIds = new Set<string>();
  const accountPlanIds = new Set<string>();
  for (const tx of txs) {
    for (const l of tx.links) {
      if ((l.targetType === "DTE_ISSUED" || l.targetType === "DTE_RECEIVED") && l.targetId) {
        dteIds.add(l.targetId);
      }
      if (l.accountPlanId) accountPlanIds.add(l.accountPlanId);
    }
  }

  const dtes = dteIds.size
    ? await prisma.financeDte.findMany({
        where: { tenantId, id: { in: [...dteIds] } },
        select: {
          id: true, folio: true, direction: true, paymentStatus: true,
          crmAccountId: true, installationId: true, supplierId: true,
          recurringTemplateId: true,
          receiverName: true, issuerName: true,
          lines: { select: { accountId: true } },
        },
      })
    : [];

  for (const d of dtes) {
    for (const l of d.lines) if (l.accountId) accountPlanIds.add(l.accountId);
  }
  const accountToCategory = await bulkResolveCategoriesFromAccounts(tenantId, [
    ...accountPlanIds,
  ]);

  const dteById = new Map<string, DteRefInput>();
  for (const d of dtes) {
    let categoryId: string | null = null;
    if (d.direction === "RECEIVED") {
      for (const l of d.lines) {
        if (l.accountId && accountToCategory.has(l.accountId)) {
          categoryId = accountToCategory.get(l.accountId)!.id;
          break;
        }
      }
    }
    dteById.set(d.id, {
      folio: d.folio,
      direction: d.direction,
      crmAccountId: d.crmAccountId,
      installationId: d.installationId,
      recurringTemplateId: d.direction === "ISSUED" ? d.recurringTemplateId : null,
      supplierId: d.supplierId,
      categoryId,
      name: d.direction === "ISSUED" ? (d.receiverName ?? "") : (d.issuerName ?? ""),
      ceded: d.direction === "ISSUED" && d.paymentStatus === "CEDED",
    });
  }

  const txInputs: RealTxInput[] = txs.map((t) => ({
    id: t.id,
    dateYmd: t.transactionDate.toISOString().slice(0, 10),
    amountClp: Number(t.amount),
    description: t.description,
    links: t.links.map((l) => ({
      targetType: l.targetType,
      targetId: l.targetId,
      amountClp: Number(l.amount),
      accountPlanId: l.accountPlanId,
    })),
  }));

  const categoryIdByAccountPlanId = new Map<string, string>();
  for (const [accId, cat] of accountToCategory) categoryIdByAccountPlanId.set(accId, cat.id);

  return deriveReal({
    rows,
    weeks,
    txs: txInputs,
    dteById,
    categoryIdByAccountPlanId,
    categoryCodeById: new Map(categories.map((c) => [c.id, c.code])),
  });
}
