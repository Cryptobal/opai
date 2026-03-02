import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/api-auth";
import type { OpsCapability } from "@/lib/ops-rbac";
import { resolvePermissions } from "@/lib/permissions-server";
import { hasModuleAccess, hasCapability, type CapabilityKey } from "@/lib/permissions";

export type WeekdayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

const WEEKDAY_BY_JS_DAY: WeekdayKey[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export function forbiddenOps() {
  return NextResponse.json(
    { success: false, error: "Sin permisos para módulo Ops" },
    { status: 403 }
  );
}

export async function ensureOpsAccess(ctx: AuthContext): Promise<NextResponse | null> {
  const perms = await resolvePermissions({
    role: ctx.userRole,
    roleTemplateId: ctx.roleTemplateId,
  });
  if (!hasModuleAccess(perms, "ops")) {
    return forbiddenOps();
  }
  return null;
}

export function forbiddenOpsCapability(capability: OpsCapability) {
  return NextResponse.json(
    { success: false, error: `Sin permisos Ops para: ${capability}` },
    { status: 403 }
  );
}

/** Mapeo de OpsCapability legacy → CapabilityKey nuevo */
const OPS_CAP_MAP: Partial<Record<OpsCapability, CapabilityKey>> = {
  te_execution: "te_approve",
  rondas_configure: "rondas_configure",
  rondas_resolve: "rondas_resolve_alerts",
};

export async function ensureOpsCapability(
  ctx: AuthContext,
  capability: OpsCapability
): Promise<NextResponse | null> {
  const forbidden = await ensureOpsAccess(ctx);
  if (forbidden) return forbidden;

  const newCap = OPS_CAP_MAP[capability];
  if (newCap) {
    const perms = await resolvePermissions({
      role: ctx.userRole,
      roleTemplateId: ctx.roleTemplateId,
    });
    if (!hasCapability(perms, newCap)) {
      return forbiddenOpsCapability(capability);
    }
  }
  return null;
}

export function parseDateOnly(value: string): Date {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error("Formato de fecha inválido. Usa YYYY-MM-DD.");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getWeekdayKey(date: Date): WeekdayKey {
  return WEEKDAY_BY_JS_DAY[date.getUTCDay()];
}

/* Map of Spanish weekday names to English keys */
const SPANISH_TO_ENGLISH: Record<string, WeekdayKey> = {
  lunes: "monday",
  martes: "tuesday",
  miercoles: "wednesday",
  miércoles: "wednesday",
  jueves: "thursday",
  viernes: "friday",
  sabado: "saturday",
  sábado: "saturday",
  domingo: "sunday",
};

/**
 * Checks if a weekday (English key) exists in an array that may contain
 * either English keys or Spanish names.
 */
export function weekdayMatches(weekdays: string[], weekdayKey: WeekdayKey): boolean {
  if (weekdays.includes(weekdayKey)) return true;
  // Also check if the array uses Spanish names
  return weekdays.some((w) => SPANISH_TO_ENGLISH[w.toLowerCase()] === weekdayKey);
}

export function getMonthDateRange(year: number, month: number): { start: Date; end: Date } {
  // month = 1-12
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 0, 0, 0, 0));
  return { start, end };
}

export function listDatesBetween(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    days.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export function getWeekBounds(referenceDate: Date): { weekStart: Date; weekEnd: Date } {
  const day = referenceDate.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const weekStart = new Date(referenceDate);
  weekStart.setUTCDate(referenceDate.getUTCDate() + diffToMonday);

  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);

  return {
    weekStart: parseDateOnly(toISODate(weekStart)),
    weekEnd: parseDateOnly(toISODate(weekEnd)),
  };
}

export function buildTeBatchCode(weekStart: Date): string {
  const year = weekStart.getUTCFullYear();
  const month = String(weekStart.getUTCMonth() + 1).padStart(2, "0");
  const day = String(weekStart.getUTCDate()).padStart(2, "0");
  return `TE-${year}${month}${day}`;
}

