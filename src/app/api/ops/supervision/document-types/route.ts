/**
 * GET /api/ops/supervision/document-types
 * Lista de documentos de instalación para el checklist en visitas.
 * Requiere canView ops.supervision.
 */

import { NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { getInstalacionDocumentTypes } from "@/lib/instalacion-documentos";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canView(perms, "ops", "supervision")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para supervisión" },
        { status: 403 },
      );
    }

    const documents = await getInstalacionDocumentTypes(ctx.tenantId);
    return NextResponse.json({ success: true, data: documents });
  } catch (error) {
    console.error("[OPS][SUPERVISION] Error fetching document types:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron obtener los tipos de documento" },
      { status: 500 },
    );
  }
}
