/**
 * GET /api/finance/factoring/operations/[id]/aec
 * Descarga el AEC XML de la operación (si existe).
 * Capability: facturacion_view.
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
  if (!op || !op.aecXml || op.aecXml.length === 0) {
    return NextResponse.json(
      { success: false, error: "AEC no disponible" },
      { status: 404 },
    );
  }
  return new NextResponse(new Uint8Array(op.aecXml), {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=ISO-8859-1",
      "Content-Disposition": `attachment; filename="aec_${op.code}.xml"`,
    },
  });
}
