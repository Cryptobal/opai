/**
 * Servicio de decisión de aprobación de rendiciones (aprobar/rechazar).
 *
 * Extraído del inline de `api/finance/rendiciones/[id]/{approve,reject}/route.ts`
 * para reutilizarlo desde otros transportes (Slack: bandeja + tarjeta) sin
 * reimplementar la transición: valida estado, escribe `FinanceRendicionHistory`,
 * es anti-carrera (updateMany con guard `status=SUBMITTED`), audita y notifica.
 *
 * Control de acceso = responsabilidad del CALLER (route: `rendicion_approve`;
 * Slack: capability del admin vinculado). Todo scoping va por `tenantId`.
 */

import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { notifyRendicionApproved, notifyRendicionRejected } from "@/lib/finance-notifications";

export interface PendingRendicion {
  id: string;
  code: string;
  amount: number;
  date: Date;
  submitterId: string;
  submitterName: string;
  categoria: string | null;
}

export interface RendicionDecisionInput {
  tenantId: string;
  actorId: string;
  actorName?: string | null;
  rendicionId: string;
  comment?: string | null;
}

export type RendicionDecisionResult =
  | { ok: true; code: string; amount: number }
  | { ok: false; error: string; alreadyDecided?: boolean };

/** Rendiciones SUBMITTED con una aprobación pendiente asignada a este admin. */
export async function listRendicionesPendingApproval(
  tenantId: string,
  adminId: string,
  opts?: { skip?: number; take?: number },
): Promise<PendingRendicion[]> {
  const rows = await prisma.financeApproval.findMany({
    where: { approverId: adminId, decision: null, rendicion: { tenantId, status: "SUBMITTED" } },
    select: {
      rendicion: {
        select: { id: true, code: true, amount: true, date: true, submitterId: true, item: { select: { name: true } } },
      },
    },
    orderBy: { rendicion: { date: "desc" } },
    skip: opts?.skip,
    take: opts?.take,
  });
  const submitterIds = [...new Set(rows.map((r) => r.rendicion.submitterId))];
  const admins = await prisma.admin.findMany({ where: { id: { in: submitterIds } }, select: { id: true, name: true, email: true } });
  const nameById = new Map(admins.map((a) => [a.id, a.name ?? a.email ?? "—"]));
  return rows.map((r) => ({
    id: r.rendicion.id,
    code: r.rendicion.code,
    amount: r.rendicion.amount,
    date: r.rendicion.date,
    submitterId: r.rendicion.submitterId,
    submitterName: nameById.get(r.rendicion.submitterId) ?? "—",
    categoria: r.rendicion.item?.name ?? null,
  }));
}

export async function countRendicionesPendingApproval(tenantId: string, adminId: string): Promise<number> {
  return prisma.financeApproval.count({
    where: { approverId: adminId, decision: null, rendicion: { tenantId, status: "SUBMITTED" } },
  });
}

async function notifySubmitter(
  tenantId: string, submitterId: string, code: string, amount: number,
  actorName: string, kind: "approved" | "rejected", reason?: string,
): Promise<void> {
  const submitter = await prisma.admin.findUnique({ where: { id: submitterId }, select: { email: true } });
  if (submitter?.email) {
    const email = kind === "approved"
      ? notifyRendicionApproved({ tenantId, rendicionCode: code, amount, submitterEmail: submitter.email, approverName: actorName })
      : notifyRendicionRejected({ tenantId, rendicionCode: code, amount, submitterEmail: submitter.email, rejectorName: actorName, reason: reason ?? "" });
    email.catch((e) => console.error("[rendiciones-approvals] email:", e));
  }
  const { notify } = await import("@/lib/notifications/notify");
  await notify({
    tenantId,
    type: kind === "approved" ? "rendicion_approved" : "rendicion_rejected",
    targetIds: [submitterId],
    targetType: "ADMIN",
    title: kind === "approved" ? `Rendición ${code} aprobada` : `Rendición ${code} rechazada`,
    body: kind === "approved"
      ? `${actorName} aprobó tu rendición ${code}`
      : `${actorName} rechazó tu rendición ${code}${reason ? `: ${reason}` : ""}`,
    link: `/finanzas/rendiciones`,
    data: { rendicionId: undefined, code, montoClp: amount, ...(reason ? { motivo: reason } : {}) },
    forceChannels: { email: false },
  }).catch((e) => console.error("[rendiciones-approvals] notify:", e));
}

