import { NextRequest, NextResponse } from "next/server";
import { processAllCompromisos } from "@/modules/crm/radar/radar-compromisos.service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/radar-compromisos (diario 12:00 UTC) — compromisos con fecha:
 * los del cliente vencidos sin respuesta generan follow-up + Slack DM; los
 * nuestros se recuerdan el mismo día. Respeta el kill-switch por tenant.
 */
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const processed = await processAllCompromisos(Date.now() + 50_000);
  return NextResponse.json({ ok: true, processed });
}
