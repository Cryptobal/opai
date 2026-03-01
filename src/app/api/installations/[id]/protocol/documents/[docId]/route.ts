import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";
import { deleteFile } from "@/lib/storage";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "crm", "installations")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 }
      );
    }

    const { id, docId } = await params;

    const doc = await prisma.protocolDocument.findFirst({
      where: { id: docId, installationId: id },
    });

    if (!doc) {
      return NextResponse.json(
        { success: false, error: "Documento no encontrado" },
        { status: 404 }
      );
    }

    if (doc.storageKey) {
      try {
        await deleteFile(doc.storageKey);
      } catch {
        // Storage delete failed but proceed with DB delete
      }
    }

    await prisma.protocolDocument.delete({ where: { id: docId } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[PROTOCOL] document delete error:", err);
    return NextResponse.json(
      { success: false, error: "Error al eliminar documento" },
      { status: 500 }
    );
  }
}
