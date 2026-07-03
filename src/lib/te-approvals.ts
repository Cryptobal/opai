/**
 * Servicio de decisión de aprobación de turnos extra (aprobar/rechazar).
 *
 * Extraído del inline de `api/te/[id]/{aprobar,rechazar}/route.ts` para
 * reutilizarlo desde otros transportes (Slack: bandeja + tarjeta). Anti-carrera:
 * `updateMany` con guard de estado (no `paid`, y no re-decidir). Audita con la
 * acción libre `te.approved`/`te.rejected` (paridad con la web) y notifica a
 * quien lo ingresó.
 *
 * Control de acceso = responsabilidad del CALLER (capability `te_approve`).
 * Todo scoping va por `tenantId`.
 */

import { prisma } from "@/lib/prisma";

export interface PendingTe {
  id: string;
  amountClp: number;
  guardiaNombre: string;
  instalacion: string;
  date: Date;
  justificacion: string | null;
}

export interface TeDecisionInput {
  tenantId: string;
  actorId: string;
  actorEmail?: string | null;
  teId: string;
}

export type TeDecisionResult =
  | { ok: true; amountClp: number; createdBy: string | null }
  | { ok: false; error: string; alreadyDecided?: boolean };

function personaName(p?: { firstName: string | null; lastName: string | null } | null): string {
  return [p?.firstName, p?.lastName].filter(Boolean).join(" ") || "Guardia";
}

/** Turnos extra `pending` del tenant (no hay asignación de aprobador). */
export async function listPendingTes(tenantId: string, opts?: { skip?: number; take?: number }): Promise<PendingTe[]> {
  const rows = await prisma.opsTurnoExtra.findMany({
    where: { tenantId, status: "pending" },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    skip: opts?.skip,
    take: opts?.take,
    select: {
      id: true, amountClp: true, date: true, amountJustification: true,
      installation: { select: { name: true } },
      guardia: { select: { persona: { select: { firstName: true, lastName: true } } } },
    },
  });
  return rows.map((t) => ({
    id: t.id,
    amountClp: Number(t.amountClp),
    guardiaNombre: personaName(t.guardia?.persona),
    instalacion: t.installation?.name ?? "—",
    date: t.date,
    justificacion: t.amountJustification,
  }));
}

export async function countPendingTes(tenantId: string): Promise<number> {
  return prisma.opsTurnoExtra.count({ where: { tenantId, status: "pending" } });
}

async function audit(input: TeDecisionInput, action: string, details: Record<string, unknown>): Promise<void> {
  await prisma.auditLog
    .create({ data: { tenantId: input.tenantId, userId: input.actorId, userEmail: input.actorEmail ?? null, action, entity: "te_turno", entityId: input.teId, details } })
    .catch((e) => console.error("[te-approvals] audit:", e));
}

async function notifyCreator(
  tenantId: string, createdBy: string | null, teId: string, kind: "approved" | "rejected", reason?: string,
): Promise<void> {
  if (!createdBy) return;
  const { notify } = await import("@/lib/notifications/notify");
  await notify({
    tenantId,
    type: kind === "approved" ? "te_approved" : "te_rejected",
    targetIds: [createdBy],
    targetType: "ADMIN",
    title: kind === "approved" ? "Turno extra aprobado" : "Turno extra rechazado",
    body: kind === "approved"
      ? "El turno extra que ingresaste fue aprobado"
      : `El turno extra que ingresaste fue rechazado${reason ? `: ${reason}` : ""}`,
    link: `/ops/turnos-extra/aprobaciones`,
    data: { teId, ...(reason ? { motivo: reason } : {}) },
    forceChannels: { email: false },
  }).catch((e) => console.error("[te-approvals] notify:", e));
}

export async function approveTe(input: TeDecisionInput & { amountClp?: number }): Promise<TeDecisionResult> {
  const { tenantId, actorId, teId } = input;
  const te = await prisma.opsTurnoExtra.findFirst({ where: { id: teId, tenantId }, select: { status: true, createdBy: true, amountClp: true } });
  if (!te) return { ok: false, error: "Turno extra no encontrado" };
  if (te.status === "paid") return { ok: false, error: "No se puede aprobar un turno extra ya pagado", alreadyDecided: true };
  if (te.status === "approved") return { ok: false, error: "El turno extra ya fue aprobado.", alreadyDecided: true };

  const data: Record<string, unknown> = {
    status: "approved", approvedBy: actorId, approvedAt: new Date(),
    rejectedBy: null, rejectedAt: null, rejectionReason: null,
  };
  if (input.amountClp !== undefined) {
    const amount = Number(input.amountClp);
    if (isNaN(amount) || amount < 0 || amount > 10_000_000) return { ok: false, error: "Monto inválido" };
    data.amountClp = amount;
  }
  const upd = await prisma.opsTurnoExtra.updateMany({ where: { id: teId, tenantId, status: { in: ["pending", "rejected"] } }, data });
  if (upd.count === 0) return { ok: false, error: "El turno extra ya fue decidido por otra persona.", alreadyDecided: true };

  const finalAmount = input.amountClp ?? Number(te.amountClp);
  await audit(input, "te.approved", input.amountClp !== undefined ? { newAmountClp: finalAmount } : {});
  await notifyCreator(tenantId, te.createdBy, teId, "approved");
  return { ok: true, amountClp: finalAmount, createdBy: te.createdBy };
}

export async function rejectTe(input: TeDecisionInput & { reason?: string | null }): Promise<TeDecisionResult> {
  const { tenantId, actorId, teId } = input;
  const reason = input.reason?.trim() || null;
  const te = await prisma.opsTurnoExtra.findFirst({ where: { id: teId, tenantId }, select: { status: true, createdBy: true, amountClp: true } });
  if (!te) return { ok: false, error: "Turno extra no encontrado" };
  if (te.status === "paid") return { ok: false, error: "No se puede rechazar un turno extra ya pagado", alreadyDecided: true };
  if (te.status === "rejected") return { ok: false, error: "El turno extra ya fue rechazado.", alreadyDecided: true };

  const upd = await prisma.opsTurnoExtra.updateMany({
    where: { id: teId, tenantId, status: { in: ["pending", "approved"] } },
    data: { status: "rejected", rejectedBy: actorId, rejectedAt: new Date(), rejectionReason: reason, approvedBy: null, approvedAt: null },
  });
  if (upd.count === 0) return { ok: false, error: "El turno extra ya fue decidido por otra persona.", alreadyDecided: true };

  await audit(input, "te.rejected", { reason });
  await notifyCreator(tenantId, te.createdBy, teId, "rejected", reason ?? undefined);
  return { ok: true, amountClp: Number(te.amountClp), createdBy: te.createdBy };
}
