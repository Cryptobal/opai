/**
 * Consultas del reportería DT interna (`/api/reportes/dt/*`).
 * Extraídas sin cambiar el contrato JSON del ERP.
 */
import { prisma } from "@/lib/prisma";
import { utcRangeFromYmd } from "./filters";
import { isChileHoliday } from "./feriados-cl";

const FERIADOS_CL_2026 = [
  "2026-01-01",
  "2026-04-03",
  "2026-04-04",
  "2026-05-01",
  "2026-05-21",
  "2026-06-20",
  "2026-06-29",
  "2026-07-16",
  "2026-08-15",
  "2026-09-18",
  "2026-09-19",
  "2026-10-12",
  "2026-10-31",
  "2026-11-01",
  "2026-12-08",
  "2026-12-25",
];

export function isDomingoOFeriadoLegacy(date: Date): boolean {
  const dateStr = date.toISOString().slice(0, 10);
  const dayOfWeek = date.getUTCDay();
  return dayOfWeek === 0 || FERIADOS_CL_2026.includes(dateStr) || isChileHoliday(dateStr);
}

export async function queryAsistenciaDiariaLegacy(
  tenantId: string,
  from: string,
  to: string,
  installationId?: string | null,
) {
  const { start, end } = utcRangeFromYmd(from, to);
  const where: Record<string, unknown> = {
    tenantId,
    date: { gte: start, lte: end },
    deletedAt: null,
  };
  if (installationId) where.installationId = installationId;

  return prisma.opsAsistenciaDiaria.findMany({
    where,
    select: {
      id: true,
      date: true,
      attendanceStatus: true,
      checkInAt: true,
      checkOutAt: true,
      workedMinutes: true,
      plannedMinutes: true,
      overtimeMinutes: true,
      marcacionEntradaId: true,
      marcacionSalidaId: true,
      plannedGuardia: {
        select: {
          id: true,
          persona: { select: { firstName: true, lastName: true, rut: true } },
        },
      },
      installation: { select: { id: true, name: true } },
      puesto: { select: { name: true, shiftStart: true, shiftEnd: true } },
      marcacionEntrada: {
        select: {
          timestamp: true,
          metodoId: true,
          gpsStatus: true,
          isModified: true,
          atrasoMinutos: true,
          opposedAt: true,
          consolidatedAt: true,
        },
      },
      marcacionSalida: {
        select: {
          timestamp: true,
          metodoId: true,
          gpsStatus: true,
          isModified: true,
          opposedAt: true,
          consolidatedAt: true,
        },
      },
    },
    orderBy: [{ date: "asc" }, { plannedGuardia: { persona: { lastName: "asc" } } }],
  });
}

export async function queryJornadaDiariaLegacy(
  tenantId: string,
  from: string,
  to: string,
  installationId?: string | null,
) {
  const { start, end } = utcRangeFromYmd(from, to);
  const where: Record<string, unknown> = {
    tenantId,
    date: { gte: start, lte: end },
    deletedAt: null,
    attendanceStatus: "asistio",
  };
  if (installationId) where.installationId = installationId;

  return prisma.opsAsistenciaDiaria.findMany({
    where,
    select: {
      id: true,
      date: true,
      workedMinutes: true,
      plannedMinutes: true,
      overtimeMinutes: true,
      checkInAt: true,
      checkOutAt: true,
      plannedGuardia: {
        select: {
          id: true,
          persona: { select: { firstName: true, lastName: true, rut: true } },
        },
      },
      installation: { select: { id: true, name: true } },
      puesto: { select: { name: true, shiftStart: true, shiftEnd: true } },
      marcacionEntrada: { select: { timestamp: true, atrasoMinutos: true, isModified: true } },
      marcacionSalida: { select: { timestamp: true, isModified: true } },
    },
    orderBy: [{ date: "asc" }, { plannedGuardia: { persona: { lastName: "asc" } } }],
  });
}

