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
