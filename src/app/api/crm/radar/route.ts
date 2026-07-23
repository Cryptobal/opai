import { NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { getRadarVerticalSettings } from "@/lib/crm/radar-settings";
import {
  SHARED_RADAR_KINDS,
  radarItemVisible,
  verticalForItem,
  type RadarCapability,
  type RadarVertical,
} from "@/modules/crm/email/radar-types";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const RADAR_CAPS: RadarCapability[] = [
  "radar_comercial",
  "radar_operaciones",
  "radar_rrhh",
  "radar_finanzas",
];

/**
 * GET /api/crm/radar — feed del hub: RadarItems PENDING visibles para el
 * solicitante. Filtro de VISIBILIDAD por capability en SERVIDOR (no sólo UI):
 *  - items comerciales requieren radar_comercial;
 *  - items de otras verticales (bandeja compartida) requieren la capability de
 *    su vertical, sin importar de qué casilla nacieron.
 */
export async function GET() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const perms = await resolveApiPerms(ctx);
  const caps = new Set<RadarCapability>(RADAR_CAPS.filter((c) => hasCapability(perms, c)));
  if (caps.size === 0) return NextResponse.json({ enabled: false, total: 0, items: [] });

  const settings = await getRadarVerticalSettings(ctx.tenantId);
  const enabled = Object.values(settings).some(Boolean);
  if (!enabled) return NextResponse.json({ enabled: false, total: 0, items: [] });

  // Trae items propios (comercial personal) + todos los compartidos por vertical;
  // luego filtra en memoria por capability. Volúmenes bajos (feed del hub).
  const where = {
    tenantId: ctx.tenantId,
    status: "PENDING",
    OR: [{ userId: ctx.userId }, { kind: { in: SHARED_RADAR_KINDS } }],
  };
  const [rows, accounts] = await Promise.all([
    prisma.crmRadarItem.findMany({
      where,
      orderBy: [{ dueAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
      take: 200,
      select: {
        id: true, kind: true, status: true, title: true, summary: true,
        threadId: true, dealId: true, accountId: true, dueAt: true,
        payload: true, createdAt: true,
      },
    }),
    prisma.crmEmailAccount.findMany({
      where: { tenantId: ctx.tenantId, userId: ctx.userId, provider: "gmail", status: "active" },
      select: { syncState: true },
    }),
  ]);

  const visible = rows
    .map((it) => {
      const pv = (it.payload && typeof it.payload === "object" && !Array.isArray(it.payload)
        ? (it.payload as { vertical?: string }).vertical
        : null) as RadarVertical | null;
      return { ...it, vertical: verticalForItem(it.kind, pv) };
    })
    .filter((it) => radarItemVisible(it.kind, it.vertical, caps));

  const items = visible.slice(0, 50);

  let lastRunAt: string | null = null;
  let lastClassified = 0;
  for (const a of accounts) {
    const s =
      a.syncState && typeof a.syncState === "object" && !Array.isArray(a.syncState)
        ? (a.syncState as { lastRadarRunAt?: string | null; lastRadarClassified?: number })
        : {};
    if (s.lastRadarRunAt && (!lastRunAt || s.lastRadarRunAt > lastRunAt)) {
      lastRunAt = s.lastRadarRunAt;
      lastClassified = Number(s.lastRadarClassified) || 0;
    }
  }

  return NextResponse.json({
    enabled: true,
    total: visible.length,
    items,
    meta: { lastRunAt, lastClassified },
  });
}
