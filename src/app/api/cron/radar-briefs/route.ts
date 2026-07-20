import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isRadarComercialEnabled } from "@/lib/crm/radar-settings";
import { processCalendarBriefs } from "@/modules/crm/radar/radar-brief.service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/radar-briefs (cada 10 min) — briefs pre-reunión: por cada
 * casilla de Calendar ACTIVE, eventos en [+25,+45]min con asistentes externos
 * matcheados a CRM → Slack DM + RadarItem kind brief. Limpia briefs pasados.
 */
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Limpieza: briefs de reuniones ya pasadas → DONE (auto-DONE al pasar la hora).
  await prisma.crmRadarItem.updateMany({
    where: { kind: "brief", status: "PENDING", dueAt: { lt: new Date() } },
    data: { status: "DONE" },
  });

  const accounts = await prisma.googleCalendarAccount.findMany({
    where: { status: "ACTIVE" },
    select: { tenantId: true, userId: true, googleEmail: true },
    take: 100,
  });

  const deadline = Date.now() + 50_000;
  const enabledCache = new Map<string, boolean>();
  let briefs = 0;
  for (const acc of accounts) {
    if (Date.now() >= deadline) break;
    let enabled = enabledCache.get(acc.tenantId);
    if (enabled === undefined) {
      enabled = await isRadarComercialEnabled(acc.tenantId);
      enabledCache.set(acc.tenantId, enabled);
    }
    if (!enabled) continue;
    try {
      briefs += await processCalendarBriefs({
        tenantId: acc.tenantId,
        userId: acc.userId,
        ownEmail: acc.googleEmail,
      });
    } catch (err) {
      console.warn("[radar-briefs] cuenta falló", acc.userId, err);
    }
  }

  return NextResponse.json({ ok: true, accounts: accounts.length, briefs });
}
