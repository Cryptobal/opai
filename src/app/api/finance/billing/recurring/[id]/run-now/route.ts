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
    // "keep" = corrida extra que no consume el cupo del período (no avanza
    // nextRunAt); "advance" = reemplaza la corrida programada (default).
    let scheduleMode: RunScheduleMode = "advance";
    try {
      const body = await request.json();
      if (body?.scheduleMode === "keep") scheduleMode = "keep";
    } catch {
      // Sin body o body inválido → default "advance".
    }

    const run = await runTemplate(ctx.tenantId, id, { scheduleMode });
    return NextResponse.json({ success: true, data: run });
  } catch (error) {
    console.error("[Finance/Recurring] Run-now error:", error);
    const message = error instanceof Error ? error.message : "Error al ejecutar plantilla";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
