/**
 * GET /api/reportes/dt/jornada-diaria?from=YYYY-MM-DD&to=YYYY-MM-DD&installationId=...
 * Devuelve registros de jornada diaria (horas normales y extraordinarias) para el reporte DT.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { queryJornadaDiariaLegacy } from "@/modules/reportes-dt/legacy";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "reportes_dt")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const from = sp.get("from");
    const to = sp.get("to");
    const installationId = sp.get("installationId");

    if (!from || !to) {
      return NextResponse.json({ success: false, error: "Parámetros from/to requeridos" }, { status: 400 });
    }

    const records = await queryJornadaDiariaLegacy(ctx.tenantId, from, to, installationId);

    return NextResponse.json({ success: true, data: records });
  } catch (error) {
    console.error("[DT] Error jornada-diaria:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
