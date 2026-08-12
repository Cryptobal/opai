/**
 * POST /api/finance/billing/issued/[id]/unreconcile
 *
 * Desconcilia un DTE emitido: allocations, links bancarios DTE_ISSUED,
 * reconciledAt y (opcional) recomputo de paymentStatus — alineado con
 * `clearTransactionLinks` desde Banca.
 *
 * Body opcional: `{ "keepPaymentStatus": true }` — la UI de DTEs emitidos
 * lo envía para conservar PAID tras romper el vínculo bancario.
 *
 * Auth: facturacion_configure.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { unreconcileIssuedDte } from "@/modules/finance/banking/bank-tx-link.service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasFacturacionCapability(perms, "facturacion_configure")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos para desconciliar" },
      { status: 403 },
    );
  }
  const { id } = await params;

  let keepPaymentStatus = false;
  try {
    const raw: unknown = await request.json();
    const parsed = z
      .object({ keepPaymentStatus: z.boolean().optional() })
      .safeParse(raw);
    if (parsed.success && parsed.data.keepPaymentStatus === true) {
      keepPaymentStatus = true;
    }
  } catch {
    // Body vacío → default keepPaymentStatus=false (recompute bank-aligned).
  }

  try {
    const result = await unreconcileIssuedDte(ctx.tenantId, id, {
      keepPaymentStatus,
    });

    await logAudit({
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      action: "UPDATE",
      entity: "FinanceDte",
      entityId: id,
      details: {
        operation: "unreconcile",
        keepPaymentStatus,
        ...result,
      },
      request,
    });

    return NextResponse.json({
      success: true,
      data: {
        removed: result.allocationsRemoved,
        paymentsDeleted: result.paymentsDeleted,
        bankLinksRemoved: result.bankLinksRemoved,
        bankTransactionsReset: result.bankTransactionsReset,
        keepPaymentStatus,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error al desconciliar";
    const status = message === "DTE no encontrado" ? 404 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
