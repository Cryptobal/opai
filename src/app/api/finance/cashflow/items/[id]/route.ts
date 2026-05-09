import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { updateItem, deleteItem, getItem } from "@/modules/finance/cashflow/item.service";
import { updateCashflowItemSchema } from "@/lib/validations/cashflow";

export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (!auth) return unauthorized();
    const perms = await resolveApiPerms(auth);
    if (!hasCapability(perms, "cashflow_view")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id } = await ctx.params;
    const item = await getItem(auth.tenantId, id);
    if (!item) {
      return NextResponse.json({ success: false, error: "Item no encontrado" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    console.error("[Finance/Cashflow] GET item:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (!auth) return unauthorized();
    const perms = await resolveApiPerms(auth);
    if (!hasCapability(perms, "cashflow_manage")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id } = await ctx.params;
    const parsed = await parseBody(request, updateCashflowItemSchema);
    if (parsed.error) return parsed.error;
    const updated = await updateItem(auth.tenantId, id, parsed.data);
    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno";
    console.error("[Finance/Cashflow] PUT item:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (!auth) return unauthorized();
    const perms = await resolveApiPerms(auth);
    if (!hasCapability(perms, "cashflow_manage")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id } = await ctx.params;
    await deleteItem(auth.tenantId, id);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno";
    console.error("[Finance/Cashflow] DELETE item:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
