/**
 * GET /api/public/[tenantSlug]/ingreso-te/document-types
 * Devuelve la lista de documentos configurados como visibles en el formulario TE.
 * Endpoint público, sin autenticación.
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveTenantFromSlug } from "@/lib/tenant";
import { getPostulacionDocumentTypesVisibleOnTeForm } from "@/lib/postulacion-documentos";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  const { tenantSlug } = await params;
  const tenant = await resolveTenantFromSlug(tenantSlug);
  if (!tenant) {
    return NextResponse.json(
      { success: false, error: "Tenant not found" },
      { status: 404 },
    );
  }
  const tenantId = tenant.id;

  try {
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
