import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { autoMatchSchema } from "@/lib/validations/cashflow";
import { buildProjection } from "@/modules/finance/cashflow/projection.service";
import { autoMatchOccurrencesToBankTx } from "@/modules/finance/cashflow/actuals-matcher";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "cashflow_manage")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const parsed = await parseBody(request, autoMatchSchema);
    if (parsed.error) return parsed.error;
    const { from, to } = parsed.data;
    const projection = await buildProjection(ctx.tenantId, { from, to, granularity: "weekly" });
    const allOccs = projection.buckets.flatMap((b) => b.occurrences);
    const result = await autoMatchOccurrencesToBankTx(ctx.tenantId, allOccs, from, to, ctx.userId);
    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno";
    console.error("[Finance/Cashflow] POST match/auto:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
