import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { buildProjection } from "@/modules/finance/cashflow/projection.service";
import { projectionQuerySchema } from "@/lib/validations/cashflow";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "cashflow_view")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const url = new URL(request.url);
    const parsed = projectionQuerySchema.safeParse({
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
      granularity: url.searchParams.get("granularity") ?? undefined,
    });
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      return NextResponse.json({ success: false, error: issues }, { status: 400 });
    }

    const projection = await buildProjection(ctx.tenantId, parsed.data);
    return NextResponse.json({ success: true, data: projection });
  } catch (error) {
    console.error("[Finance/Cashflow] GET projection:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
