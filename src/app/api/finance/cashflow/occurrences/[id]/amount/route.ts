import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import {
  setOccurrenceAmountOverride,
  clearOccurrenceAmountOverride,
} from "@/modules/finance/cashflow/occurrence.service";

// amountClp: número > 0 fija el override manual; null limpia el override y
// restaura el monto calculado (revertir edición manual).
const amountSchema = z.object({
  amountClp: z.number().positive().nullable(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "cashflow_manage")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id } = await context.params;
    const parsed = await parseBody(request, amountSchema);
    if (parsed.error) return parsed.error;
    if (parsed.data.amountClp === null) {
      await clearOccurrenceAmountOverride(ctx.tenantId, id);
    } else {
      await setOccurrenceAmountOverride(ctx.tenantId, id, parsed.data.amountClp);
    }
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
