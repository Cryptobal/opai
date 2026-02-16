import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";
import { createSupplierSchema } from "@/lib/validations/finance";
import {
  listSuppliers,
  createSupplier,
} from "@/modules/finance/payables/supplier.service";

export async function GET(request: NextRequest) {
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

    const url = new URL(request.url);
    const search = url.searchParams.get("search") || undefined;
    const isActive =
      url.searchParams.get("isActive") === "true"
        ? true
        : url.searchParams.get("isActive") === "false"
          ? false
          : undefined;
    const page = parseInt(url.searchParams.get("page") || "1");
    const pageSize = parseInt(url.searchParams.get("pageSize") || "20");

    const result = await listSuppliers(ctx.tenantId, {
      search,
      isActive,
      page,
      pageSize,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[Finance/Purchases] Error listing suppliers:", error);
    return NextResponse.json(
      { success: false, error: "Error al listar proveedores" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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

    const parsed = await parseBody(request, createSupplierSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const supplier = await createSupplier(ctx.tenantId, body);

    return NextResponse.json(
      { success: true, data: supplier },
      { status: 201 }
    );
  } catch (error) {
    console.error("[Finance/Purchases] Error creating supplier:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear proveedor" },
      { status: 500 }
    );
  }
}
