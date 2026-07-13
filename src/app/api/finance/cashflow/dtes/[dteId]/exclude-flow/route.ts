import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import {
  excludeDteFromFlow,
  includeDteInFlow,
} from "@/modules/finance/cashflow/dte-exclusion.service";

const bodySchema = z.object({
  /** true = ocultar del flujo; false = restaurar. */
  exclude: z.boolean(),
  reason: z.string().max(200).optional().nullable(),
});

/**
 * POST /api/finance/cashflow/dtes/[dteId]/exclude-flow
 *
 * Oculta o restaura una factura en el flujo de caja. No borra el DTE ni
 * toca Facturación/SII — sólo deja de sumar/aparecer en la proyección.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ dteId: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "cashflow_manage")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { dteId } = await context.params;
    const parsed = await parseBody(request, bodySchema);
    if (parsed.error) return parsed.error;

    if (parsed.data.exclude) {
      await excludeDteFromFlow({
        tenantId: ctx.tenantId,
        dteId,
        createdBy: ctx.userId,
        reason: parsed.data.reason ?? null,
      });
    } else {
      await includeDteInFlow(ctx.tenantId, dteId);
    }

    return NextResponse.json({
      success: true,
      data: { dteId, excluded: parsed.data.exclude },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno";
    console.error("[Finance/Cashflow] POST dtes/exclude-flow:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
