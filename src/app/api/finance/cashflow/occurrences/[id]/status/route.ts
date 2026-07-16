import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { changeOccurrenceStatus } from "@/modules/finance/cashflow/occurrence.service";
import { changeOccurrenceStatusSchema } from "@/lib/validations/cashflow";
import {
  returnRangeField,
  withPartialProjection,
} from "@/modules/finance/cashflow/partial-projection";

const bodySchema = changeOccurrenceStatusSchema.and(returnRangeField);

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (!auth) return unauthorized();
    const perms = await resolveApiPerms(auth);
    if (!hasCapability(perms, "cashflow_manage")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id } = await ctx.params;
    const parsed = await parseBody(request, bodySchema);
    if (parsed.error) return parsed.error;
    const updated = await changeOccurrenceStatus(
      auth.tenantId,
      id,
      parsed.data.status,
      parsed.data.effectiveDate,
    );
    const data = await withPartialProjection(
      auth.tenantId,
      parsed.data.returnRange,
      updated,
    );
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno";
    console.error("[Finance/Cashflow] PATCH occurrence status:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
