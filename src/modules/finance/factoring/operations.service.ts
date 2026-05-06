/**
 * Service de gestión de operaciones de factoring (Bloque 3 v3).
 *
 * Cubre:
 *   - listFactoringOperations / getFactoringOperationDetail
 *   - getFactoringKpis (volumen, anticipos pendientes, costo financiero, plazo prom)
 *   - Transiciones manuales: markFunded, markCollected, markClosed, cancelOperation
 *
 * Las transiciones automáticas (SUBMITTED → APPROVED) las maneja el cron
 * del Bloque 9 cuando el SII confirma EOK.
 *
 * Multi-tenant: TODAS las queries filtran por tenantId.
 */

import { prisma } from "@/lib/prisma";
import type { FinanceFactoringStatus } from "@prisma/client";

/**
 * Tabla de transiciones manuales permitidas. Las transiciones automáticas
 * (SUBMITTED → APPROVED) las hace el cron y NO pasan por aquí.
 */
const VALID_TRANSITIONS: Record<FinanceFactoringStatus, FinanceFactoringStatus[]> = {
  SIMULATED: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["CANCELLED"],
  APPROVED: ["FUNDED", "CANCELLED"],
  FUNDED: ["COLLECTED"],
  COLLECTED: ["CLOSED"],
  CLOSED: [],
  CANCELLED: [],
};

export interface ListOperationsOptions {
  periodo?: string; // YYYY-MM filtro sobre fechaCesion (o submittedAt si no hay)
  factoringCompanyId?: string;
  statusIn?: FinanceFactoringStatus[];
  page?: number;
  pageSize?: number;
}

/**
 * Lista paginada de operaciones del tenant con joins mínimos
 * (DTE folio + factoring company para mostrar en tabla).
 */
export async function listFactoringOperations(
  tenantId: string,
  options: ListOperationsOptions = {},
) {
  const where: Record<string, unknown> = { tenantId };
  if (options.factoringCompanyId) {
    where.factoringCompanyId = options.factoringCompanyId;
  }
  if (options.statusIn && options.statusIn.length > 0) {
    where.status = { in: options.statusIn };
  }
  if (options.periodo && /^\d{4}-\d{2}$/.test(options.periodo)) {
    const [y, m] = options.periodo.split("-").map((s) => parseInt(s, 10));
    const from = new Date(Date.UTC(y, m - 1, 1));
    const to = new Date(Date.UTC(y, m, 1));
    where.fechaCesion = { gte: from, lt: to };
  }

  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 20;

  const [operations, total] = await Promise.all([
    prisma.financeFactoringOperation.findMany({
      where,
      orderBy: [{ fechaCesion: "desc" }, { createdAt: "desc" }],
      take: pageSize,
      skip: (page - 1) * pageSize,
      include: {
        dte: {
          select: { id: true, dteType: true, folio: true, receiverName: true },
        },
        factoringCompanyRel: {
          select: { id: true, razonSocial: true, rut: true },
        },
      },
    }),
    prisma.financeFactoringOperation.count({ where }),
  ]);

  return { operations, total, page, pageSize };
}

/**
 * Detalle completo de una operación (incluye AEC y datos del DTE).
 * Validamos tenant para evitar cross-tenant leak.
 */
export async function getFactoringOperationDetail(tenantId: string, id: string) {
  const op = await prisma.financeFactoringOperation.findFirst({
    where: { id, tenantId },
    include: {
      dte: {
        select: {
          id: true,
          dteType: true,
          folio: true,
          date: true,
          issuerRut: true,
          receiverRut: true,
          receiverName: true,
          totalAmount: true,
          siiStatus: true,
        },
      },
      factoringCompanyRel: true,
    },
  });
  return op;
}

/**
 * KPIs agregados del período (mes actual por default). Multi-tenant.
 */
export async function getFactoringKpis(tenantId: string, periodo?: string) {
  const now = new Date();
  const period = periodo && /^\d{4}-\d{2}$/.test(periodo)
    ? periodo
    : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const [y, m] = period.split("-").map((s) => parseInt(s, 10));
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 1));

  // Operaciones del período (todas las activas no canceladas).
  const periodOps = await prisma.financeFactoringOperation.findMany({
    where: {
      tenantId,
      fechaCesion: { gte: from, lt: to },
      status: { not: "CANCELLED" },
    },
    select: {
      montoCesion: true,
      netAdvance: true,
      interestAmount: true,
      commissionAmount: true,
      plazoDias: true,
      status: true,
    },
  });

  let volumeMes = 0;
  let costoFinanciero = 0;
  let plazoSum = 0;
  let plazoCount = 0;
  for (const o of periodOps) {
    volumeMes += Number(o.montoCesion ?? 0);
    costoFinanciero += Number(o.interestAmount ?? 0) + Number(o.commissionAmount ?? 0);
    if (o.plazoDias) {
      plazoSum += o.plazoDias;
      plazoCount += 1;
    }
  }
  const plazoPromedio = plazoCount > 0 ? Math.round(plazoSum / plazoCount) : 0;

  // Anticipos pendientes (APPROVED — esperando giro del factoring).
  // Independiente del período: dinero que ya está aprobado pero no recibido.
  const pendingApproved = await prisma.financeFactoringOperation.aggregate({
    where: { tenantId, status: "APPROVED" },
    _sum: { netAdvance: true },
    _count: true,
  });

  return {
    periodo: period,
    volumeMes: Math.round(volumeMes),
    operationsCount: periodOps.length,
    costoFinanciero: Math.round(costoFinanciero),
    plazoPromedio,
    pendingApprovedAmount: Math.round(Number(pendingApproved._sum.netAdvance ?? 0)),
    pendingApprovedCount: pendingApproved._count,
  };
}

/**
 * Aplica una transición manual validando contra VALID_TRANSITIONS.
 * Helper interno usado por markFunded/markCollected/markClosed/cancel.
 */
async function applyTransition(
  tenantId: string,
  id: string,
  to: FinanceFactoringStatus,
  extraFields: Record<string, unknown>,
) {
  const op = await prisma.financeFactoringOperation.findFirst({
    where: { id, tenantId },
    select: { id: true, status: true, code: true },
  });
  if (!op) throw new Error("Operación no encontrada en este tenant.");

  const allowed = VALID_TRANSITIONS[op.status as FinanceFactoringStatus] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(
      `Transición inválida: ${op.code} está en ${op.status}, no se puede pasar a ${to}.`,
    );
  }

  return prisma.financeFactoringOperation.update({
    where: { id },
    data: { status: to, ...extraFields },
  });
}

export async function markFunded(tenantId: string, id: string) {
  return applyTransition(tenantId, id, "FUNDED", { fundedAt: new Date() });
}

export async function markCollected(tenantId: string, id: string) {
  return applyTransition(tenantId, id, "COLLECTED", { collectedAt: new Date() });
}

export async function markClosed(tenantId: string, id: string) {
  return applyTransition(tenantId, id, "CLOSED", { closedAt: new Date() });
}

export async function cancelOperation(
  tenantId: string,
  id: string,
  reason: string,
) {
  if (!reason || reason.trim().length < 3) {
    throw new Error("Razón de cancelación requerida (mínimo 3 caracteres).");
  }
  return applyTransition(tenantId, id, "CANCELLED", {
    notes: `[CANCELADA] ${reason.trim()}`,
  });
}
