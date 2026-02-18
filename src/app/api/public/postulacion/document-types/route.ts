/**
 * GET /api/public/postulacion/document-types?token=xxx
 * Devuelve la lista de documentos de postulación (tipos, labels, obligatorios)
 * solo si el token es válido. Usado por el formulario público.
 */

import { NextRequest, NextResponse } from "next/server";
import { isValidPostulacionToken } from "@/lib/postulacion-token";
import { getDefaultTenantId } from "@/lib/tenant";
import { getPostulacionDocumentTypes } from "@/lib/postulacion-documentos";

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token") ?? "";
    if (!isValidPostulacionToken(token)) {
      return NextResponse.json({ success: false, error: "Token inválido" }, { status: 403 });
    }
    const tenantId = await getDefaultTenantId();
    const documents = await getPostulacionDocumentTypes(tenantId);
    return NextResponse.json({ success: true, data: documents });
  } catch (error) {
    console.error("[POSTULACION] Error fetching document types:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener tipos de documento" },
      { status: 500 }
    );
  }
}
