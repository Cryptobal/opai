import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { loadPuestoFormCatalogs, parseIncludeIds } from "@/lib/ops/puesto-catalog";

export const dynamic = "force-dynamic";

/**
 * GET /api/ops/puestos/catalogos
 * Catálogos maestros para el formulario de puesto operativo.
 * Autorizado con ensureOpsAccess (no CPQ/Payroll): roles ops pueden
 * seleccionar cargo, tipo de puesto, rol y bonos tras el lock financiero.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const includeIds = parseIncludeIds(request.nextUrl.searchParams.get("includeIds"));
    const data = await loadPuestoFormCatalogs(ctx.tenantId, includeIds);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[OPS] Error listing puesto catalogs:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron obtener los catálogos del puesto" },
      { status: 500 },
    );
  }
}
