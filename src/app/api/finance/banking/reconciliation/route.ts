import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";
import { createReconciliationSchema } from "@/lib/validations/finance";
import { listReconciliations, createReconciliation } from "@/modules/finance/banking/reconciliation.service";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "finance")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const bankAccountId = new URL(request.url).searchParams.get("bankAccountId") || undefined;
    const data = await listReconciliations(ctx.tenantId, bankAccountId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Finance/Reconciliation] Error listing:", error);
    return NextResponse.json({ success: false, error: "Error al listar conciliaciones" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "rendicion_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const parsed = await parseBody(request, createReconciliationSchema);
    if (parsed.error) return parsed.error;
    const rec = await createReconciliation(ctx.tenantId, parsed.data);
    return NextResponse.json({ success: true, data: rec }, { status: 201 });
  } catch (error) {
    console.error("[Finance/Reconciliation] Error creating:", error);
    return NextResponse.json({ success: false, error: "Error al crear conciliación" }, { status: 500 });
  }
}
