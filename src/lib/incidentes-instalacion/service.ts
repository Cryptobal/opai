import { prisma } from "@/lib/prisma";
import { todayInChile, utcDateFromYmd } from "@/lib/dates-cl";
import { logAudit } from "@/lib/audit";
import { resolveTeamAdminIds } from "@/lib/notifications/resolve-team-admins";
import { formatPersonName } from "@/lib/personas";
import { INCIDENTE_TICKET_TYPE } from "./constants";
import { IncidenteError } from "./errors";
import { lookupReportQr, retireReportQr } from "./report-qr";
import type { ReportChannelInstallation } from "./report-qr";

export async function resolveReportToken(
  token: string,
): Promise<ReportChannelInstallation> {
  const lookup = await lookupReportQr(token);
  if (lookup.kind === "missing" || lookup.kind === "retired") {
    throw new IncidenteError("TOKEN_INVALID", "Este QR ya no está vigente.", 404, {
      tenantName: lookup.kind === "retired" ? lookup.tenantName : undefined,
    });
  }
  if (lookup.kind === "unassigned") {
    throw new IncidenteError(
      "QR_UNASSIGNED",
      "Este código aún no está activo.",
      409,
      {
        tenantName: lookup.tenantName,
        serialLabel: lookup.qr.serialLabel,
        qrId: lookup.qr.id,
      },
    );
  }
  const inst = lookup.installation;
  if (!inst.publicReportEnabled || !inst.isActive || inst.status !== "active") {
    throw new IncidenteError(
      "CHANNEL_DISABLED",
      "Este QR ya no está vigente.",
      403,
      { tenantName: inst.tenantName },
    );
  }
  return inst;
}

export async function enableReportChannel(opts: {
  tenantId: string;
  installationId: string;
  actorId: string;
}): Promise<{ enabled: true }> {
  const inst = await prisma.crmInstallation.findFirst({
    where: { id: opts.installationId, tenantId: opts.tenantId },
    select: { id: true, lat: true, lng: true },
  });
  if (!inst) throw new IncidenteError("NOT_FOUND", "Instalación no encontrada", 404);
  if (inst.lat == null || inst.lng == null) {
    throw new IncidenteError(
      "VALIDATION_ERROR",
      "La instalación necesita coordenadas GPS antes de habilitar el canal de reportes.",
      422,
    );
  }
  await prisma.crmInstallation.update({
    where: { id: inst.id },
    data: { publicReportEnabled: true },
  });
  await logAudit({
    tenantId: opts.tenantId,
    userId: opts.actorId,
    action: "UPDATE",
    entity: "CrmInstallation.publicReport",
    entityId: inst.id,
    details: { enabled: true },
  });
  return { enabled: true };
}

export async function disableReportChannel(opts: {
  tenantId: string;
  installationId: string;
  actorId: string;
}): Promise<void> {
  await prisma.crmInstallation.updateMany({
    where: { id: opts.installationId, tenantId: opts.tenantId },
    data: { publicReportEnabled: false },
  });
  await logAudit({
    tenantId: opts.tenantId,
    userId: opts.actorId,
    action: "UPDATE",
    entity: "CrmInstallation.publicReport",
    entityId: opts.installationId,
    details: { enabled: false },
  });
}

export async function rotateReportToken(opts: {
  tenantId: string;
  installationId: string;
  actorId: string;
}): Promise<{ retired: number }> {
  const inst = await prisma.crmInstallation.findFirst({
    where: { id: opts.installationId, tenantId: opts.tenantId },
    select: { id: true },
  });
  if (!inst) throw new IncidenteError("NOT_FOUND", "Instalación no encontrada", 404);
  const assigned = await prisma.opsReportQr.findMany({
    where: { tenantId: opts.tenantId, installationId: inst.id, status: "assigned" },
    select: { id: true },
  });
  for (const qr of assigned) {
    await retireReportQr({
      tenantId: opts.tenantId,
      qrId: qr.id,
      actorId: opts.actorId,
      reason: "Rotación de canal: adhesivos impresos invalidados",
    });
  }
  await logAudit({
    tenantId: opts.tenantId,
    userId: opts.actorId,
    action: "UPDATE",
    entity: "CrmInstallation.publicReportToken",
    entityId: inst.id,
    details: { rotated: true, retired: assigned.length },
  });
  return { retired: assigned.length };
}

export async function ensureIncidenteTicketType(tenantId: string): Promise<{
  id: string;
  slug: string;
  name: string;
  assignedTeam: string;
  defaultPriority: string;
  slaHours: number;
}> {
  const existing = await prisma.opsTicketType.findUnique({
    where: { tenantId_slug: { tenantId, slug: INCIDENTE_TICKET_TYPE.slug } },
    select: {
      id: true,
      slug: true,
      name: true,
      assignedTeam: true,
      defaultPriority: true,
      slaHours: true,
      isActive: true,
    },
  });
  if (existing) {
    if (!existing.isActive) {
      return prisma.opsTicketType.update({
        where: { id: existing.id },
        data: { isActive: true },
        select: {
          id: true,
          slug: true,
          name: true,
          assignedTeam: true,
          defaultPriority: true,
          slaHours: true,
        },
      });
    }
    return existing;
  }
  return prisma.opsTicketType.create({
    data: {
      tenantId,
      slug: INCIDENTE_TICKET_TYPE.slug,
      name: INCIDENTE_TICKET_TYPE.name,
      description: INCIDENTE_TICKET_TYPE.description,
      origin: INCIDENTE_TICKET_TYPE.origin,
      assignedTeam: INCIDENTE_TICKET_TYPE.assignedTeam,
      defaultPriority: INCIDENTE_TICKET_TYPE.defaultPriority,
      slaHours: INCIDENTE_TICKET_TYPE.slaHours,
      requiresApproval: INCIDENTE_TICKET_TYPE.requiresApproval,
      icon: INCIDENTE_TICKET_TYPE.icon,
      sortOrder: INCIDENTE_TICKET_TYPE.sortOrder,
      isActive: true,
    },
    select: {
      id: true,
      slug: true,
      name: true,
      assignedTeam: true,
      defaultPriority: true,
      slaHours: true,
    },
  });
}