export async function queryDomingosFestivosLegacy(
  tenantId: string,
  from: string,
  to: string,
  installationId?: string | null,
) {
  const records = await queryJornadaDiariaLegacy(tenantId, from, to, installationId);
  const filtered = records.filter((r) => {
    const dateStr = r.date.toISOString().slice(0, 10);
    const dayOfWeek = r.date.getUTCDay();
    return dayOfWeek === 0 || FERIADOS_CL_2026.includes(dateStr);
  });

  return filtered.map((r) => {
    const dateStr = r.date.toISOString().slice(0, 10);
    const esDomingo = r.date.getUTCDay() === 0;
    const esFeriado = FERIADOS_CL_2026.includes(dateStr);
    return {
      date: dateStr,
      esDomingo,
      esFeriado,
      workedMinutes: r.workedMinutes,
      checkInAt: r.checkInAt?.toISOString() ?? null,
      checkOutAt: r.checkOutAt?.toISOString() ?? null,
      plannedGuardia: r.plannedGuardia,
      installation: r.installation,
      puesto: r.puesto,
      marcacionEntrada: r.marcacionEntrada
        ? { timestamp: r.marcacionEntrada.timestamp.toISOString() }
        : null,
      marcacionSalida: r.marcacionSalida
        ? { timestamp: r.marcacionSalida.timestamp.toISOString() }
        : null,
    };
  });
}

export async function queryModificacionesTurnosLegacy(
  tenantId: string,
  from: string,
  to: string,
  installationId?: string | null,
) {
  const { start, end } = utcRangeFromYmd(from, to);
  const where: Record<string, unknown> = {
    tenantId,
    isModified: true,
    modifiedAt: { gte: start, lte: end },
    deletedAt: null,
  };
  if (installationId) where.installationId = installationId;

  const marcaciones = await prisma.opsMarcacion.findMany({
    where,
    select: {
      id: true,
      tipo: true,
      timestamp: true,
      modifiedAt: true,
      modifiedBy: true,
      modificationReason: true,
      isModified: true,
      opposedAt: true,
      opposedBy: true,
      oppositionReason: true,
      consolidatedAt: true,
      guardia: {
        select: { persona: { select: { firstName: true, lastName: true, rut: true } } },
      },
      installation: { select: { name: true } },
    },
    orderBy: { modifiedAt: "desc" },
  });

  const marcacionIds = marcaciones.map((m) => m.id);
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      entity: "ops_marcacion",
      entityId: { in: marcacionIds },
      action: "ops.marcacion.modified",
    },
    select: { entityId: true, details: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const auditLatest = new Map<string, (typeof auditLogs)[0]>();
  for (const a of auditLogs) {
    if (a.entityId && !auditLatest.has(a.entityId)) auditLatest.set(a.entityId, a);
  }

  return marcaciones.map((m) => {
    const audit = auditLatest.get(m.id);
    const details = audit?.details as Record<string, unknown> | null;
    const changes = details?.changes as Record<string, unknown> | undefined;
    const ts = changes?.timestamp as Record<string, unknown> | undefined;
    const timestampOriginal = (ts?.from as string) ?? null;

    const estado: "pendiente" | "opuesta" | "consolidada" = m.consolidatedAt
      ? "consolidada"
      : m.opposedAt
        ? "opuesta"
        : "pendiente";

    return {
      id: m.id,
      tipo: m.tipo,
      timestamp: m.timestamp.toISOString(),
      timestampOriginal,
      modifiedAt: m.modifiedAt?.toISOString() ?? null,
      modifiedBy: m.modifiedBy,
      modificationReason: m.modificationReason,
      estado,
      opposedAt: m.opposedAt?.toISOString() ?? null,
      opposedBy: m.opposedBy,
      oppositionReason: m.oppositionReason,
      consolidatedAt: m.consolidatedAt?.toISOString() ?? null,
      guardiaRut: m.guardia.persona.rut ?? "",
      guardiaLastName: m.guardia.persona.lastName,
      guardiaFirstName: m.guardia.persona.firstName,
      installationName: m.installation.name,
    };
  });
}

export async function queryAsistenciaExportRows(
  tenantId: string,
  from: string,
  to: string,
  installationId?: string | null,
) {
  const { start, end } = utcRangeFromYmd(from, to);
  const where: Record<string, unknown> = {
    tenantId,
    date: { gte: start, lte: end },
    deletedAt: null,
  };
  if (installationId) where.installationId = installationId;

  return prisma.opsAsistenciaDiaria.findMany({
    where,
    select: {
      date: true,
      attendanceStatus: true,
      checkInAt: true,
      checkOutAt: true,
      workedMinutes: true,
      overtimeMinutes: true,
      plannedGuardia: { select: { persona: { select: { firstName: true, lastName: true, rut: true } } } },
      installation: { select: { name: true } },
      puesto: { select: { name: true } },
      marcacionEntrada: { select: { timestamp: true, isModified: true, atrasoMinutos: true } },
      marcacionSalida: { select: { timestamp: true, isModified: true } },
    },
    orderBy: [{ date: "asc" }],
  });
}
