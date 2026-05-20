/**
 * GET /api/finance/billing/drafts/pending-sends
 *
 * Lista compacta de borradores con require_proforma|require_estado_pago=true
 * y *_status='NONE'. Alimenta el banner de acción rápida en /programacion.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  resolveApiPerms,
  unauthorized,
} from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(_request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasFacturacionCapability(perms, "facturacion_view")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 },
    );
  }

  const rows = await prisma.financeDte.findMany({
    where: {
      tenantId: ctx.tenantId,
      direction: "ISSUED",
      siiStatus: "DRAFT",
      OR: [
        { AND: [{ requireProforma: true }, { proformaStatus: "NONE" }] },
        { AND: [{ requireEstadoPago: true }, { estadoPagoStatus: "NONE" }] },
      ],
    },
    select: {
      id: true,
      receiverName: true,
      receiverRut: true,
      totalAmount: true,
      createdAt: true,
      requireProforma: true,
      proformaStatus: true,
      proformaRecipientContactIds: true,
      requireEstadoPago: true,
      estadoPagoStatus: true,
      estadoPagoRecipientContactIds: true,
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const drafts = rows.map((d) => ({
    id: d.id,
    receiverName: d.receiverName,
    receiverRut: d.receiverRut,
    totalAmount: Number(d.totalAmount),
    createdAt: d.createdAt.toISOString(),
    proformaPending: d.requireProforma && d.proformaStatus === "NONE",
    estadoPagoPending: d.requireEstadoPago && d.estadoPagoStatus === "NONE",
    proformaHasRecipients: d.proformaRecipientContactIds.length > 0,
    estadoPagoHasRecipients: d.estadoPagoRecipientContactIds.length > 0,
  }));

  return NextResponse.json({
    success: true,
    data: {
      total: drafts.length,
      proformaPendingCount: drafts.filter((d) => d.proformaPending).length,
      estadoPagoPendingCount: drafts.filter((d) => d.estadoPagoPending).length,
      withoutRecipientsCount: drafts.filter(
        (d) =>
          (d.proformaPending && !d.proformaHasRecipients) ||
          (d.estadoPagoPending && !d.estadoPagoHasRecipients),
      ).length,
      drafts,
    },
  });
}
