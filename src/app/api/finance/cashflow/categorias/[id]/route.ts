import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { updateCategory, deleteCategory } from "@/modules/finance/cashflow/category.service";
import { updateCashflowCategorySchema } from "@/lib/validations/cashflow";

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (!auth) return unauthorized();
    const perms = await resolveApiPerms(auth);
    if (!hasCapability(perms, "cashflow_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id } = await ctx.params;
    const parsed = await parseBody(request, updateCashflowCategorySchema);
    if (parsed.error) return parsed.error;
    const updated = await updateCategory(auth.tenantId, id, parsed.data);
    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno";
    console.error("[Finance/Cashflow] PUT categoria:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (!auth) return unauthorized();
    const perms = await resolveApiPerms(auth);
    if (!hasCapability(perms, "cashflow_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id } = await ctx.params;
    await deleteCategory(auth.tenantId, id);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno";
    console.error("[Finance/Cashflow] DELETE categoria:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