export async function approveRendicion(input: RendicionDecisionInput): Promise<RendicionDecisionResult> {
  const { tenantId, actorId, rendicionId } = input;
  const actorName = input.actorName ?? "un aprobador";
  const r = await prisma.financeRendicion.findFirst({
    where: { id: rendicionId, tenantId },
    select: { status: true, code: true, amount: true, submitterId: true },
  });
  if (!r) return { ok: false, error: "Rendición no encontrada" };
  if (r.status !== "SUBMITTED")
    return { ok: false, error: `Ya no está pendiente (estado: ${r.status})`, alreadyDecided: true };

  const won = await prisma.$transaction(async (tx) => {
    const upd = await tx.financeRendicion.updateMany({
      where: { id: rendicionId, tenantId, status: "SUBMITTED" },
      data: { status: "APPROVED" },
    });
    if (upd.count === 0) return false;
    await tx.financeApproval.updateMany({
      where: { rendicionId, decision: null },
      data: { decision: "APPROVED", comment: input.comment ?? null, decidedAt: new Date() },
    });
    await tx.financeRendicionHistory.create({
      data: {
        rendicionId, action: "APPROVED", fromStatus: "SUBMITTED", toStatus: "APPROVED",
        userId: actorId, userName: actorName, comment: input.comment ?? null, metadata: { fullyApproved: true },
      },
    });
    return true;
  });
  if (!won) return { ok: false, error: "Otro aprobador ya decidió esta rendición.", alreadyDecided: true };

  await logAudit({ action: "UPDATE", entity: "FinanceRendicion", entityId: rendicionId, tenantId, userId: actorId, details: { decision: "APPROVED", code: r.code } });
  await notifySubmitter(tenantId, r.submitterId, r.code, r.amount, actorName, "approved");
  return { ok: true, code: r.code, amount: r.amount };
}

export async function rejectRendicion(input: RendicionDecisionInput & { reason: string }): Promise<RendicionDecisionResult> {
  const { tenantId, actorId, rendicionId, reason } = input;
  const actorName = input.actorName ?? "un aprobador";
  if (!reason?.trim()) return { ok: false, error: "El motivo de rechazo es obligatorio." };
  const r = await prisma.financeRendicion.findFirst({
    where: { id: rendicionId, tenantId },
    select: { status: true, code: true, amount: true, submitterId: true },
  });
  if (!r) return { ok: false, error: "Rendición no encontrada" };
  if (r.status !== "SUBMITTED")
    return { ok: false, error: `Ya no está pendiente (estado: ${r.status})`, alreadyDecided: true };

  const won = await prisma.$transaction(async (tx) => {
    const upd = await tx.financeRendicion.updateMany({
      where: { id: rendicionId, tenantId, status: "SUBMITTED" },
      data: { status: "REJECTED", rejectedAt: new Date(), rejectionReason: reason, rejectedById: actorId },
    });
    if (upd.count === 0) return false;
    await tx.financeApproval.updateMany({
      where: { rendicionId, approverId: actorId, decision: null },
      data: { decision: "REJECTED", comment: reason, decidedAt: new Date() },
    });
    await tx.financeRendicionHistory.create({
      data: { rendicionId, action: "REJECTED", fromStatus: "SUBMITTED", toStatus: "REJECTED", userId: actorId, userName: actorName, comment: reason },
    });
    return true;
  });
  if (!won) return { ok: false, error: "Otro aprobador ya decidió esta rendición.", alreadyDecided: true };

  await logAudit({ action: "UPDATE", entity: "FinanceRendicion", entityId: rendicionId, tenantId, userId: actorId, details: { decision: "REJECTED", code: r.code, reason } });
  await notifySubmitter(tenantId, r.submitterId, r.code, r.amount, actorName, "rejected", reason);
  return { ok: true, code: r.code, amount: r.amount };
}
