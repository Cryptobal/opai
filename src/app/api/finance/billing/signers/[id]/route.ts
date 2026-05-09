/**
 * PATCH / DELETE /api/finance/billing/signers/[id]
 *
 * PATCH  → actualiza nombre / cargo / orden / estado.
 * DELETE → soft-delete (isActive=false).
 *
 * Permisos: facturacion_configure.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { billingSignerUpdateSchema } from "@/lib/validations/billing-doc";
import {
  updateSigner,
  deleteSigner,
} from "@/modules/finance/billing/billing-signers.service";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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
    const { id } = await params;
    const parsed = await parseBody(request, billingSignerUpdateSchema);
    if (parsed.error) return parsed.error;
    const updated = await updateSigner(ctx.tenantId, id, parsed.data);
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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
    const { id } = await params;
    await deleteSigner(ctx.tenantId, id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 },
    );
  }
}
