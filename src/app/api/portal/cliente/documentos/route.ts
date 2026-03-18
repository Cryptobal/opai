/**
 * GET /api/portal/cliente/documentos
 * Archivos de la cuenta visibles en el portal (entityType=account),
 * organizados por carpeta. Incluye carpetas aunque estén vacías.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";
import { getFileUrl } from "@/lib/storage";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const session = parsePortalClienteSessionCookie(
      cookieStore.get("portal_cliente_session")?.value
    );
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { tenantId, accountId } = session;

    // Carpetas de cuenta visibles en portal
    const folders = await prisma.documentFolder.findMany({
      where: {
        tenantId,
        entityType: "account",
        entityId: accountId,
        portalVisible: true,
      },
      select: { id: true, name: true, parentId: true },
      orderBy: [{ parentId: "asc" }, { name: "asc" }],
    });

    // Archivos de cuenta visibles en portal (con carpeta visible o sin carpeta)
    const links = await prisma.crmFileLink.findMany({
      where: {
        tenantId,
        entityType: "account",
        entityId: accountId,
        file: { portalVisible: true },
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

    const files = links.map((link) => ({
      id: link.file.id,
      fileName: link.file.fileName,
      mimeType: link.file.mimeType,
      size: link.file.size,
      createdAt: link.file.createdAt,
      publicUrl: publicUrlBase ? `${publicUrlBase}/${link.file.storageKey}` : null,
      folderId: link.folderId ?? null,
      folderName: link.folder?.name ?? null,
    }));

    return NextResponse.json({ success: true, data: { folders, files } });
  } catch (error) {
    console.error("[Portal Cliente] documentos cuenta", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
