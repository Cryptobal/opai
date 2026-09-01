/**
 * GET/POST /api/cron/respaldo-marcaciones
 * Export mensual a R2 con manifiesto SHA-256 (Art. 14 b / 20 e).
 * También invocado desde biometric-cleanup el día 2 (límite de crons Vercel).
 */

import { NextRequest, NextResponse } from "next/server";
import { runRespaldoMarcaciones } from "@/lib/marcacion-respaldo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!cronSecret && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  const force = new URL(request.url).searchParams.get("force") === "1";
  const { shouldRunMonthlyRespaldo } = await import("@/lib/marcacion-respaldo");
  if (!force && !shouldRunMonthlyRespaldo()) {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: "Solo corre el día 2 de cada mes (America/Santiago) salvo ?force=1",
    });
  }

  const result = await runRespaldoMarcaciones();
  return NextResponse.json({ success: true, ...result, timestamp: new Date().toISOString() });
}
