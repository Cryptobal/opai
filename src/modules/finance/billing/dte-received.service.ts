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
};

// ── Service Functions ──

/**
 * List received DTEs for a tenant with pagination and optional supplier filter.
 */
export async function listReceivedDtes(
  tenantId: string,
  opts: ListReceivedDtesOpts = {}
) {
  const { page = 1, pageSize = 50, supplierId } = opts;

  const where: Record<string, unknown> = {
    tenantId,
    direction: "RECEIVED",
  };
  if (supplierId) where.supplierId = supplierId;

  const [dtes, total] = await Promise.all([
    prisma.financeDte.findMany({
      where,
      include: {
        supplier: { select: { id: true, name: true, rut: true } },
        lines: true,
      },
      orderBy: { createdAt: "desc" },
      take: pageSize,
      skip: (page - 1) * pageSize,
    }),
    prisma.financeDte.count({ where }),
  ]);

  return {
    dtes,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
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
