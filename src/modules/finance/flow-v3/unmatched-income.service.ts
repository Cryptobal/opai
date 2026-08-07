import "server-only";
import { prisma } from "@/lib/prisma";
import { cleanRut, formatRut } from "@/lib/chile-rut";
import {
  ACTIVE_CESSION_STATUSES,
  cessionFromPaymentStatus,
  computeOverdueDays,
  isCededRetentionName,
  resolveCession,
} from "./overdue";
import { buildIncomeMatcher } from "./row-match";
import { UNMATCHED_INCOME_KEY, addDaysYmd, DEFAULT_COLLECTION_LAG_DAYS, type FlowRowRef } from "./types";
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
  dueDate: string | null;
  overdueDays: number;
  crmAccountId: string | null;
  /** Programaciones de la cuenta (para "Vincular a programación…"). */
  templates: AccountTemplateOption[];
  /** true si el usuario eligió explícitamente "Otros ingresos" al emitir. */
  routedToOtherIncome: boolean;
}

/**
 * Abono bancario de la semana sin links DTE (legado bandeja).
 * El REAL de planilla ya no autollena Otros ingresos con estos abonos.
 */
export interface UnmatchedBankTxDto {
  bankTransactionId: string;
  amountClp: number;
  dateYmd: string;
  description: string;
  reference: string | null;
  beneficiaryRut: string | null;
}

/** Grupo por cliente en el drill de Otros (v4.5). */
export interface UnmatchedIncomeGroupDto {
  key: string;
  crmAccountId: string | null;
  receiverName: string | null;
  receiverRut: string | null;
  subtotalClp: number;
  items: UnmatchedDteDto[];
  /** Programaciones comunes de la cuenta (del primer ítem con templates). */
  templates: AccountTemplateOption[];
}

/** Semana de anclaje alineada con deriveCommittedIncome (emisión u override). */
function flowWeekOfDte(date: Date, overrideYmd?: string | null): string {
  if (overrideYmd) {
    const d = new Date(`${overrideYmd}T00:00:00.000Z`);
    if (!Number.isNaN(d.getTime())) return weekStartYmd(d);
  }
  return weekStartYmd(date);
}

/**
 * DTEs emitidos que caen en UNMATCHED_INCOME_KEY para la semana dada
 * (lunes ISO). Solo lectura.
 */
