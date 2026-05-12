/**
 * DTE Received Service
 * Manages received DTEs (purchase invoices from suppliers).
 */

import { prisma } from "@/lib/prisma";

// ── Types ──

export type RegisterReceivedDteInput = {
  dteType: number;
  folio: number;
  date: string;
  dueDate?: string;
  issuerRut: string;
  issuerName: string;
  netAmount: number;
  exemptAmount?: number;
  taxAmount: number;
  totalAmount: number;
  supplierId?: string;
  accountId?: string;
  notes?: string;
  receptionStatus?: "PENDING_REVIEW" | "ACCEPTED" | "CLAIMED" | "PARTIAL_CLAIM";
};

export type UpdateReceivedDteInput = {
  dueDate?: string;
  supplierId?: string;
  accountId?: string;
  receptionStatus?: "PENDING_REVIEW" | "ACCEPTED" | "CLAIMED" | "PARTIAL_CLAIM";
  notes?: string;
};

export type ListReceivedDtesOpts = {
  page?: number;
  pageSize?: number;
  supplierId?: string;
  accountId?: string;
  installationId?: string;
  sort?: string;
  /** Filtro por período (mes-año) — formato "YYYY-MM". Filtra por FinanceDte.date. */
  periodo?: string;
  /** Búsqueda libre: folio, RUT emisor, nombre emisor. */
  search?: string;
  /** Filtros server-side adicionales (post 2026-05). Antes vivían en cliente. */
  paymentStatuses?: string[];
  dteTypes?: number[];
  receptionStatuses?: string[];
  amountMin?: number;
  amountMax?: number;
};

// ── Service Functions ──

/**
 * List received DTEs for a tenant with pagination and optional supplier filter.
 */
