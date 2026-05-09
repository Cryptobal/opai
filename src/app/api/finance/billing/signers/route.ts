/**
 * GET / POST /api/finance/billing/signers
 *
 * GET  → lista de firmantes (incluye inactivos).
 * POST → crea un nuevo firmante.
 *
 * Permisos:
 *   - GET: facturacion_view o canView(finance, configuracion)
 *   - POST: facturacion_configure
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { canView, hasFacturacionCapability } from "@/lib/permissions";
import { billingSignerSchema } from "@/lib/validations/billing-doc";
import {
  listSignersAdmin,
  createSigner,
} from "@/modules/finance/billing/billing-signers.service";

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
  const data = await listSignersAdmin(ctx.tenantId);
  return NextResponse.json({ success: true, data });
}

export async function POST(request: NextRequest) {
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
    const parsed = await parseBody(request, billingSignerSchema);
    if (parsed.error) return parsed.error;
    const created = await createSigner(ctx.tenantId, parsed.data);
    return NextResponse.json({ success: true, data: created });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 },
    );
  }
}
