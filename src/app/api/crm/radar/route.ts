import { NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { isRadarComercialEnabled } from "@/lib/crm/radar-settings";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/radar — feed del hub: RadarItems PENDING del usuario (tenant-
 * scoped), ordenados por (dueAt asc nulls last, createdAt desc). Devuelve el
 * total pendiente + hasta 5 items. Si el radar está apagado → enabled=false.
 */
export async function GET() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const enabled = await isRadarComercialEnabled(ctx.tenantId);
  if (!enabled) return NextResponse.json({ enabled: false, total: 0, items: [] });

  const where = { tenantId: ctx.tenantId, userId: ctx.userId, status: "PENDING" };
  const [total, items, accounts] = await Promise.all([
    prisma.crmRadarItem.count({ where }),
    prisma.crmRadarItem.findMany({
      where,
      // nulls first: leads/señales (sin dueAt) arriba — no se entierran bajo
      // compromisos con fecha; luego los fechados por vencimiento ascendente.
      orderBy: [{ dueAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
      take: 5,
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

  // meta: la corrida más reciente entre las casillas del usuario.
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
    total,
    items,
    meta: { lastRunAt, lastClassified },
  });
}
