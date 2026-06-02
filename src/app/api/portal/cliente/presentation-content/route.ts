import { NextRequest, NextResponse } from "next/server";
import { requirePortalClienteAuth } from "@/lib/portal-cliente";
import { getTenantPresentationContent } from "@/lib/tenant-presentation";

/**
 * GET /api/portal/cliente/presentation-content
 *
 * Devuelve el contenido editorial de la Presentación de Empresa del tenant
 * (propuesta de valor, stats, secciones, qué incluye el servicio).
 * El tenant se resuelve SIEMPRE desde la cookie de sesión del portal cliente,
 * nunca desde el request.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePortalClienteAuth(request);
  if (!auth) {
    return NextResponse.json(
      { success: false, error: "No autorizado" },
      { status: 401 },
    );
  }

  try {
    const content = await getTenantPresentationContent(auth.tenantId);
    return NextResponse.json({ success: true, data: content });
  } catch (error) {
    console.error("[PORTAL] presentation-content:", error);
    return NextResponse.json(
      { success: false, error: "Error cargando contenido" },
      { status: 500 },
    );
  }
}
