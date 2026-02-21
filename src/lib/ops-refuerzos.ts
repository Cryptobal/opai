import { prisma } from "@/lib/prisma";
import { resend, getTenantEmailConfig } from "@/lib/resend";
import { sendNotificationToUsers } from "@/lib/notification-service";
import type { AuthContext } from "@/lib/api-auth";
import { createOpsAuditLog } from "@/lib/ops";

export type RefuerzoStatus = "pendiente_aprobacion" | "rechazado" | "solicitado" | "en_curso" | "realizado" | "facturado";
export type RefuerzoRateMode = "hora" | "turno";

type CalculateEstimatedTotalInput = {
  guardsCount: number;
  startAt: Date;
  endAt: Date;
  rateMode: RefuerzoRateMode;
  rateClp: number;
};

function getUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getSpannedDaysInclusive(startAt: Date, endAt: Date): number {
  const days = new Set<string>();
  const cursor = new Date(startAt);
  cursor.setUTCHours(0, 0, 0, 0);
  const end = new Date(endAt);
  end.setUTCHours(0, 0, 0, 0);

  while (cursor <= end) {
    days.add(getUtcDateKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return Math.max(1, days.size);
}

export function calculateEstimatedTotalClp(input: CalculateEstimatedTotalInput): number {
  const { guardsCount, startAt, endAt, rateMode, rateClp } = input;
  if (!Number.isFinite(rateClp) || rateClp <= 0) return 0;

  if (rateMode === "hora") {
    const ms = endAt.getTime() - startAt.getTime();
    const hours = Math.max(ms / 3_600_000, 0);
    return Math.round(guardsCount * hours * rateClp);
  }

  const days = getSpannedDaysInclusive(startAt, endAt);
  return Math.round(guardsCount * days * rateClp);
}

export function resolveRefuerzoStatus(status: string, endAt: Date, now = new Date()): RefuerzoStatus {
  if (status === "pendiente_aprobacion") return "pendiente_aprobacion";
  if (status === "rechazado") return "rechazado";
  if (status === "facturado") return "facturado";
  if (status === "realizado") return "realizado";
  if (endAt.getTime() < now.getTime()) return "realizado";
  if (status === "en_curso") return "en_curso";
  return "solicitado";
}

type RefuerzoEmailInput = {
  tenantId: string;
  installationName: string;
  guardiaName: string;
  requestedByName?: string | null;
  requestChannel?: string | null;
  startAt: Date;
  endAt: Date;
  guardsCount: number;
  guardPaymentClp: number;
  toEmail: string | string[];
};

export async function sendRefuerzoCreatedEmail(input: RefuerzoEmailInput): Promise<void> {
  const recipients = Array.isArray(input.toEmail) ? input.toEmail : [input.toEmail];
  if (recipients.length === 0) return;

  const emailConfig = await getTenantEmailConfig(input.tenantId);
  const subject = `Nuevo turno de refuerzo · ${input.installationName}`;
  const start = new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(input.startAt);
  const end = new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(input.endAt);
  const amount = `$${Math.round(input.guardPaymentClp).toLocaleString("es-CL")}`;

  await resend.emails.send({
    from: emailConfig.from,
    replyTo: emailConfig.replyTo,
    to: recipients,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; font-size:14px; color:#0f172a">
        <h2 style="margin:0 0 12px">Nueva solicitud de turno de refuerzo</h2>
        <p style="margin:0 0 8px"><strong>Instalación:</strong> ${input.installationName}</p>
        <p style="margin:0 0 8px"><strong>Guardia asignado:</strong> ${input.guardiaName}</p>
        <p style="margin:0 0 8px"><strong>Solicitado por:</strong> ${input.requestedByName || "No informado"}</p>
        <p style="margin:0 0 8px"><strong>Canal:</strong> ${input.requestChannel || "No informado"}</p>
        <p style="margin:0 0 8px"><strong>Desde:</strong> ${start}</p>
        <p style="margin:0 0 8px"><strong>Hasta:</strong> ${end}</p>
        <p style="margin:0 0 8px"><strong>Cantidad de guardias:</strong> ${input.guardsCount}</p>
        <p style="margin:0 0 8px"><strong>Pago guardia (TE):</strong> ${amount}</p>
      </div>
    `,
    tags: [{ name: "type", value: "refuerzo_solicitud_created" }],
  });
}

type CreateRefuerzoInput = {
  name?: string | null;
  installationId: string;
  puestoId?: string | null;
  guardiaId: string;
  requestedAt?: string;
  requestedByName?: string | null;
  requestChannel?: string | null;
  startAt: string;
  endAt: string;
  guardsCount: number;
  shiftType?: string | null;
  locationText?: string | null;
  notes?: string | null;
  rateMode: RefuerzoRateMode;
  rateClp?: number | null;
  estimatedTotalClp?: number | null;
  paymentCondition?: string | null;
  guardPaymentClp: number;
};

export async function createRefuerzoSolicitud(ctx: AuthContext, body: CreateRefuerzoInput) {
  const { generateTicketCode } = await import("@/lib/tickets");

  const [installation, guardia] = await Promise.all([
    prisma.crmInstallation.findFirst({
      where: { id: body.installationId, tenantId: ctx.tenantId },
      select: {
        id: true,
        name: true,
        accountId: true,
        account: { select: { id: true, name: true } },
      },
    }),
    prisma.opsGuardia.findFirst({
      where: { id: body.guardiaId, tenantId: ctx.tenantId },
      select: {
        id: true,
        status: true,
        isBlacklisted: true,
        persona: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  if (!installation) throw new Error("Instalación no encontrada");
  if (!guardia) throw new Error("Guardia no encontrado");
  if (guardia.status !== "active" || guardia.isBlacklisted) {
    throw new Error("No se puede asignar guardia inactivo o en lista negra");
  }

  if (body.puestoId) {
    const puesto = await prisma.opsPuestoOperativo.findFirst({
      where: {
        id: body.puestoId,
        tenantId: ctx.tenantId,
        installationId: body.installationId,
        active: true,
      },
      select: { id: true },
    });
    if (!puesto) throw new Error("Puesto no encontrado para la instalación");
  }

  const startAt = new Date(body.startAt);
  const endAt = new Date(body.endAt);
  const requestedAt = body.requestedAt ? new Date(body.requestedAt) : new Date();
  if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime()) || endAt <= startAt) {
    throw new Error("Rango de fecha/hora inválido");
  }

  const estimatedTotalClp =
    body.estimatedTotalClp ??
    calculateEstimatedTotalClp({
      guardsCount: body.guardsCount,
      startAt,
      endAt,
      rateMode: body.rateMode,
      rateClp: body.rateClp ?? 0,
    });

  // Find the "turno_refuerzo" ticket type for automatic ticket creation
  const ticketType = await prisma.opsTicketType.findFirst({
    where: { tenantId: ctx.tenantId, slug: "turno_refuerzo", isActive: true },
    include: { approvalSteps: { orderBy: { stepOrder: "asc" } } },
  });

  const requiresApproval = ticketType?.requiresApproval && (ticketType.approvalSteps.length ?? 0) > 0;
  const guardiaName = `${guardia.persona.firstName} ${guardia.persona.lastName}`.trim();

  const created = await prisma.$transaction(async (tx) => {
    // 1. Create approval ticket (if ticket type exists)
    let ticketId: string | null = null;

    if (ticketType) {
      const slaHours = ticketType.slaHours;
      const slaDueAt = new Date(Date.now() + slaHours * 60 * 60 * 1000);

      const lastTicket = await tx.opsTicket.findFirst({
        where: { tenantId: ctx.tenantId },
        orderBy: { createdAt: "desc" },
        select: { code: true },
      });
      const lastSeq = lastTicket?.code
        ? parseInt(lastTicket.code.split("-").pop() ?? "0", 10)
        : 0;
      const code = generateTicketCode(lastSeq + 1);

      const approvalCreateData = requiresApproval
        ? ticketType.approvalSteps.map((step) => ({
            stepOrder: step.stepOrder,
            stepLabel: step.label,
            approverType: step.approverType,
            approverGroupId: step.approverGroupId,
            approverUserId: step.approverUserId,
            decision: "pending",
          }))
        : [];

      const ticket = await tx.opsTicket.create({
        data: {
          tenantId: ctx.tenantId,
          code,
          ticketTypeId: ticketType.id,
          status: requiresApproval ? "pending_approval" : "open",
          priority: ticketType.defaultPriority,
          title: `Refuerzo · ${installation.name} · ${guardiaName}`,
          description: body.notes ?? null,
          assignedTeam: ticketType.assignedTeam,
          installationId: body.installationId,
          guardiaId: body.guardiaId,
          source: "manual",
          reportedBy: ctx.userId,
          slaDueAt,
          slaBreached: false,
          tags: [],
          currentApprovalStep: requiresApproval ? 1 : null,
          approvalStatus: requiresApproval ? "pending" : null,
          metadata: {
            installationName: installation.name,
            accountName: installation.account?.name ?? null,
            guardiaName,
            startAt: startAt.toISOString(),
            endAt: endAt.toISOString(),
            estimatedTotalClp,
            guardPaymentClp: body.guardPaymentClp,
          },
          approvals: {
            create: approvalCreateData,
          },
        },
      });
      ticketId = ticket.id;
    }

    // 2. Create the refuerzo (WITHOUT turnoExtra - that happens on approval)
    const refuerzoStatus = requiresApproval ? "pendiente_aprobacion" : "solicitado";

    const refuerzo = await tx.opsRefuerzoSolicitud.create({
      data: {
        tenantId: ctx.tenantId,
        name: body.name ?? null,
        installationId: body.installationId,
        accountId: installation.accountId ?? null,
        puestoId: body.puestoId ?? null,
        guardiaId: body.guardiaId,
        ticketId,
        requestedAt,
        requestedByName: body.requestedByName ?? null,
        requestChannel: body.requestChannel ?? null,
        startAt,
        endAt,
        guardsCount: body.guardsCount,
        shiftType: body.shiftType ?? null,
        locationText: body.locationText ?? null,
        notes: body.notes ?? null,
        rateMode: body.rateMode,
        rateClp: body.rateClp ?? null,
        estimatedTotalClp,
        paymentCondition: body.paymentCondition ?? null,
        guardPaymentClp: body.guardPaymentClp,
        status: refuerzoStatus,
        createdBy: ctx.userId,
      },
      include: {
        installation: { select: { id: true, name: true } },
        account: { select: { id: true, name: true } },
        puesto: { select: { id: true, name: true } },
        guardia: {
          select: {
            id: true,
            code: true,
            persona: { select: { firstName: true, lastName: true, rut: true } },
          },
        },
        turnoExtra: { select: { id: true, status: true, amountClp: true, paidAt: true } },
        ticket: { select: { id: true, code: true, status: true, approvalStatus: true } },
      },
    });

    // 3. If NO approval required and ticket type has onApprovalAction, execute immediately
    if (!requiresApproval && ticketType?.onApprovalAction === "create_turno_extra") {
      const dateOnly = new Date(Date.UTC(startAt.getUTCFullYear(), startAt.getUTCMonth(), startAt.getUTCDate()));
      const turnoExtra = await tx.opsTurnoExtra.create({
        data: {
          tenantId: ctx.tenantId,
          installationId: body.installationId,
          puestoId: body.puestoId ?? null,
          guardiaId: body.guardiaId,
          date: dateOnly,
          status: "approved",
          tipo: "turno_extra",
          isManual: true,
          amountClp: body.guardPaymentClp,
          approvedBy: ctx.userId,
          approvedAt: new Date(),
          createdBy: ctx.userId,
        },
        select: { id: true },
      });

      await tx.opsRefuerzoSolicitud.update({
        where: { id: refuerzo.id },
        data: { turnoExtraId: turnoExtra.id, status: "solicitado" },
      });

      if (installation.accountId) {
        await tx.financePendingBillableItem.create({
          data: {
            tenantId: ctx.tenantId,
            accountId: installation.accountId,
            sourceType: "refuerzo",
            sourceId: refuerzo.id,
            itemName: `Turno de refuerzo · ${installation.name}`,
            description: `${guardiaName} · ${new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(startAt)} - ${new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(endAt)}`,
            quantity: body.guardsCount,
            unit: body.rateMode === "hora" ? "HRS" : "TRN",
            unitPrice: body.rateClp ?? 0,
            netAmount: estimatedTotalClp,
            status: "pending",
          },
        });
      }
    }

    return refuerzo;
  });

  await createOpsAuditLog(ctx, "ops.refuerzo.created", "ops_refuerzo_solicitud", created.id, {
    ticketId: created.ticketId,
    guardPaymentClp: Number(created.guardPaymentClp),
  });

  // Notify only the requester + first approver group members
  const notifTargetIds: string[] = [ctx.userId]; // requester
  if (requiresApproval && ticketType) {
    const firstStep = ticketType.approvalSteps.find((s) => s.stepOrder === 1);
    if (firstStep?.approverGroupId) {
      const members = await prisma.adminGroupMembership.findMany({
        where: { groupId: firstStep.approverGroupId },
        select: { adminId: true },
      });
      for (const m of members) notifTargetIds.push(m.adminId);
    }
  }

  await sendNotificationToUsers({
    tenantId: ctx.tenantId,
    type: "refuerzo_solicitud_created",
    title: requiresApproval
      ? "Solicitud de refuerzo pendiente de aprobación"
      : "Nueva solicitud de turno de refuerzo",
    message: `${installation.name} · ${guardiaName}`,
    link: created.ticketId ? `/ops/tickets/${created.ticketId}` : `/ops/refuerzos`,
    data: { refuerzoId: created.id, installationId: installation.id, ticketId: created.ticketId },
    targetUserIds: notifTargetIds,
  });

  return created;
}

/* ── Post-approval: create turno extra + pending billable item ─────── */

export async function executeRefuerzoApproval(
  ctx: { tenantId: string; userId: string },
  ticketId: string,
) {
  const refuerzo = await prisma.opsRefuerzoSolicitud.findFirst({
    where: { ticketId, tenantId: ctx.tenantId },
    include: {
      installation: { select: { id: true, name: true } },
      guardia: {
        select: {
          id: true,
          persona: { select: { firstName: true, lastName: true } },
        },
      },
      ticket: { select: { reportedBy: true } },
    },
  });

  if (!refuerzo) throw new Error("Refuerzo no encontrado para este ticket");
  if (refuerzo.turnoExtraId) return; // Already processed

  const startAt = new Date(refuerzo.startAt);
  const dateOnly = new Date(Date.UTC(startAt.getUTCFullYear(), startAt.getUTCMonth(), startAt.getUTCDate()));
  const guardiaName = refuerzo.guardia
    ? `${refuerzo.guardia.persona.firstName} ${refuerzo.guardia.persona.lastName}`.trim()
    : "Guardia";
  const endAt = new Date(refuerzo.endAt);

  await prisma.$transaction(async (tx) => {
    // 1. Create OpsTurnoExtra
    const turnoExtra = await tx.opsTurnoExtra.create({
      data: {
        tenantId: ctx.tenantId,
        installationId: refuerzo.installationId,
        puestoId: refuerzo.puestoId ?? null,
        guardiaId: refuerzo.guardiaId,
        date: dateOnly,
        status: "approved",
        tipo: "turno_extra",
        isManual: true,
        amountClp: refuerzo.guardPaymentClp,
        approvedBy: ctx.userId,
        approvedAt: new Date(),
        createdBy: ctx.userId,
      },
      select: { id: true },
    });

    // 2. Update refuerzo with turnoExtraId and status
    await tx.opsRefuerzoSolicitud.update({
      where: { id: refuerzo.id },
      data: { turnoExtraId: turnoExtra.id, status: "solicitado" },
    });

    // 3. Create pending billable item for finance
    if (refuerzo.accountId) {
      await tx.financePendingBillableItem.create({
        data: {
          tenantId: ctx.tenantId,
          accountId: refuerzo.accountId,
          sourceType: "refuerzo",
          sourceId: refuerzo.id,
          itemName: `Turno de refuerzo · ${refuerzo.installation.name}`,
          description: `${guardiaName} · ${new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(startAt)} - ${new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(endAt)}`,
          quantity: refuerzo.guardsCount,
          unit: refuerzo.rateMode === "hora" ? "HRS" : "TRN",
          unitPrice: refuerzo.rateClp ?? 0,
          netAmount: refuerzo.estimatedTotalClp,
          status: "pending",
        },
      });
    }
  });

  // Notify only the requester (solicitante)
  const approvalTargetIds: string[] = [];
  if (refuerzo.ticket?.reportedBy) approvalTargetIds.push(refuerzo.ticket.reportedBy);

  await sendNotificationToUsers({
    tenantId: ctx.tenantId,
    type: "refuerzo_solicitud_created",
    title: "Turno de refuerzo aprobado",
    message: `${refuerzo.installation.name} · ${guardiaName} — Turno extra y item facturable creados`,
    link: `/ops/refuerzos`,
    data: { refuerzoId: refuerzo.id, ticketId },
    targetUserIds: approvalTargetIds,
  });
}

/* ── Post-rejection: mark refuerzo as rejected ─────────────────────── */

export async function executeRefuerzoRejection(
  ctx: { tenantId: string; userId: string },
  ticketId: string,
) {
  const refuerzo = await prisma.opsRefuerzoSolicitud.findFirst({
    where: { ticketId, tenantId: ctx.tenantId },
    include: {
      installation: { select: { name: true } },
      guardia: {
        select: { persona: { select: { firstName: true, lastName: true } } },
      },
      ticket: { select: { reportedBy: true } },
    },
  });

  if (!refuerzo) return;

  await prisma.opsRefuerzoSolicitud.update({
    where: { id: refuerzo.id },
    data: { status: "rechazado" },
  });

  const guardiaName = refuerzo.guardia
    ? `${refuerzo.guardia.persona.firstName} ${refuerzo.guardia.persona.lastName}`.trim()
    : "Guardia";

  // Notify only the requester (solicitante)
  const rejectionTargetIds: string[] = [];
  if (refuerzo.ticket?.reportedBy) rejectionTargetIds.push(refuerzo.ticket.reportedBy);

  await sendNotificationToUsers({
    tenantId: ctx.tenantId,
    type: "refuerzo_solicitud_created",
    title: "Turno de refuerzo rechazado",
    message: `${refuerzo.installation.name} · ${guardiaName}`,
    link: `/ops/refuerzos`,
    data: { refuerzoId: refuerzo.id, ticketId },
    targetUserIds: rejectionTargetIds,
  });
}
