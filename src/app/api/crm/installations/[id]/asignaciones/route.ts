import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { getPermissionsFromAuth } from "@/lib/permissions-server";
import { canView, canEdit } from "@/lib/permissions";
import {
  executeAsignar,
  executeDesasignar,
  executeCheck,
  listAsignaciones,
} from "@/lib/ops/asignaciones-logic";

/**
 * GET /api/crm/installations/[id]/asignaciones
 * Lists guard assignments for an installation (CRM context).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const perms = await getPermissionsFromAuth(ctx);
    if (!canView(perms, "crm", "dotacion")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para ver dotación" },
        { status: 403 }
      );
    }

    const { id: installationId } = await params;
    const activeOnly = request.nextUrl.searchParams.get("activeOnly") !== "false";

    const asignaciones = await listAsignaciones(ctx.tenantId, {
      installationId,
      activeOnly,
    });

    return NextResponse.json({ success: true, data: asignaciones });
  } catch (error) {
    console.error("[CRM] Error listing asignaciones:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron obtener las asignaciones" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/crm/installations/[id]/asignaciones
 * Actions: "asignar" (default), "desasignar", "check"
 * Requires crm.dotacion edit permission.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const perms = await getPermissionsFromAuth(ctx);
    const action = request.headers.get("x-action") || undefined;

    // check only needs view permission
    if (action === "check") {
      if (!canView(perms, "crm", "dotacion")) {
        return NextResponse.json(
          { success: false, error: "Sin permisos para ver dotación" },
          { status: 403 }
        );
      }
    } else {
      if (!canEdit(perms, "crm", "dotacion")) {
        return NextResponse.json(
          { success: false, error: "Sin permisos para gestionar dotación" },
          { status: 403 }
        );
      }
    }

    await params; // ensure params are resolved
    const rawBody = await request.json();
    const bodyAction = rawBody?.action as string;

    if (bodyAction === "desasignar") {
      const result = await executeDesasignar(ctx, rawBody);
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error }, { status: result.status });
      }
      return NextResponse.json({ success: true, data: result.data });
    }

    if (bodyAction === "check") {
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
    console.error("[CRM] Error in asignaciones:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo procesar la solicitud" },
      { status: 500 }
    );
  }
}
