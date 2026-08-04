import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { pinReceivedDteToFlow } from "@/modules/finance/flow-v3/pin-dte-to-flow.service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  rowId: z.string().uuid(),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD"),
});

/**
 * POST /api/finance/cashflow/dtes/[dteId]/pin-to-flow
 *
 * Fija una factura de compra puntual al flujo (celda de plan en fila GAV
 * + nota con folio). Opt-in: las compras no proyectan por defecto.
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

    const data = await pinReceivedDteToFlow({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      dteId,
      rowId: parsed.data.rowId,
      weekStart: parsed.data.weekStart,
    });
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno";
    const sealed = /semana cerrada/i.test(msg);
    const known =
      sealed ||
      /no encontrad|anulado|pendiente|sección|archivada|lunes|solo se pueden/i.test(msg);
    console.error("[Finance/Cashflow] POST dtes/pin-to-flow:", error);
    return NextResponse.json(
      { success: false, error: known ? msg : "Error interno" },
      { status: sealed ? 409 : known ? 400 : 500 },
    );
  }
}