export type GuardiaEnTurno = {
  id: string;
  name: string;
  source: "asistencia" | "pauta";
};

/**
 * Guardia en turno ahora:
 * 1) Asistencia activa (entrada marcada, sin salida) — cubre turnos nocturnos.
 * 2) Fallback: asignados en la pauta del día Chile (planned/actual).
 */
export async function getGuardiasEnTurno(
  tenantId: string,
  installationId: string,
): Promise<GuardiaEnTurno[]> {
  const active = await prisma.opsAsistenciaDiaria.findMany({
    where: {
      tenantId,
      installationId,
      deletedAt: null,
      checkInAt: { not: null },
      checkOutAt: null,
    },
    select: {
      actualGuardiaId: true,
      plannedGuardiaId: true,
      actualGuardia: {
        select: { id: true, persona: { select: { firstName: true, lastName: true } } },
      },
    },
    take: 40,
  });

  const fromAsistencia = new Map<string, GuardiaEnTurno>();
  for (const row of active) {
    const g = row.actualGuardia;
    if (g) {
      fromAsistencia.set(g.id, {
        id: g.id,
        name: formatPersonName(g.persona.firstName, g.persona.lastName) || "Guardia",
        source: "asistencia",
      });
    }
  }
  if (fromAsistencia.size > 0) return [...fromAsistencia.values()];

  const today = utcDateFromYmd(todayInChile());
  const planned = await prisma.opsAsistenciaDiaria.findMany({
    where: {
      tenantId,
      installationId,
      deletedAt: null,
      date: today,
      attendanceStatus: { notIn: ["ausente", "ppc"] },
      OR: [{ actualGuardiaId: { not: null } }, { plannedGuardiaId: { not: null } }],
    },
    select: {
      actualGuardia: {
        select: { id: true, persona: { select: { firstName: true, lastName: true } } },
      },
      plannedGuardia: {
        select: { id: true, persona: { select: { firstName: true, lastName: true } } },
      },
    },
    take: 40,
  });

  const fromPauta = new Map<string, GuardiaEnTurno>();
  for (const row of planned) {
    const g = row.actualGuardia ?? row.plannedGuardia;
    if (g && !fromPauta.has(g.id)) {
      fromPauta.set(g.id, {
        id: g.id,
        name: formatPersonName(g.persona.firstName, g.persona.lastName) || "Guardia",
        source: "pauta",
      });
    }
  }
  return [...fromPauta.values()];
}

export type SupervisorAsignado = {
  id: string;
  name: string;
  email: string | null;
};

export async function getSupervisoresInstalacion(
  tenantId: string,
  installationId: string,
): Promise<SupervisorAsignado[]> {
  const today = utcDateFromYmd(todayInChile());
  const rows = await prisma.opsAsignacionSupervisor.findMany({
    where: {
      tenantId,
      installationId,
      isActive: true,
      startDate: { lte: today },
      OR: [{ endDate: null }, { endDate: { gte: today } }],
    },
    select: {
      supervisor: { select: { id: true, name: true, email: true, status: true } },
    },
  });
  return rows
    .filter((r) => r.supervisor.status === "active")
    .map((r) => ({
      id: r.supervisor.id,
      name: r.supervisor.name,
      email: r.supervisor.email,
    }));
}

export async function getOpsFallbackAdminIds(tenantId: string): Promise<string[]> {
  return resolveTeamAdminIds(tenantId, "ops");
}

export async function supervisorCanAccessInstallation(opts: {
  tenantId: string;
  adminId: string;
  installationId: string;
  viewAll: boolean;
}): Promise<boolean> {
  if (opts.viewAll) return true;
  const today = utcDateFromYmd(todayInChile());
  const assignment = await prisma.opsAsignacionSupervisor.findFirst({
    where: {
      tenantId: opts.tenantId,
      supervisorId: opts.adminId,
      installationId: opts.installationId,
      isActive: true,
      startDate: { lte: today },
      OR: [{ endDate: null }, { endDate: { gte: today } }],
    },
    select: { id: true },
  });
  return Boolean(assignment);
}

export async function listSupervisorInstallationIds(opts: {
  tenantId: string;
  adminId: string;
  viewAll: boolean;
}): Promise<string[] | null> {
  if (opts.viewAll) return null;
  const today = utcDateFromYmd(todayInChile());
  const rows = await prisma.opsAsignacionSupervisor.findMany({
    where: {
      tenantId: opts.tenantId,
      supervisorId: opts.adminId,
      isActive: true,
      startDate: { lte: today },
      OR: [{ endDate: null }, { endDate: { gte: today } }],
    },
    select: { installationId: true },
  });
  return rows.map((r) => r.installationId);
}
