/**
 * GET /api/crm/installations/[id]/documentos-guardias
 * Dossier de cumplimiento: docs de la dotación actual.
 * Permisos: Personas (guardias_documents) + ver instalaciones.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmView } from "@/lib/api-auth-crm";
import { getPermissionsFromAuth } from "@/lib/permissions-server";
import { canView, canViewInstallations } from "@/lib/permissions";
import { requireTenantModule } from "@/lib/require-module";
import { buildInstallationDossier } from "@/lib/docs/dossier-instalacion";
import { ensureOpsCapability } from "@/lib/ops";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule("crm");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmView(ctx, "installations");
    if (forbidden) return forbidden;

    const perms = await getPermissionsFromAuth(ctx);
    if (!canViewInstallations(perms)) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para ver instalaciones" },
        { status: 403 }
      );
    }
    // Dossier: datos laborales → permisos Personas / docs de guardia
    const docsForbidden = await ensureOpsCapability(ctx, "guardias_documents");
    if (docsForbidden && !canView(perms, "ops", "guardias")) {
      return NextResponse.json(
        {
          success: false,
          error: "Sin permisos de Personas para ver documentos de trabajadores",
        },
        { status: 403 }
      );
    }

    const { id: installationId } = await params;
    const { byGuardia, docLabels } = await buildInstallationDossier(
      ctx.tenantId,
      installationId
    );

    return NextResponse.json({ success: true, data: byGuardia, docLabels });
  } catch (error) {
    console.error("[CRM] Error fetching documentos guardias:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron obtener los documentos" },
      { status: 500 }
    );
  }
}