export async function listUnmatchedIncomeForWeek(
  tenantId: string,
  weekStart: string,
): Promise<UnmatchedDteDto[]> {
  const [rows, dtes, accounts, config] = await Promise.all([
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
        paymentStatus: { in: ["UNPAID", "PARTIAL", "OVERDUE", "CEDED"] },
      },
      select: {
        id: true, folio: true, receiverName: true, receiverRut: true,
        totalAmount: true, amountPaid: true, date: true, dueDate: true,
        paymentStatus: true,
        crmAccountId: true, installationId: true, recurringTemplateId: true,
        flowRouting: true,
      },
      take: 500,
    }),
    prisma.crmAccount.findMany({
      where: { tenantId, rut: { not: null } },
      select: { id: true, rut: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.financeCashflowConfig.findUnique({
      where: { tenantId },
      select: { flowCutoffYmd: true, collectionLagDays: true },
    }),
  ]);
  const cutoffYmd = config?.flowCutoffYmd
    ? config.flowCutoffYmd.toISOString().slice(0, 10)
    : null;
  const lagDays = config?.collectionLagDays ?? DEFAULT_COLLECTION_LAG_DAYS;

  const dteIds = dtes.map((d) => d.id);
  const templateIds = [
    ...new Set(
      dtes
        .map((d) => d.recurringTemplateId)
        .filter((id): id is string => !!id),
    ),
  ];
  const [overrideRows, factoringOps, templates] = await Promise.all([
    dteIds.length > 0
      ? prisma.financeCashflowDteDateOverride.findMany({
          where: { tenantId, dteId: { in: dteIds } },
          select: { dteId: true, customDate: true },
        })
      : Promise.resolve([] as Array<{ dteId: string; customDate: Date }>),
    dteIds.length > 0
      ? prisma.financeFactoringOperation.findMany({
          where: {
            tenantId,
            dteId: { in: dteIds },
            status: { in: [...ACTIVE_CESSION_STATUSES] },
          },
          select: {
            dteId: true,
            status: true,
            advanceRate: true,
            factoringCompany: true,
            fechaVencimiento: true,
          },
        })
      : Promise.resolve([] as Array<{
          dteId: string;
          status: string;
          advanceRate: unknown;
          factoringCompany: string;
          fechaVencimiento: Date | null;
        }>),
    templateIds.length > 0
      ? prisma.financeDteRecurringTemplate.findMany({
          where: { tenantId, id: { in: templateIds } },
          select: { id: true, name: true, diasCobroDesdeFactura: true },
        })
      : Promise.resolve([] as Array<{
          id: string;
          name: string;
          diasCobroDesdeFactura: number | null;
        }>),
  ]);
  const overrideByDteId = new Map(
    overrideRows.map((o) => [o.dteId, o.customDate.toISOString().slice(0, 10)]),
  );
  const opsByDte = new Map<string, typeof factoringOps>();
  for (const op of factoringOps) {
    const list = opsByDte.get(op.dteId) ?? [];
    list.push(op);
    opsByDte.set(op.dteId, list);
  }
  const diasByTemplate = new Map(
    templates.map((t) => [t.id, t.diasCobroDesdeFactura]),
  );
  const nameByTemplate = new Map(templates.map((t) => [t.id, t.name]));

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
    dueDate: string | null;
    overdueDays: number;
    crmAccountId: string | null;
    routedToOtherIncome: boolean;
  }> = [];

  const todayYmd = new Date().toISOString().slice(0, 10);

  for (const d of dtes) {
    const pending = Number(d.totalAmount ?? 0) - Number(d.amountPaid ?? 0);
    if (pending <= 0) continue;
    const issueYmd = d.date.toISOString().slice(0, 10);
    if (cutoffYmd && issueYmd < cutoffYmd) continue;
    if (flowWeekOfDte(d.date, overrideByDteId.get(d.id) ?? null) !== weekStart) continue;
    const accId = resolveAccount(d.crmAccountId, d.receiverRut);
    const forcedOther = d.flowRouting === "OTHER_INCOME";
    const rowKey = forcedOther
      ? UNMATCHED_INCOME_KEY
      : match(accId, d.installationId, d.recurringTemplateId);
    if (rowKey !== UNMATCHED_INCOME_KEY) {
      continue;
    }
    const issueDate = d.date.toISOString().slice(0, 10);
    const templateDias = d.recurringTemplateId
      ? (diasByTemplate.get(d.recurringTemplateId) ?? null)
      : null;
    const dueDate = d.dueDate
      ? d.dueDate.toISOString().slice(0, 10)
      : addDaysYmd(issueDate, templateDias ?? lagDays);
    const ops = opsByDte.get(d.id) ?? [];
    const cession =
      resolveCession(
        ops.map((o) => ({
          status: o.status,
          advanceRate: Number(o.advanceRate),
          factoringCompany: o.factoringCompany,
          fechaVencimiento: o.fechaVencimiento,
        })),
      ) ?? cessionFromPaymentStatus(d.paymentStatus);
    const templateName = d.recurringTemplateId
      ? (nameByTemplate.get(d.recurringTemplateId) ?? null)
      : null;
    const overdueDays = computeOverdueDays({
      dueYmd: dueDate,
      todayYmd,
      pendingClp: pending,
      paymentStatus: d.paymentStatus,
      cession,
      reconciled: false,
      voided: false,
      isCededRetention: isCededRetentionName(templateName),
    });
    unmatched.push({
      dteId: d.id,
      folio: d.folio,
      receiverName: d.receiverName,
      receiverRut: d.receiverRut,
      amountClp: pending,
      issueDate,
      dueDate,
      overdueDays,
      crmAccountId: accId,
      routedToOtherIncome: forcedOther,
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

/** Agrupa DTEs unmatched por cuenta (id) o RUT normalizado. */
export function groupUnmatchedByClient(items: UnmatchedDteDto[]): UnmatchedIncomeGroupDto[] {
  const byKey = new Map<string, UnmatchedIncomeGroupDto>();
  for (const it of items) {
    const rutKey = it.receiverRut ? cleanRut(it.receiverRut) : "";
    const key = it.crmAccountId
      ? `acc:${it.crmAccountId}`
      : rutKey
        ? `rut:${rutKey}`
        : `dte:${it.dteId}`;
    let g = byKey.get(key);
    if (!g) {
      g = {
        key,
        crmAccountId: it.crmAccountId,
        receiverName: it.receiverName,
        receiverRut: it.receiverRut,
        subtotalClp: 0,
        items: [],
        templates: [],
      };
      byKey.set(key, g);
    }
    g.items.push(it);
    g.subtotalClp += it.amountClp;
    if (g.templates.length === 0 && it.templates.length > 0) {
      g.templates = it.templates;
    }
    if (!g.receiverName && it.receiverName) g.receiverName = it.receiverName;
  }
  return [...byKey.values()].sort((a, b) => b.subtotalClp - a.subtotalClp);
}

/** Lista + agrupación: bandeja = abonos; facturas sin fila aparte. */
export async function listUnmatchedIncomeGrouped(
  tenantId: string,
  weekStart: string,
): Promise<{
  /** @deprecated alias de unroutedDtes (back-compat). */
  items: UnmatchedDteDto[];
  groups: UnmatchedIncomeGroupDto[];
  /** @deprecated alias de bankCredits. */
  bankTxs: UnmatchedBankTxDto[];
  bankCredits: UnmatchedBankTxDto[];
  unroutedDtes: UnmatchedDteDto[];
}> {
  const [allDtes, bankCredits] = await Promise.all([
    listUnmatchedIncomeForWeek(tenantId, weekStart),
    listUnmatchedBankIncomeForWeek(tenantId, weekStart),
  ]);
  // Panel "Facturas sin fila": solo las que piden resolución (no OTHER_INCOME).
  const unroutedDtes = allDtes.filter((d) => !d.routedToOtherIncome);
  // Drill de "Otros ingresos": incluye las ruteadas a propósito.
  return {
    items: unroutedDtes,
    unroutedDtes,
    groups: groupUnmatchedByClient(allDtes),
    bankTxs: bankCredits,
    bankCredits,
  };
}

/**
 * Abonos bancarios de la semana sin links (o solo remanente unmatched)
 * que alimentarían UNMATCHED_INCOME_KEY en derive-real.
 */
export async function listUnmatchedBankIncomeForWeek(
  tenantId: string,
  weekStart: string,
): Promise<UnmatchedBankTxDto[]> {
  const weekDate = new Date(`${weekStart}T00:00:00.000Z`);
  if (Number.isNaN(weekDate.getTime())) return [];
  const weekEnd = new Date(weekDate.getTime() + 7 * 86_400_000);

  const txs = await prisma.financeBankTransaction.findMany({
    where: {
      tenantId,
      hiddenAt: null,
      amount: { gt: 0 },
      transactionDate: { gte: weekDate, lt: weekEnd },
      reconciliationStatus: "UNMATCHED",
    },
    select: {
      id: true,
      amount: true,
      transactionDate: true,
      description: true,
      reference: true,
      links: {
        select: { amount: true },
      },
    },
    take: 200,
    orderBy: { transactionDate: "asc" },
  });

  const out: UnmatchedBankTxDto[] = [];
  for (const tx of txs) {
    const amountAbs = Math.abs(Number(tx.amount));
    const linked = tx.links.reduce((s, l) => s + Number(l.amount), 0);
    // Si ya hay links que cubren el monto, no es unmatched.
    const unmatched = amountAbs - linked;
    if (unmatched <= 1) continue;
    const desc = tx.description ?? "";
    const ref = tx.reference;
    const rutMatch = (desc + " " + (ref ?? "")).match(
      /\d{1,2}\.?\d{3}\.?\d{3}-?[\dKk]/,
    );
    out.push({
      bankTransactionId: tx.id,
      amountClp: Math.round(unmatched),
      dateYmd: tx.transactionDate.toISOString().slice(0, 10),
      description: desc,
      reference: ref,
      beneficiaryRut: rutMatch ? cleanRut(rutMatch[0]) : null,
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

  await reconcileIncomeRows(tenantId);
  return { accountId, rowId: row.id, createdAccount };
}
