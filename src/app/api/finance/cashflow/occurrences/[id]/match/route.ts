import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { linkOccurrenceToBankTx, unmatchOccurrence } from "@/modules/finance/cashflow/occurrence.service";
import { linkBankTxSchema } from "@/lib/validations/cashflow";

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (!auth) return unauthorized();
    const perms = await resolveApiPerms(auth);
    if (!hasCapability(perms, "cashflow_manage")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id } = await ctx.params;
    const parsed = await parseBody(request, linkBankTxSchema);
    if (parsed.error) return parsed.error;
    const updated = await linkOccurrenceToBankTx(auth.tenantId, id, parsed.data.bankTransactionId, auth.userId);
    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno";
    console.error("[Finance/Cashflow] POST link occurrence:", error);
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
    const updated = await unmatchOccurrence(auth.tenantId, id);
    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno";
    console.error("[Finance/Cashflow] DELETE link occurrence:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
