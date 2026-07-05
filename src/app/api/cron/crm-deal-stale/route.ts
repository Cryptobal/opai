/**
 * Cron (Fase 5): barrido diario de negocios estancados. Corre ~08:00 Chile y,
 * por cada tenant activo, postea al canal comercial las tarjetas de negocios
 * abiertos sin movimiento (sweepStaleDeals respeta posposiciones y no re-spamea).
 * Auth Bearer CRON_SECRET + ventana Chile, clonado de comercial-digest.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sweepStaleDeals } from "@/lib/integrations/slack/comercial/deal-stale";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret && process.env.NODE_ENV === "production") {
    return NextResponse.json({ success: false, error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  // Solo en la ventana ~08:00 Chile (tolerante a DST): 7–9h locales.
  const chileHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Santiago", hour: "numeric", hour12: false }).format(new Date()));
  if (chileHour < 7 || chileHour > 9) {
    return NextResponse.json({ success: true, skipped: `outside window (Chile ${chileHour}h)` });
  }

  try {
    const tenants = await prisma.tenant.findMany({ where: { active: true }, select: { id: true } });
    let nudged = 0;
    for (const t of tenants) {
      try {
        const r = await sweepStaleDeals(t.id);
        nudged += r.nudged;
      } catch (e) {
        console.error(`[crm-deal-stale] tenant ${t.id} failed:`, e);
      }
    }
    return NextResponse.json({ success: true, tenants: tenants.length, nudged });
  } catch (error) {
    console.error("[cron] crm-deal-stale failed:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "error" }, { status: 500 });
  }
}
