/**
 * Cron: alertas diarias de adjudicados cuya fecha de inicio ya pasó.
 * Corre ~08:00 Chile junto al barrido de negocios estancados.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sweepOverdueStartDates } from "@/lib/integrations/slack/comercial/deal-start-overdue";

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

  const chileHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Santiago", hour: "numeric", hour12: false }).format(new Date()));
  if (chileHour < 7 || chileHour > 9) {
    return NextResponse.json({ success: true, skipped: `outside window (Chile ${chileHour}h)` });
  }

  try {
    const tenants = await prisma.tenant.findMany({ where: { active: true }, select: { id: true } });
    let nudged = 0;
    for (const t of tenants) {
      try {
        const r = await sweepOverdueStartDates(t.id);
        nudged += r.nudged;
      } catch (e) {
        console.error(`[crm-deal-start-overdue] tenant ${t.id} failed:`, e);
      }
    }
    return NextResponse.json({ success: true, tenants: tenants.length, nudged });
  } catch (error) {
    console.error("[cron] crm-deal-start-overdue failed:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "error" }, { status: 500 });
  }
}
