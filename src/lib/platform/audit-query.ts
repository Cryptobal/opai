import type { Prisma } from "@prisma/client";
import {
  AUDIT_FAMILIES,
  auditFamily,
  auditFamilyPrefixFilter,
  type AuditFamily,
} from "@/lib/platform/audit-family";

export function isAuditFamily(value: string | null | undefined): value is AuditFamily {
  return value != null && (AUDIT_FAMILIES as readonly string[]).includes(value);
}

export function parseAuditRange(
  from: string | null,
  to: string | null,
): { gte?: Date; lte?: Date } | { error: string } {
  const range: { gte?: Date; lte?: Date } = {};
  if (from) {
    const d = new Date(from);
    if (Number.isNaN(d.getTime())) return { error: "from inválido" };
    range.gte = d;
  }
  if (to) {
    const d = new Date(to);
    if (Number.isNaN(d.getTime())) return { error: "to inválido" };
    range.lte = d;
  }
  return range;
}

export function presetAuditRange(
  preset: string | null,
  now: Date,
): { from: Date; to: Date } | null {
  const days =
    preset === "7" ? 7 : preset === "30" ? 30 : preset === "90" ? 90 : null;
  if (days == null) return null;
  return { from: new Date(now.getTime() - days * 24 * 60 * 60 * 1000), to: now };
}

export function buildAuditWhere(params: {
  q?: string | null;
  actor?: string | null;
  family?: string | null;
  tenantId?: string | null;
  from?: Date;
  to?: Date;
  cursor?: Date;
}): Prisma.PlatformAuditLogWhereInput {
  const where: Prisma.PlatformAuditLogWhereInput = {};
  const and: Prisma.PlatformAuditLogWhereInput[] = [];

  const q = params.q?.trim();
  if (q) {
    and.push({
      OR: [
        { action: { contains: q, mode: "insensitive" } },
        { actorEmail: { contains: q, mode: "insensitive" } },
        { targetType: { contains: q, mode: "insensitive" } },
        { targetId: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  if (params.actor === "system") {
    where.actorType = "system";
  } else if (params.actor) {
    where.actorEmail = params.actor;
  }

  if (params.tenantId) where.tenantId = params.tenantId;

  if (params.family && isAuditFamily(params.family)) {
    const prefix = auditFamilyPrefixFilter(params.family);
    if (prefix) {
      where.action = { startsWith: prefix.startsWith };
    } else {
      // Familias sin prefijo único se filtran en memoria; acá no recortamos.
    }
  }

  const createdAt: Prisma.DateTimeFilter = {};
  if (params.from) createdAt.gte = params.from;
  if (params.to) createdAt.lte = params.to;
  if (params.cursor) createdAt.lt = params.cursor;
  if (Object.keys(createdAt).length) where.createdAt = createdAt;

  if (and.length) where.AND = and;
  return where;
}

export function matchesAuditFamilyFilter(action: string, family: AuditFamily | null): boolean {
  if (!family) return true;
  return auditFamily(action) === family;
}
