import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import {
  runTemplate,
  type RunScheduleMode,
} from "@/modules/finance/billing/dte-recurring.service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (
      !hasFacturacionCapability(perms, "facturacion_issue") &&
      !hasFacturacionCapability(perms, "facturacion_create_draft")
    ) {
      return NextResponse.json({ success: false, error: "Sin permiso" }, { status: 403 });
    }
    const { id } = await params;

    // Body opcional (back-compat): { scheduleMode: "advance" | "keep" }.
    // DEFAULT "keep": un run manual es SIEMPRE una corrida extra que NO toca
    // el calendario (no avanza nextRunAt). Así el cron genera el borrador en
    // la fecha programada igual, sin que un run manual anticipado "consuma"
    // la cuota del período. Solo se avanza el calendario si el caller pide
    // explícitamente "advance" (escape hatch / back-compat).
    let scheduleMode: RunScheduleMode = "keep";
    try {
      const body = await request.json();
      if (body?.scheduleMode === "advance") scheduleMode = "advance";
    } catch {
      // Sin body o body inválido → default "keep".
    }

    const run = await runTemplate(ctx.tenantId, id, { scheduleMode });
    return NextResponse.json({ success: true, data: run });
  } catch (error) {
    console.error("[Finance/Recurring] Run-now error:", error);
    const message = error instanceof Error ? error.message : "Error al ejecutar plantilla";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
