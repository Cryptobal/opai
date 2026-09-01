/**
 * API Route: /api/crm/files
 * GET - Listar archivos de una entidad CRM (entityType + entityId)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmView } from "@/lib/api-auth-crm";
import { getFileUrl } from "@/lib/storage";
import { requireTenantModule } from '@/lib/require-module';

const ALLOWED_ENTITY_TYPES = ["lead", "deal", "account", "contact", "installation", "guardia"] as const;

export async function GET(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmView(ctx);
    if (forbidden) return forbidden;

    const entityType = request.nextUrl.searchParams.get("entityType");
    const entityId = request.nextUrl.searchParams.get("entityId");

    if (!entityType || !ALLOWED_ENTITY_TYPES.includes(entityType as (typeof ALLOWED_ENTITY_TYPES)[number])) {
      return NextResponse.json(
        { success: false, error: "entityType requerido (lead, deal, account, contact, installation)" },
        { status: 400 }
      );
    }

    if (!entityId) {
      return NextResponse.json(
        { success: false, error: "entityId requerido" },
        { status: 400 }
      );
    }

    const links = await prisma.documentoEnlace.findMany({
      where: {
        tenantId: ctx.tenantId,
        entityType,
        entityId,
      },
      include: {
        file: { include: { tipo: { select: { capa: true, codigo: true } } } },
        folder: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const visibleLinks =
      entityType === "guardia"
        ? links.filter((link) => {
            // Checklist de ficha (capa guardia, tipados) no se duplican en
            // "Documentos adicionales". Adjuntos de FileAttachments no tienen
            // tipo (tipoId null) o quedan en sin_clasificar_*.
            const tipo = link.file.tipo;
            if (!tipo) return true;
            if (tipo.capa === "guardia" && !tipo.codigo.startsWith("sin_clasificar")) {
              return false;
            }
            return true;
          })
        : links;

    let publicUrlBase: string | null = null;
    try {
      publicUrlBase = getFileUrl("").replace(/\/$/, "");
    } catch {
      // R2_PUBLIC_URL no configurado
    }

    const data = visibleLinks.map((link) => ({
      id: link.file.id,
      linkId: link.id,
      fileName: link.file.fileName,
      mimeType: link.file.mimeType,
      size: link.file.size,
      createdAt: link.file.createdAt,
      // Endpoint autenticado (misma-origen): cierra la exposición sin sesión de
      // documentos CRM (Ley 21.719) y habilita el visor pdf.js (fetch de bytes).
      downloadUrl: `/api/crm/files/${link.file.id}/download`,
      // @deprecated Preferir `downloadUrl`. Se conserva solo para consumidores
      // que aún lo requieran; se migran uno a uno.
      publicUrl: publicUrlBase ? `${publicUrlBase}/${link.file.storageKey}` : null,
      folderId: link.folderId,
      folderName: link.folder?.name ?? null,
      portalVisible: link.file.portalVisible,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[CRM] Error listing files:", error);
    return NextResponse.json(
      { success: false, error: "Error al listar archivos" },
      { status: 500 }
    );
  }
}
