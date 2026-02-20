import { prisma } from "@/lib/prisma";
import { resend, getTenantEmailConfig } from "@/lib/resend";
import { getEmailRecipientsForType, sendNotification } from "@/lib/notification-service";
import { getNotificationPrefs } from "@/lib/notification-prefs";
import type { AuthContext } from "@/lib/api-auth";
import { createOpsAuditLog } from "@/lib/ops";

export type RefuerzoStatus = "solicitado" | "en_curso" | "realizado" | "facturado";
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

  const dateOnly = new Date(Date.UTC(startAt.getUTCFullYear(), startAt.getUTCMonth(), startAt.getUTCDate()));

  const created = await prisma.$transaction(async (tx) => {
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

    return tx.opsRefuerzoSolicitud.create({
      data: {
        tenantId: ctx.tenantId,
        installationId: body.installationId,
        accountId: installation.accountId ?? null,
        puestoId: body.puestoId ?? null,
        guardiaId: body.guardiaId,
        turnoExtraId: turnoExtra.id,
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
        status: "solicitado",
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
      },
    });
  });

  await createOpsAuditLog(ctx, "ops.refuerzo.created", "ops_refuerzo_solicitud", created.id, {
    turnoExtraId: created.turnoExtraId,
    guardPaymentClp: Number(created.guardPaymentClp),
  });

  const guardiaName = `${guardia.persona.firstName} ${guardia.persona.lastName}`.trim();
  const tenantPrefs = await getNotificationPrefs(ctx.tenantId);

  const promises: Promise<unknown>[] = [];

  if (tenantPrefs.refuerzoBellEnabled) {
    promises.push(
      sendNotification({
        tenantId: ctx.tenantId,
        type: "refuerzo_solicitud_created",
        title: "Nueva solicitud de turno de refuerzo",
        message: `${installation.name} · ${guardiaName}`,
        link: `/ops/refuerzos`,
        data: { refuerzoId: created.id, installationId: installation.id },
      })
    );
  }

  if (tenantPrefs.refuerzoEmailEnabled) {
    const emailRecipients = await getEmailRecipientsForType(ctx.tenantId, "refuerzo_solicitud_created");
    if (emailRecipients.length > 0) {
      promises.push(
        sendRefuerzoCreatedEmail({
          tenantId: ctx.tenantId,
          installationName: installation.name,
          guardiaName,
          requestedByName: body.requestedByName ?? null,
          requestChannel: body.requestChannel ?? null,
          startAt,
          endAt,
          guardsCount: body.guardsCount,
          guardPaymentClp: body.guardPaymentClp,
          toEmail: emailRecipients,
        })
      );
    }
  }

  await Promise.allSettled(promises);

  return created;
}
