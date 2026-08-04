import "server-only";
import { prisma } from "@/lib/prisma";
import { cleanRut, formatRut } from "@/lib/chile-rut";
import { buildIncomeMatcher } from "./row-match";
import { UNMATCHED_INCOME_KEY, type FlowRowRef } from "./types";
import { weekStartYmd } from "./weeks";
import { reconcileIncomeRows } from "./reconcile-income-rows.service";
import {
  listTemplatesForDte,
  type AccountTemplateOption,
} from "./link-template.service";

export interface UnmatchedDteDto {
  dteId: string;
  folio: number | null;
  receiverName: string | null;
  receiverRut: string | null;
  amountClp: number;
  issueDate: string | null;
  crmAccountId: string | null;
  /** Programaciones de la cuenta (para "Vincular a programación…"). */
  templates: AccountTemplateOption[];
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
  const [rows, dtes, accounts] = await Promise.all([
    prisma.financeFlowRow.findMany({
      where: { tenantId, section: "INGRESOS", archivedAt: null },
      select: {
        id: true, name: true, mapping: true, section: true,
        crmAccountId: true, installationId: true,
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
    prisma.crmAccount.findMany({
      where: { tenantId, rut: { not: null } },
      select: { id: true, rut: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const accountByRut = new Map<string, string>();
  for (const a of accounts) {
    if (!a.rut) continue;
    const key = cleanRut(a.rut);
    if (key && !accountByRut.has(key)) accountByRut.set(key, a.id);
  }
  const resolveAccount = (
    crmAccountId: string | null,
    receiverRut: string | null | undefined,
  ): string | null => {
    if (crmAccountId) return crmAccountId;
    if (!receiverRut) return null;
    const key = cleanRut(receiverRut);
    return key ? (accountByRut.get(key) ?? null) : null;
  };

  const refs: FlowRowRef[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    section: r.section,
    mapping: r.mapping,
    crmAccountId: r.crmAccountId,
    installationId: r.installationId,
    recurringTemplateId: r.recurringTemplateId,
    categoryId: r.categoryId,
    supplierId: r.supplierId,
  }));
  const match = buildIncomeMatcher(refs);

  const unmatched: Array<{
    dteId: string;
    folio: number | null;
    receiverName: string | null;
    receiverRut: string | null;
    amountClp: number;
    issueDate: string | null;
    crmAccountId: string | null;
  }> = [];

  for (const d of dtes) {
    if (flowWeekOfDte(d.dueDate, d.date) !== weekStart) continue;
    const accId = resolveAccount(d.crmAccountId, d.receiverRut);
    if (match(accId, d.installationId, d.recurringTemplateId) !== UNMATCHED_INCOME_KEY) {
      continue;
    }
    unmatched.push({
      dteId: d.id,
      folio: d.folio,
      receiverName: d.receiverName,
      receiverRut: d.receiverRut,
      amountClp: Number(d.totalAmount ?? 0),
      issueDate: d.date.toISOString().slice(0, 10),
      crmAccountId: accId,
    });
  }

  // Enriquecer con programaciones de la cuenta (para acción vincular).
  const out: UnmatchedDteDto[] = [];
  for (const u of unmatched) {
    let templates: AccountTemplateOption[] = [];
    try {
      const listed = await listTemplatesForDte(tenantId, u.dteId);
      templates = listed.templates;
    } catch {
      templates = [];
    }
    out.push({ ...u, templates });
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

  await reconcileIncomeRows(tenantId);
  return { accountId, rowId: row.id, createdAccount };
}
