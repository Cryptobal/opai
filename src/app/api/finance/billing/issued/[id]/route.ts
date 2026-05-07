import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasFacturacionCapability(perms, "facturacion_view")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 }
      );
    }

    const { id } = await params;

    const dte = await prisma.financeDte.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        lines: true,
        // Notas de Crédito / Débito que referencian a este DTE (lado
        // INCOMING). Filtramos las anuladas — si una NC fue anulada con
        // ND, no debe contar como "factura ya tiene NC".
        referencedBy: {
          where: {
            dteType: { in: [56, 61] }, // ND o NC
            siiStatus: { not: "ANNULLED" },
          },
          select: {
            id: true,
            dteType: true,
            folio: true,
            date: true,
            netAmount: true,
            totalAmount: true,
            siiStatus: true,
            referenceCode: true,
            referenceReason: true,
            createdAt: true,
          },
          orderBy: { date: "desc" },
        },
      },
    });

    if (!dte) {
      return NextResponse.json(
        { success: false, error: "DTE no encontrado" },
        { status: 404 }
      );
    }

    // Calcular agregados de NCs asociadas para que la UI muestre estado
    // sin tener que refacer el cálculo. `hasFullAnnulment` es lo que
    // bloquea la UI/backend de emitir otra NC tipo CodRef=1. `creditedNet`
    // es la suma de montos netos ya acreditados (CodRef=1 o 3 con estado
    // no rechazado), útil para mostrar saldo o limitar nuevas NC parciales.
    const ncs = dte.referencedBy ?? [];
    const activeForCredit = ncs.filter(
      (n) =>
        n.dteType === 61 &&
        ["ACCEPTED", "PENDING", "SENT", "WITH_OBJECTIONS"].includes(n.siiStatus),
    );
    const hasFullAnnulment = activeForCredit.some((n) => n.referenceCode === 1);
    const creditedNet = activeForCredit.reduce(
      (acc, n) => acc + Number(n.netAmount ?? 0),
      0,
    );

    return NextResponse.json({
      success: true,
      data: {
        ...dte,
        creditNotes: ncs,
        hasFullAnnulment,
        creditedNet,
      },
    });
  } catch (error) {
    console.error("[Finance/Billing] Error getting DTE:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener DTE" },
      { status: 500 }
    );
  }
}
