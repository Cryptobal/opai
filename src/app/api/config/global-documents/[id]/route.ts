import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteFile } from "@/lib/storage";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";

type Params = { id: string };

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canEdit(perms, "config", "inteligencia_artificial")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para eliminar documentos globales" },
        { status: 403 },
      );
    }

    const { id } = await params;

    const document = await prisma.protocolDocument.findFirst({
      where: { id, tenantId: ctx.tenantId, scope: "global" },
    });

    if (!document) {
      return NextResponse.json(
        { success: false, error: "Documento no encontrado" },
        { status: 404 },
      );
    }

    if (document.storageKey) {
      await deleteFile(document.storageKey);
    }

    await prisma.protocolDocument.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[GLOBAL-DOCS] Error deleting document:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo eliminar el documento" },
      { status: 500 },
    );
  }
}
