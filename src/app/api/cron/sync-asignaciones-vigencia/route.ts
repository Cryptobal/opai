/**
 * GET /api/cron/sync-asignaciones-vigencia
 *
 * Aplica en la fecha efectiva los efectos diferidos de traslados y finiquitos.
 * Idempotente. Auth: Authorization: Bearer ${CRON_SECRET}
 *
 * No tiene entrada propia en vercel.json (el 67.º cron rechaza el deploy).
 * Lo dispara `/api/cron/consolidar-marcaciones` a las 04:00 UTC.
 */

import { NextResponse, type NextRequest } from "next/server";
import { runSyncAsignacionesVigencia } from "@/lib/ops/sync-asignaciones-vigencia";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization");
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const data = await runSyncAsignacionesVigencia();
  return NextResponse.json({ success: true, ...data });
}
