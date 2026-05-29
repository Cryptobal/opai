import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";

/** DELETE /api/finance/cashflow/occurrences/[id]
 *
 *  Solo permite borrar occurrences "weak" (proyecciones puras sin DTE ni bank
 *  tx, status PROJECTED, no closing-adjust). Para tocar facturas/conciliados,
 *  el usuario debe ir al módulo correspondiente. */
export async function DELETE(
  _req: NextRequest,
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

    const occ = await prisma.financeCashflowOccurrence.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: {
        id: true, status: true, dteId: true, bankTransactionId: true,
        isClosingAdjust: true, item: { select: { name: true } },
      },
    });
    if (!occ) {
      return NextResponse.json({ success: false, error: "No encontrada" }, { status: 404 });
    }

    // Guards: solo weak no-closing-adjust
    if (occ.isClosingAdjust) {
      return NextResponse.json(
        { success: false, error: "No se puede borrar un ajuste de cierre. Reabrí la semana primero." },
        { status: 403 },
      );
    }
    if (occ.dteId != null) {
      return NextResponse.json(
        { success: false, error: "Tiene factura/borrador asociado. Anulalo desde el módulo DTE." },
        { status: 403 },
      );
    }
    if (occ.bankTransactionId != null) {
      return NextResponse.json(
        { success: false, error: "Está conciliada con el banco. Desconciliá primero." },
        { status: 403 },
      );
    }
    if (occ.status === "PAID" || occ.status === "CONFIRMED") {
      return NextResponse.json(
        { success: false, error: "Solo se pueden borrar proyecciones pendientes." },
        { status: 403 },
      );
    }

    await prisma.financeCashflowOccurrence.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      deletedItemName: occ.item?.name ?? null,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno";
    console.error("[Finance/Cashflow] DELETE occurrences:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
