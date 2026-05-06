/**
 * GET /api/finance/factoring/operations/[id] — detalle de operación.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  resolveApiPerms,
  unauthorized,
} from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { getFactoringOperationDetail } from "@/modules/finance/factoring/operations.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasFacturacionCapability(perms, "facturacion_view")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 },
    );
  }
  const { id } = await params;
  const op = await getFactoringOperationDetail(ctx.tenantId, id);
  if (!op) {
    return NextResponse.json(
      { success: false, error: "Operación no encontrada" },
      { status: 404 },
    );
  }
  // Quitar el AEC bytes del JSON (es pesado y se baja por endpoint dedicado).
  const { aecXml, ...rest } = op;
  return NextResponse.json({
    success: true,
    operation: { ...rest, hasAecXml: !!aecXml && aecXml.length > 0 },
  });
}
