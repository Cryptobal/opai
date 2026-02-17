import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";
import { getReconciliation, completeReconciliation, getUnmatchedTransactions } from "@/modules/finance/banking/reconciliation.service";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "finance")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id } = await params;
    const rec = await getReconciliation(ctx.tenantId, id);
    if (!rec) return NextResponse.json({ success: false, error: "Conciliación no encontrada" }, { status: 404 });

    // Also get unmatched transactions for this period
    const unmatched = await getUnmatchedTransactions(
      ctx.tenantId, rec.bankAccountId, rec.periodYear, rec.periodMonth
    );

    return NextResponse.json({ success: true, data: { ...rec, unmatchedTransactions: unmatched } });
  } catch (error) {
    console.error("[Finance/Reconciliation] Error getting:", error);
    return NextResponse.json({ success: false, error: "Error al obtener conciliación" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "rendicion_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id } = await params;
    const body = await request.json();
    if (body.action === "complete") {
      const rec = await completeReconciliation(ctx.tenantId, id, ctx.userId);
      return NextResponse.json({ success: true, data: rec });
    }
    return NextResponse.json({ success: false, error: "Acción no válida" }, { status: 400 });
  } catch (error) {
    console.error("[Finance/Reconciliation] Error updating:", error);
    return NextResponse.json({ success: false, error: "Error al actualizar conciliación" }, { status: 500 });
  }
}
