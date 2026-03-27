/**
 * GET /api/public/ingreso-te/document-types
 * Devuelve la lista de documentos configurados como visibles en el formulario TE.
 * Endpoint público, sin autenticación.
 */

import { NextResponse } from "next/server";
import { getDefaultTenantId } from "@/lib/tenant";
import { getPostulacionDocumentTypesVisibleOnTeForm } from "@/lib/postulacion-documentos";

export async function GET() {
  try {
    const tenantId = await getDefaultTenantId();
    const documents = await getPostulacionDocumentTypesVisibleOnTeForm(tenantId);
    return NextResponse.json({ success: true, data: documents });
  } catch (error) {
    console.error("[INGRESO-TE] Error fetching document types:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener tipos de documento" },
      { status: 500 }
    );
  }
}
