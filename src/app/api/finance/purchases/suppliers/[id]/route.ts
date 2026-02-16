import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";
import { updateSupplierSchema } from "@/lib/validations/finance";
import {
  getSupplier,
  updateSupplier,
} from "@/modules/finance/payables/supplier.service";

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

    const supplier = await getSupplier(ctx.tenantId, id);

    if (!supplier) {
      return NextResponse.json(
        { success: false, error: "Proveedor no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: supplier });
  } catch (error) {
    console.error("[Finance/Purchases] Error getting supplier:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener proveedor" },
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

    const parsed = await parseBody(request, updateSupplierSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const supplier = await updateSupplier(ctx.tenantId, id, body);

    return NextResponse.json({ success: true, data: supplier });
  } catch (error) {
    console.error("[Finance/Purchases] Error updating supplier:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar proveedor" },
      { status: 500 }
    );
  }
}
