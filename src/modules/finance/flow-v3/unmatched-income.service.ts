import "server-only";
import { prisma } from "@/lib/prisma";
import { cleanRut, formatRut } from "@/lib/chile-rut";
import { buildIncomeMatcher } from "./row-match";
import { UNMATCHED_INCOME_KEY, type FlowRowRef } from "./types";
import { weekStartYmd } from "./weeks";
import { ensureIncomeRows } from "./ensure-income-rows.service";

export interface UnmatchedDteDto {
  dteId: string;
  folio: number | null;
  receiverName: string | null;
  receiverRut: string | null;
  amountClp: number;
  issueDate: string | null;
}

function flowWeekOfDte(dueDate: Date | null, date: Date): string {
  return weekStartYmd(dueDate ?? date);
}

/**
 * DTEs emitidos que caen en UNMATCHED_INCOME_KEY para la semana dada
 * (lunes ISO). Solo lectura.
 */
export async function listUnmatchedIncomeForWeek(
  tenantId: string,
  weekStart: string,
): Promise<UnmatchedDteDto[]> {
  const [rows, dtes] = await Promise.all([
    prisma.financeFlowRow.findMany({
      where: { tenantId, section: "INGRESOS", archivedAt: null },
      select: {
        id: true, name: true, crmAccountId: true, installationId: true,
        recurringTemplateId: true, categoryId: true, supplierId: true,
      },
    }),
    prisma.financeDte.findMany({
      where: {
        tenantId,
        direction: "ISSUED",
        dteType: { in: [33, 34] },
        siiStatus: { in: ["ACCEPTED", "PENDING", "SENT"] },
        voidedByCreditNoteId: null,
        paymentStatus: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
      },
      select: {
        id: true, folio: true, receiverName: true, receiverRut: true,
        totalAmount: true, date: true, dueDate: true,
        crmAccountId: true, installationId: true, recurringTemplateId: true,
      },
      take: 500,
    }),
  ]);

  const refs: FlowRowRef[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    crmAccountId: r.crmAccountId,
    installationId: r.installationId,
    recurringTemplateId: r.recurringTemplateId,
    categoryId: r.categoryId,
    supplierId: r.supplierId,
  }));
  const match = buildIncomeMatcher(refs);

  const out: UnmatchedDteDto[] = [];
  for (const d of dtes) {
    if (flowWeekOfDte(d.dueDate, d.date) !== weekStart) continue;
    if (match(d.crmAccountId, d.installationId, d.recurringTemplateId) !== UNMATCHED_INCOME_KEY) {
      continue;
    }
    out.push({
      dteId: d.id,
      folio: d.folio,
      receiverName: d.receiverName,
      receiverRut: d.receiverRut,
      amountClp: Number(d.totalAmount ?? 0),
      issueDate: d.date.toISOString().slice(0, 10),
    });
  }
  return out;
}

/**
 * Crea/vincula cuenta CRM por RUT si falta + fila genérica de ingresos.
 * El próximo matrix rutea el DTE a esa fila vía matcher.
 */
export async function createRowFromUnmatchedDte(
  tenantId: string,
  dteId: string,
): Promise<{ accountId: string; rowId: string; createdAccount: boolean }> {
  const dte = await prisma.financeDte.findFirst({
    where: { id: dteId, tenantId },
    select: {
      id: true, receiverName: true, receiverRut: true, crmAccountId: true,
    },
  });
  if (!dte) throw new Error("DTE no encontrado");

  let accountId = dte.crmAccountId;
  let createdAccount = false;
  const rutKey = dte.receiverRut ? cleanRut(dte.receiverRut) : "";

  if (!accountId) {
    if (!rutKey) throw new Error("El DTE no tiene RUT de receptor");
    const accounts = await prisma.crmAccount.findMany({
      where: { tenantId, rut: { not: null } },
      select: { id: true, rut: true },
      take: 5000,
    });
    const byRut = accounts.find((a) => a.rut && cleanRut(a.rut) === rutKey);
    if (byRut) {
      accountId = byRut.id;
    } else {
      const created = await prisma.crmAccount.create({
        data: {
          tenantId,
          name: (dte.receiverName || "Cliente").trim(),
          rut: formatRut(rutKey) || dte.receiverRut,
        },
        select: { id: true },
      });
      accountId = created.id;
      createdAccount = true;
    }
    await prisma.financeDte.update({
      where: { id: dte.id },
      data: { crmAccountId: accountId },
    });
  }

  let row = await prisma.financeFlowRow.findFirst({
    where: {
      tenantId,
      section: "INGRESOS",
      crmAccountId: accountId,
      installationId: null,
      recurringTemplateId: null,
      archivedAt: null,
    },
    select: { id: true },
  });
  if (!row) {
    const last = await prisma.financeFlowRow.findFirst({
      where: { tenantId, section: "INGRESOS" },
      orderBy: { orderIndex: "desc" },
      select: { orderIndex: true },
    });
    const acc = await prisma.crmAccount.findFirst({
      where: { id: accountId, tenantId },
      select: { name: true },
    });
    row = await prisma.financeFlowRow.create({
      data: {
        tenantId,
        section: "INGRESOS",
        name: (acc?.name || dte.receiverName || "Cliente").trim(),
        mapping: "ACCOUNT_INSTALLATION",
        orderIndex: (last?.orderIndex ?? -1) + 1,
        crmAccountId: accountId,
      },
      select: { id: true },
    });
  }

  await ensureIncomeRows(tenantId);
  return { accountId, rowId: row.id, createdAccount };
}
