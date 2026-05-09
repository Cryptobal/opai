import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { listCategories, createCategory } from "@/modules/finance/cashflow/category.service";
import { createCashflowCategorySchema } from "@/lib/validations/cashflow";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "cashflow_view")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const cats = await listCategories(ctx.tenantId);
    return NextResponse.json({ success: true, data: cats });
  } catch (error) {
    console.error("[Finance/Cashflow] GET categorias:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "cashflow_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const parsed = await parseBody(request, createCashflowCategorySchema);
    if (parsed.error) return parsed.error;
    const created = await createCategory(ctx.tenantId, parsed.data);
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno";
    console.error("[Finance/Cashflow] POST categorias:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
