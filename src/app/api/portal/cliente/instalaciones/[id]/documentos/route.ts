/**
 * GET /api/portal/cliente/instalaciones/[id]/documentos
 * Documentos de la instalación visibles en el portal (CrmFile con portalVisible + cascada de carpeta)
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";
import { getFileUrl } from "@/lib/storage";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const session = parsePortalClienteSessionCookie(
      cookieStore.get("portal_cliente_session")?.value
    );
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id: installationId } = await params;

    if (!session.installations.some((i) => i.id === installationId)) {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    }

    const links = await prisma.crmFileLink.findMany({
      where: {
        tenantId: session.tenantId,
        entityType: "installation",
        entityId: installationId,
        file: {
          portalVisible: true,
        },
        OR: [
          { folderId: null },
          { folder: { portalVisible: true } },
        ],
      },
      include: {
        file: true,
        folder: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    let publicUrlBase: string | null = null;
    try {
      publicUrlBase = getFileUrl("").replace(/\/$/, "");
    } catch {
      /* R2 no configurado */
    }

    const data = links.map((link) => ({
      id: link.file.id,
      fileName: link.file.fileName,
      mimeType: link.file.mimeType,
      size: link.file.size,
      createdAt: link.file.createdAt,
      publicUrl: publicUrlBase ? `${publicUrlBase}/${link.file.storageKey}` : null,
      folderName: link.folder?.name ?? null,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Portal Cliente] documentos instalación", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
