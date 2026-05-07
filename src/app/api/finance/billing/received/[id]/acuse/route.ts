/**
 * API Route: POST /api/finance/billing/received/[id]/acuse
 *
 * Notifica al SII (vía SimpleAPI) la aceptación o reclamo de un DTE
 * recibido y persiste el cambio en `FinanceDte.receptionStatus`.
 *
 * Body (JSON):
 *   {
 *     "action": "ACCEPT" | "ACCEPT_CONTENT_ONLY" |
 *               "CLAIM_CONTENT" | "CLAIM_PARTIAL" | "CLAIM_TOTAL",
 *     "reason"?: string  // opcional, solo informativo (auditoría/notes)
 *   }
 *
 * Response (JSON):
 *   200 → { success: true, data: { trackId?, newReceptionStatus, message } }
 *   400 → { success: false, error: "<motivo validación>" }
 *   401/403 → auth/permisos
 *   404 → DTE no encontrado
 *   500 → error inesperado (loggeado)
 *
 * Permiso requerido: `facturacion_create_draft` (mismo que el PUT de
 * recibidos — quien edita un DTE recibido también puede acusar SII).
 *
 * NOTA OPERATIVA: la operación NO es reversible. Una vez aceptado /
 * reclamado en SII, el cambio queda firme. La UI debe confirmar antes
 * de llamar a este endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { acuseReceivedDteSchema } from "@/lib/validations/finance";
import { applyAcuse } from "@/modules/finance/billing/dte-received-acuse.service";

// El acuse contra SimpleAPI puede demorar varios segundos por cada
// llamada (especialmente cuando son ACD + ERM secuenciales). Subimos
// el timeout para evitar 504s en producción.
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasFacturacionCapability(perms, "facturacion_create_draft")) {
      return NextResponse.json(
        {
          success: false,
          error: "No tiene permiso para acusar DTEs recibidos en el SII",
        },
        { status: 403 },
      );
    }

    const { id } = await params;

    const parsed = await parseBody(request, acuseReceivedDteSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const result = await applyAcuse(ctx.tenantId, ctx.userId, {
      dteId: id,
      action: body.action,
      reason: body.reason,
    });

    if (!result.success) {
      const status = /no encontrado|no pertenece/i.test(result.message)
        ? 404
        : /sin configuración|sin certificado|vencido|descifrar/i.test(
              result.message,
            )
          ? 412
          : /ya tiene estado/i.test(result.message)
            ? 409
            : 502;
      return NextResponse.json(
        { success: false, error: result.message, raw: result.raw },
        { status },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        trackId: result.trackId,
        newReceptionStatus: result.newReceptionStatus,
        message: result.message,
      },
    });
  } catch (error) {
    console.error(
      "[Finance/Billing/Received/Acuse] Error inesperado:",
      error,
    );
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Error inesperado al acusar DTE",
      },
      { status: 500 },
    );
  }
}
