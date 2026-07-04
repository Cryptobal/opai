/**
 * Cron (Fase 15, B5): sweep de cotizaciones enviadas sin respuesta a las 48h →
 * tarjeta accionable a comercial en Slack. Complementa al motor de follow-up por
 * email (cron followup-emails), no lo reemplaza. Idempotente: el propio sweep
 * deduplica vía CrmHistoryLog (quote_stale_*) y respeta posposiciones.
 */

import { NextRequest, NextResponse } from "next/server";
import { runStaleQuoteSweep } from "@/lib/integrations/slack/comercial/quote-stale";

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

  try {
    const result = await runStaleQuoteSweep();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[cron] crm-quote-followup failed:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "error" }, { status: 500 });
  }
}