export function decimalToNumber(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value === "object" && "toString" in value) {
    const parsed = Number(String(value));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/* ------------------------------------------------------------------ */
/*  Execution status (shared across pauta routes & exports)            */
/* ------------------------------------------------------------------ */

export type ExecutionState = "asistio" | "te" | "sin_cobertura" | "ppc";

export interface ExecutionCellResult {
  state: ExecutionState;
  teStatus?: string;
}

export interface AsistenciaRowInput {
  puestoId: string;
  slotNumber: number;
  date: Date;
  attendanceStatus: string;
  plannedGuardiaId?: string | null;
  actualGuardiaId?: string | null;
  replacementGuardiaId?: string | null;
  turnosExtra?: { id: string; status: string }[];
}

/**
 * Normaliza una fecha a YYYY-MM-DD en UTC para usar como clave de celda.
 */
export function toDateKeyUTC(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Construye un mapa de estado de ejecución por celda (puesto|slot|fecha).
 * Lógica canónica: ASI = planificado asistió, TE = reemplazo/turno extra,
 * SC = sin cobertura, PPC = slot sin planificación.
 */
export function buildExecutionMap(
  rows: AsistenciaRowInput[]
): Record<string, ExecutionCellResult> {
  const result: Record<string, ExecutionCellResult> = {};

  for (const row of rows) {
    const key = `${row.puestoId}|${row.slotNumber}|${toDateKeyUTC(row.date)}`;

    if (row.attendanceStatus === "reemplazo" && row.replacementGuardiaId) {
      result[key] = { state: "te", teStatus: row.turnosExtra?.[0]?.status };
    } else if (row.attendanceStatus === "asistio") {
      const tieneReemplazo = Boolean(row.replacementGuardiaId);
      const esOtroGuardia =
        row.plannedGuardiaId != null &&
        row.actualGuardiaId != null &&
        row.actualGuardiaId !== row.plannedGuardiaId;
      const esPlanificadoQueAsistio =
        !tieneReemplazo &&
        !esOtroGuardia &&
        (row.actualGuardiaId === row.plannedGuardiaId ||
          (row.plannedGuardiaId == null && row.actualGuardiaId != null));
      result[key] = esPlanificadoQueAsistio
        ? { state: "asistio" }
        : { state: "te", teStatus: row.turnosExtra?.[0]?.status };
    } else if (row.attendanceStatus === "no_asistio") {
      result[key] = { state: "sin_cobertura" };
    } else if (row.attendanceStatus === "ppc") {
      result[key] = { state: "ppc" };
    }
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  Serie pattern generation                                           */
/* ------------------------------------------------------------------ */

/**
 * Generates shift codes for a range of dates based on a rotation pattern.
 * Returns "T" for work days, "-" for rest days.
 * Pure function: no side-effects, reusable across pintar-serie and auto-projection.
 */
export function generateSerieForMonth(
  startDate: Date,
  startPosition: number,
  patternWork: number,
  patternOff: number,
  monthDates: Date[]
): { date: Date; shiftCode: string }[] {
  const cycleLength = patternWork + patternOff;
  const results: { date: Date; shiftCode: string }[] = [];

  for (const d of monthDates) {
    const diffMs = d.getTime() - startDate.getTime();
    const daysDiff = Math.round(diffMs / (1000 * 60 * 60 * 24));

    const positionInCycle =
      ((daysDiff + (startPosition - 1)) % cycleLength + cycleLength) % cycleLength;

    const isWorkDay = positionInCycle < patternWork;

    results.push({
      date: new Date(d),
      shiftCode: isWorkDay ? "T" : "-",
    });
  }

  return results;
}

/* ------------------------------------------------------------------ */
/*  Audit log                                                          */
/* ------------------------------------------------------------------ */

export async function createOpsAuditLog(
  ctx: AuthContext,
  action: string,
  entity: string,
  entityId?: string,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        userEmail: ctx.userEmail,
        action,
        entity,
        entityId: entityId ?? null,
        details: details as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (error) {
    console.error("[OPS] Error writing audit log:", error);
  }
}
