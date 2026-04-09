/**
 * GET /api/public/[tenantSlug]/postulacion/document-types?token=xxx
 * Devuelve la lista de documentos de postulación (tipos, labels, obligatorios)
 * solo si el token es válido. Usado por el formulario público.
 */

import { NextRequest, NextResponse } from "next/server";
import { isValidPostulacionToken } from "@/lib/postulacion-token";
import { resolveTenantFromSlug } from "@/lib/tenant";
import { getPostulacionDocumentTypesVisibleOnGuardForm } from "@/lib/postulacion-documentos";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  const { tenantSlug } = await params;
  const tenant = await resolveTenantFromSlug(tenantSlug);
  if (!tenant) {
    return NextResponse.json(
      { success: false, error: "Tenant not found" },
      { status: 404, headers: corsHeaders },
    );
  }
  const tenantId = tenant.id;

  try {
    const token = request.nextUrl.searchParams.get("token") ?? "";
    if (!isValidPostulacionToken(token)) {
      return NextResponse.json({ success: false, error: "Token inválido" }, { status: 403, headers: corsHeaders });
    }
    const documents = await getPostulacionDocumentTypesVisibleOnGuardForm(tenantId);
    return NextResponse.json({ success: true, data: documents }, { headers: corsHeaders });
  } catch (error) {
    console.error("[POSTULACION] Error fetching document types:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener tipos de documento" },
      { status: 500, headers: corsHeaders },
    );
  }
}
