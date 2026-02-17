import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";
import { updateReceivedDteSchema } from "@/lib/validations/finance";
import {
  getReceivedDte,
  updateReceivedDte,
} from "@/modules/finance/billing/dte-received.service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "finance")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 }
      );
    }

    const { id } = await params;

    const dte = await getReceivedDte(ctx.tenantId, id);

    if (!dte) {
      return NextResponse.json(
        { success: false, error: "DTE recibido no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: dte });
  } catch (error) {
    console.error("[Finance/Billing/Received] Error getting received DTE:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener DTE recibido" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "rendicion_configure")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 }
      );
    }

    const { id } = await params;

    const parsed = await parseBody(request, updateReceivedDteSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const result = await updateReceivedDte(ctx.tenantId, id, body);

    if (!result) {
      return NextResponse.json(
        { success: false, error: "DTE recibido no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[Finance/Billing/Received] Error updating received DTE:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar DTE recibido" },
      { status: 500 }
    );
  }
}
