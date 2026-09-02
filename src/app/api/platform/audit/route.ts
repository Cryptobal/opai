import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAuth } from "@/lib/platform-api-auth";
import { prisma } from "@/lib/prisma";
import {
  auditFamily,
  AUDIT_FAMILY_LABEL,
  AUDIT_FAMILY_VARIANT,
} from "@/lib/platform/audit-family";
import {
  buildAuditWhere,
  isAuditFamily,
  matchesAuditFamilyFilter,
  parseAuditRange,
  presetAuditRange,
} from "@/lib/platform/audit-query";

const TAKE = 40;

export async function GET(request: NextRequest) {
  const auth = await requirePlatformAuth({ minRole: "support" });
  if (!auth.ok) return auth.response;

  const sp = request.nextUrl.searchParams;
  const q = sp.get("q");
  const actor = sp.get("actor");
  const familyRaw = sp.get("family");
  const family = isAuditFamily(familyRaw) ? familyRaw : null;
  const tenantId = sp.get("tenantId");
  const cursorRaw = sp.get("cursor");
  const preset = sp.get("range");

  const now = new Date();
  const presetRange = presetAuditRange(preset, now);
  const parsed = parseAuditRange(sp.get("from"), sp.get("to"));
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const from = parsed.gte ?? presetRange?.from;
  const to = parsed.lte ?? presetRange?.to;
  const cursor = cursorRaw ? new Date(cursorRaw) : undefined;
  if (cursor && Number.isNaN(cursor.getTime())) {
    return NextResponse.json({ error: "cursor inválido" }, { status: 400 });
  }

  const where = buildAuditWhere({
    q,
    actor,
    family,
    tenantId,
    from,
    to,
    cursor: cursor && !Number.isNaN(cursor.getTime()) ? cursor : undefined,
  });

  const fetchTake = family && !where.action ? TAKE * 4 : TAKE + 1;

  const [rows, admins, tenants] = await Promise.all([
    prisma.platformAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: fetchTake,
    }),
    prisma.platformAdmin.findMany({
      select: { email: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.tenant.findMany({
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const filtered = rows.filter((r) => matchesAuditFamilyFilter(r.action, family));
  const page = filtered.slice(0, TAKE);
  const nextCursor = filtered.length > TAKE ? page[page.length - 1]?.createdAt.toISOString() : null;

  return NextResponse.json({
    events: page.map((e) => {
      const fam = auditFamily(e.action);
      return {
        id: e.id,
        createdAt: e.createdAt.toISOString(),
        action: e.action,
        family: fam,
        familyLabel: AUDIT_FAMILY_LABEL[fam],
        familyVariant: AUDIT_FAMILY_VARIANT[fam],
        actorType: e.actorType,
        actorEmail: e.actorEmail,
        tenantId: e.tenantId,
        targetType: e.targetType,
        targetId: e.targetId,
        before: e.before,
        after: e.after,
        ip: e.ip,
      };
    }),
    nextCursor,
    actors: [
      { type: "system" as const, email: "system", name: "Sistema" },
      ...admins.map((a) => ({ type: "platform_admin" as const, email: a.email, name: a.name })),
    ],
    tenants,
  });
}
