/**
 * API Route: /api/crm/files
 * GET - Listar archivos de una entidad CRM (entityType + entityId)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmView } from "@/lib/api-auth-crm";
import { getFileUrl } from "@/lib/storage";

const ALLOWED_ENTITY_TYPES = ["lead", "deal", "account", "contact", "installation", "guardia"] as const;

export async function GET(request: NextRequest) {
  try {
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

    const links = await prisma.crmFileLink.findMany({
      where: {
        tenantId: ctx.tenantId,
        entityType,
        entityId,
      },
      include: {
        file: true,
        folder: true,
      },
      orderBy: { createdAt: "desc" },
    });

    let publicUrlBase: string | null = null;
    try {
      publicUrlBase = getFileUrl("").replace(/\/$/, "");
    } catch {
      // R2_PUBLIC_URL no configurado
    }

    const data = links.map((link) => ({
      id: link.file.id,
      linkId: link.id,
      fileName: link.file.fileName,
      mimeType: link.file.mimeType,
      size: link.file.size,
      createdAt: link.file.createdAt,
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
