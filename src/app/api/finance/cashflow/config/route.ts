import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import {
  getOrCreateCashflowConfig,
  updateCashflowConfig,
} from "@/modules/finance/cashflow/config.service";
import { updateCashflowConfigSchema } from "@/lib/validations/cashflow";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "cashflow_view")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const config = await getOrCreateCashflowConfig(ctx.tenantId);
    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    console.error("[Finance/Cashflow] GET config error:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "cashflow_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const parsed = await parseBody(request, updateCashflowConfigSchema);
    if (parsed.error) return parsed.error;
    const updated = await updateCashflowConfig(ctx.tenantId, parsed.data);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[Finance/Cashflow] PUT config error:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
