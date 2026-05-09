/**
 * GET / PATCH /api/finance/billing/doc-config
 *
 * Configuración del documento de cobro (plantillas de email Proforma /
 * Estado de Pago, footer legal, override de colores de marca, plantilla
 * del código de verificación).
 *
 * Permisos:
 *   - GET: canView(finance, configuracion)
 *   - PATCH: facturacion_configure
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { canView, hasFacturacionCapability } from "@/lib/permissions";
import { tenantBillingDocConfigSchema } from "@/lib/validations/billing-doc";
import {
  getBillingDocConfig,
  updateBillingDocConfig,
} from "@/modules/finance/billing/billing-doc-config.service";

export async function GET() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!canView(perms, "finance", "configuracion")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 },
    );
  }
  const data = await getBillingDocConfig(ctx.tenantId);
  return NextResponse.json({ success: true, data });
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasFacturacionCapability(perms, "facturacion_configure")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }
    const parsed = await parseBody(request, tenantBillingDocConfigSchema);
    if (parsed.error) return parsed.error;
    const updated = await updateBillingDocConfig(ctx.tenantId, parsed.data);
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 },
    );
  }
}
