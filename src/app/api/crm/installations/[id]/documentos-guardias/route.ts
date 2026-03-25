/**
 * GET /api/crm/installations/[id]/documentos-guardias
 *
 * Documentos de guardias asignados a la instalación.
 * Query: OpsAsignacionGuardia (installationId, isActive) → guardias → OpsDocumentoPersona.
 * Agrupado por guardia (nombre + foto si tiene).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmView } from "@/lib/api-auth-crm";
import { getPermissionsFromAuth } from "@/lib/permissions-server";
import { canViewInstallations } from "@/lib/permissions";
import { getPostulacionDocumentTypes } from "@/lib/postulacion-documentos";
import { buildDocLabelMap } from "@/lib/personas";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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

    const { id: installationId } = await params;

    const postulacionDocs = await getPostulacionDocumentTypes(ctx.tenantId);
    const docLabels = buildDocLabelMap(postulacionDocs);

    const asignaciones = await prisma.opsAsignacionGuardia.findMany({
      where: {
        tenantId: ctx.tenantId,
        installationId,
        isActive: true,
      },
      select: {
        guardiaId: true,
        guardia: {
          select: {
            id: true,
            faceIdPhotoUrl: true,
            persona: {
              select: { firstName: true, lastName: true },
            },
          },
        },
      },
      distinct: ["guardiaId"],
    });

    const guardiaIds = asignaciones.map((a) => a.guardiaId);

    const documentos = await prisma.opsDocumentoPersona.findMany({
      where: {
        tenantId: ctx.tenantId,
        guardiaId: { in: guardiaIds },
      },
      orderBy: [{ guardiaId: "asc" }, { type: "asc" }],
    });

    const byGuardia = asignaciones.map((a) => {
      const docs = documentos.filter((d) => d.guardiaId === a.guardiaId);
      const nombre =
        [a.guardia.persona.lastName, a.guardia.persona.firstName]
          .filter(Boolean)
          .join(" ") || "Sin nombre";
      return {
        guardiaId: a.guardiaId,
        nombre,
        fotoUrl: a.guardia.faceIdPhotoUrl ?? null,
        documentos: docs.map((d) => ({
          id: d.id,
          type: d.type,
          status: d.status,
          fileUrl: d.fileUrl,
          issuedAt: d.issuedAt?.toISOString().slice(0, 10) ?? null,
          expiresAt: d.expiresAt?.toISOString().slice(0, 10) ?? null,
        })),
      };
    });

    return NextResponse.json({ success: true, data: byGuardia, docLabels });
  } catch (error) {
    console.error("[CRM] Error fetching documentos guardias:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron obtener los documentos" },
      { status: 500 }
    );
  }
}
