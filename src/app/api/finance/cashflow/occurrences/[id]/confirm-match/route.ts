import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { confirmCashflowMatch } from "@/modules/finance/cashflow/occurrence.service";

const schema = z.object({
  bankTransactionId: z.string().uuid(),
  rebalanceDate: z.boolean().optional(),
  rebalanceAmount: z.boolean().optional(),
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
    const parsed = await parseBody(request, schema);
    if (parsed.error) return parsed.error;
    const updated = await confirmCashflowMatch(ctx.tenantId, ctx.userId, {
      occurrenceId: id,
      bankTransactionId: parsed.data.bankTransactionId,
      rebalanceDate: parsed.data.rebalanceDate ?? true,
      rebalanceAmount: parsed.data.rebalanceAmount ?? true,
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[Finance/Cashflow/ConfirmMatch] error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error" },
      { status: 400 },
    );
  }
}
