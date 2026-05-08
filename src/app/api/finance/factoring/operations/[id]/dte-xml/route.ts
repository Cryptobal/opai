/**
 * GET /api/finance/factoring/operations/[id]/dte-xml
 * Descarga el XML del DTE original tal como está almacenado en BD (el mismo
 * que se usó para armar el AEC), sin pasar por el proveedor de emisión.
 *
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
  const op = await getFactoringOperationDetail(ctx.tenantId, id, {
    includeDteXml: true,
  });
  if (!op) {
    return NextResponse.json(
      { success: false, error: "Operación no encontrada" },
      { status: 404 },
    );
  }
  const xml = "dteXml" in op.dte ? op.dte.dteXml : null;
  if (!xml || xml.length === 0) {
    return NextResponse.json(
      { success: false, error: "XML del DTE no disponible en la base" },
      { status: 404 },
    );
  }
  const safeFolio = String(op.dte.folio).replace(/[^\d]/g, "") || "dte";
  return new NextResponse(new Uint8Array(xml), {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=ISO-8859-1",
      "Content-Disposition": `attachment; filename="dte_${op.dte.dteType}_${safeFolio}_cedido.xml"`,
    },
  });
}
