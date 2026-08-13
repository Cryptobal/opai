/**
 * Cron (Fase 15, B6): digest comercial. Corre a diario ~08:00 Chile; postea el
 * resumen semanal los LUNES a todos los tenants con Slack, y a diario solo a los
 * que activaron el Setting crm.digestDaily. Idempotente por (tenant, día).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildAndPostDigest } from "@/lib/integrations/slack/comercial/digest";
import { getSlackDigestConfig } from "@/lib/integrations/slack/digest-config";

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
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "America/Santiago", weekday: "short" }).format(new Date());
  const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
  const isMonday = weekday === "Mon";

  try {
    const tenants = await prisma.tenant.findMany({ where: { active: true }, select: { id: true } });
    let posted = 0;
    for (const t of tenants) {
      try {
        const digests = await getSlackDigestConfig(t.id);
        // Lunes: semanal O diario; resto de días: solo si diario está ON.
        const run = isMonday
          ? digests.comercialWeekly || digests.comercialDaily
          : digests.comercialDaily;
        if (run && (await buildAndPostDigest(t.id, dayKey))) posted++;
      } catch (e) {
        console.error(`[comercial-digest] tenant ${t.id} failed:`, e);
      }
    }
    return NextResponse.json({ success: true, tenants: tenants.length, posted, isMonday });
  } catch (error) {
    console.error("[cron] comercial-digest failed:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "error" }, { status: 500 });
  }
}
