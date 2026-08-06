/**
 * API Route: /api/cron/dte-overdue
 *
 * Marca UNPAID → OVERDUE las facturas emitidas cuyo vencimiento ya pasó
 * (corte de día en America/Santiago).
 *
 * Protegido con CRON_SECRET. Programado en vercel.json (10:00 UTC ≈ 6-7 AM CL),
 * antes de finance-dte-status (11:00) y cobro-reminders (12:00) para que la
 * cobranza del día lea estados frescos.
 */

import { NextResponse, type NextRequest } from "next/server";
import { markOverdueDtes } from "@/modules/finance/billing/dte-overdue.service";

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

    const result = await markOverdueDtes();
    console.log(
      `[dte-overdue] ${result.todayYmd}: ${result.updated} DTE(s) → OVERDUE`,
    );
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[dte-overdue] error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error" },
      { status: 500 },
    );
  }
}
