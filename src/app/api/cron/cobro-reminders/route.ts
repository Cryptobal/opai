/**
 * API Route: /api/cron/cobro-reminders
 *
 * Envía hasta 3 recordatorios (+3/+7/+12 días hábiles) a clientes con una
 * proforma / estado de pago pendiente de confirmar, mientras no haya
 * aprobación, observación, OC ingresada, emisión ni token expirado.
 *
 * Protegido con CRON_SECRET. Programado en vercel.json (12:00 UTC ≈ 8-9 AM CL).
 */

import { NextResponse, type NextRequest } from "next/server";
import { runCobroReminders } from "@/modules/finance/billing/cobro-reminders.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret && process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { success: false, error: "CRON_SECRET not configured" },
        { status: 500 },
      );
    }
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const result = await runCobroReminders(new Date());
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[cobro-reminders] error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error" },
      { status: 500 },
    );
  }
}