export async function listReceivedDtes(
  tenantId: string,
  opts: ListReceivedDtesOpts = {}
) {
  const {
    page = 1,
    pageSize = 50,
    supplierId,
    accountId,
    installationId,
    sort = "date_desc",
    periodo,
    search,
    paymentStatuses,
    dteTypes,
    receptionStatuses,
    amountMin,
    amountMax,
  } = opts;

  const where: Record<string, unknown> = {
    tenantId,
    direction: "RECEIVED",
  };
  if (supplierId) where.supplierId = supplierId;
  if (paymentStatuses && paymentStatuses.length > 0) {
    where.paymentStatus = { in: paymentStatuses };
  }
  if (dteTypes && dteTypes.length > 0) {
    where.dteType = { in: dteTypes };
  }
  if (receptionStatuses && receptionStatuses.length > 0) {
    where.receptionStatus = { in: receptionStatuses };
  }
  if (amountMin != null && Number.isFinite(amountMin)) {
    where.totalAmount = { ...(where.totalAmount as object | undefined), gte: amountMin };
  }
  if (amountMax != null && Number.isFinite(amountMax)) {
    where.totalAmount = { ...(where.totalAmount as object | undefined), lte: amountMax };
  }
  // Búsqueda libre: matchea folio (entero), RUT emisor y nombre emisor.
  // Folio se interpreta como número solo si el input es numérico, para
  // no romper la búsqueda parcial de texto.
  if (search && search.trim()) {
    const q = search.trim();
    const folioNum = /^\d+$/.test(q) ? parseInt(q, 10) : null;
    where.OR = [
      ...(folioNum !== null ? [{ folio: folioNum }] : []),
      { issuerRut: { contains: q, mode: "insensitive" } },
      { issuerName: { contains: q, mode: "insensitive" } },
    ];
  }
  if (accountId === "NONE") {
    where.crmAccountId = null;
  } else if (accountId && accountId !== "ALL") {
    where.crmAccountId = accountId;
  }
  if (installationId === "NONE") {
    where.installationId = null;
  } else if (installationId && installationId !== "ALL") {
    where.installationId = installationId;
  }
  // Filtro por período: "CURRENT_MONTH" o "YYYY-MM" (rango [primer día del mes, primer día del mes siguiente)).
  if (periodo === "CURRENT_MONTH") {
    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const to = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    where.date = { gte: from, lt: to };
  } else if (periodo && /^\d{4}-\d{2}$/.test(periodo)) {
    const [y, m] = periodo.split("-").map((s) => parseInt(s, 10));
    const from = new Date(Date.UTC(y, m - 1, 1));
    const to = new Date(Date.UTC(y, m, 1));
    where.date = { gte: from, lt: to };
  }

  const [dtes, total] = await Promise.all([
    prisma.financeDte.findMany({
      where,
      include: {
        supplier: { select: { id: true, name: true, rut: true } },
        lines: true,
      },
      orderBy: getDteOrderBy(sort),
      take: pageSize,
      skip: (page - 1) * pageSize,
    }),
    prisma.financeDte.count({ where }),
  ]);

  // Enriquecer con datos de centro de costo (cliente CRM + instalación).
  // Se hace en queries separadas porque FinanceDte no tiene relación
  // formal a CrmAccount/CrmInstallation (son FK lógicas).
  const accountIds = Array.from(
    new Set(dtes.map((d) => d.crmAccountId).filter((v): v is string => !!v)),
  );
  const installationIds = Array.from(
    new Set(dtes.map((d) => d.installationId).filter((v): v is string => !!v)),
  );
  const [accounts, installations] = await Promise.all([
    accountIds.length > 0
      ? prisma.crmAccount.findMany({
          where: { id: { in: accountIds }, tenantId },
          select: { id: true, name: true, legalName: true },
        })
      : Promise.resolve([]),
    installationIds.length > 0
      ? prisma.crmInstallation.findMany({
          where: { id: { in: installationIds }, tenantId },
          select: { id: true, name: true, commune: true },
        })
      : Promise.resolve([]),
  ]);
  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const installationMap = new Map(installations.map((i) => [i.id, i]));

  // Conciliación con cartola: último FinancePaymentRecord asociado a
  // cada DTE recibido. Sirve para la columna "Pago / Conciliación" con
  // tooltip "Conciliado el {fecha} con mov. {referencia}".
  const dteIds = dtes.map((d) => d.id);
  const allocations = dteIds.length > 0
    ? await prisma.financePaymentAllocation.findMany({
        where: { dteId: { in: dteIds } },
        select: {
          dteId: true,
          payment: {
            select: {
              id: true,
              code: true,
              date: true,
              status: true,
              bankTransaction: {
                select: {
                  id: true,
                  transactionDate: true,
                  reference: true,
                  description: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      })
    : [];
  const lastPaymentByDte = new Map<
    string,
    {
      paymentId: string;
      paymentCode: string;
      paymentDate: string;
      paymentStatus: string;
      bankTransactionId: string | null;
      bankTransactionDate: string | null;
      bankTransactionReference: string | null;
      bankTransactionDescription: string | null;
    }
  >();
  for (const a of allocations) {
    if (lastPaymentByDte.has(a.dteId)) continue;
    lastPaymentByDte.set(a.dteId, {
      paymentId: a.payment.id,
      paymentCode: a.payment.code,
      paymentDate: a.payment.date.toISOString(),
      paymentStatus: a.payment.status,
      bankTransactionId: a.payment.bankTransaction?.id ?? null,
      bankTransactionDate:
        a.payment.bankTransaction?.transactionDate.toISOString() ?? null,
      bankTransactionReference: a.payment.bankTransaction?.reference ?? null,
      bankTransactionDescription:
        a.payment.bankTransaction?.description ?? null,
    });
  }

  const enriched = dtes.map((d) => ({
    ...d,
    crmAccount: d.crmAccountId ? accountMap.get(d.crmAccountId) ?? null : null,
    installation: d.installationId
      ? installationMap.get(d.installationId) ?? null
      : null,
    lastReconciliation: lastPaymentByDte.get(d.id) ?? null,
  }));

  return {
    dtes: enriched,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

function getDteOrderBy(sort: string): Record<string, "asc" | "desc">[] {
  switch (sort) {
    case "date_asc":
      return [{ date: "asc" }, { folio: "asc" }];
    case "created_desc":
      return [{ createdAt: "desc" }];
    case "created_asc":
      return [{ createdAt: "asc" }];
    case "total_desc":
      return [{ totalAmount: "desc" }, { date: "desc" }];
    case "total_asc":
      return [{ totalAmount: "asc" }, { date: "desc" }];
    case "date_desc":
    default:
      return [{ date: "desc" }, { folio: "desc" }];
  }
}

/**
 * Get a single received DTE by ID.
 */
export async function getReceivedDte(tenantId: string, id: string) {
  return prisma.financeDte.findFirst({
    where: { id, tenantId, direction: "RECEIVED" },
    include: {
      supplier: { select: { id: true, name: true, rut: true } },
      lines: true,
    },
  });
}

/**
 * Register a new received DTE (purchase invoice).
 */
export async function registerReceivedDte(
  tenantId: string,
  userId: string,
  data: RegisterReceivedDteInput
) {
  // Generate sequential code for received DTEs
  const count = await prisma.financeDte.count({
    where: { tenantId, direction: "RECEIVED" },
  });
  const code = `RCV-${String(count + 1).padStart(6, "0")}`;

  return prisma.financeDte.create({
    data: {
      tenantId,
      direction: "RECEIVED",
      dteType: data.dteType,
      folio: data.folio,
      code,
      date: new Date(data.date),
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      issuerRut: data.issuerRut,
      issuerName: data.issuerName,
      receiverRut: "",
      receiverName: "",
      netAmount: data.netAmount,
      exemptAmount: data.exemptAmount ?? 0,
      taxRate: 19,
      taxAmount: data.taxAmount,
      totalAmount: data.totalAmount,
      currency: "CLP",
      supplierId: data.supplierId ?? null,
      accountId: data.accountId ?? null,
      siiStatus: "ACCEPTED",
      receptionStatus: data.receptionStatus ?? "PENDING_REVIEW",
      paymentStatus: "UNPAID",
      amountPaid: 0,
      amountPending: data.totalAmount,
      notes: data.notes ?? null,
      createdBy: userId,
    },
    include: {
      supplier: { select: { id: true, name: true, rut: true } },
    },
  });
}

/**
 * Update allowed fields on a received DTE.
 * Only: dueDate, supplierId, accountId, receptionStatus, notes.
 */
export async function updateReceivedDte(
  tenantId: string,
  id: string,
  data: UpdateReceivedDteInput
) {
  // Verify the DTE exists and belongs to this tenant + is a received DTE
  const existing = await prisma.financeDte.findFirst({
    where: { id, tenantId, direction: "RECEIVED" },
  });
  if (!existing) return null;

  const updateData: Record<string, unknown> = {};
  if (data.dueDate !== undefined) {
    updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
  }
  if (data.supplierId !== undefined) {
    updateData.supplierId = data.supplierId ?? null;
  }
  if (data.accountId !== undefined) {
    updateData.accountId = data.accountId ?? null;
  }
  if (data.receptionStatus !== undefined) {
    updateData.receptionStatus = data.receptionStatus;
  }
  if (data.notes !== undefined) {
    updateData.notes = data.notes ?? null;
  }

  return prisma.financeDte.update({
    where: { id },
    data: updateData,
    include: {
      supplier: { select: { id: true, name: true, rut: true } },
      lines: true,
    },
  });
}
