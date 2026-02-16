import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import {
  executeAsignar,
  executeDesasignar,
  executeCheck,
  listAsignaciones,
} from "@/lib/ops/asignaciones-logic";

/**
 * GET /api/ops/asignaciones
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const installationId = request.nextUrl.searchParams.get("installationId") || undefined;
    const puestoId = request.nextUrl.searchParams.get("puestoId") || undefined;
    const guardiaId = request.nextUrl.searchParams.get("guardiaId") || undefined;
    const activeOnly = request.nextUrl.searchParams.get("activeOnly") !== "false";

    const asignaciones = await listAsignaciones(ctx.tenantId, {
      installationId,
      puestoId,
      guardiaId,
      activeOnly,
    });

    return NextResponse.json({ success: true, data: asignaciones });
  } catch (error) {
    console.error("[OPS] Error listing asignaciones:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron obtener las asignaciones" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ops/asignaciones
 * Actions: "asignar" (default), "desasignar", "check"
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const rawBody = await request.json();
    const action = rawBody?.action as string;

    if (action === "desasignar") {
      const result = await executeDesasignar(ctx, rawBody);
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error }, { status: result.status });
      }
      return NextResponse.json({ success: true, data: result.data });
    }

    if (action === "check") {
      const result = await executeCheck(ctx, rawBody);
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error }, { status: result.status });
      }
      return NextResponse.json({ success: true, data: result.data });
    }

    // Default: asignar
    const result = await executeAsignar(ctx, rawBody);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, data: result.data }, { status: 201 });
  } catch (error) {
    console.error("[OPS] Error in asignaciones:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo procesar la solicitud" },
      { status: 500 }
    );
  }
}
