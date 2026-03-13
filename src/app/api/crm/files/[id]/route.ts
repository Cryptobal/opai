/**
 * API Route: /api/crm/files/[id]
 * PATCH - Actualizar portalVisible del archivo y folderId del link
 * DELETE - Eliminar archivo de R2 y de la base de datos
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { deleteFile } from "@/lib/storage";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id: fileId } = await params;
    const body = await request.json();
    const { portalVisible, folderId, entityType, entityId } = body;

    if (!entityType || !entityId) {
      return NextResponse.json(
        { success: false, error: "entityType y entityId requeridos" },
        { status: 400 }
      );
    }

    const link = await prisma.crmFileLink.findFirst({
      where: {
        fileId,
        tenantId: ctx.tenantId,
        entityType,
        entityId,
      },
      include: { file: true },
    });

    if (!link) {
      return NextResponse.json(
        { success: false, error: "Archivo no encontrado" },
        { status: 404 }
      );
    }

    const updates: Promise<unknown>[] = [];

    if (typeof portalVisible === "boolean") {
      updates.push(
        prisma.crmFile.update({
          where: { id: fileId },
          data: { portalVisible },
        })
      );
    }

    if (folderId !== undefined) {
      updates.push(
        prisma.crmFileLink.update({
          where: { id: link.id },
          data: { folderId: folderId || null },
        })
      );
    }

    if (updates.length > 0) {
      await Promise.all(updates);
    }

    const updated = await prisma.crmFile.findUnique({
      where: { id: fileId },
      include: {
        links: {
          where: { entityType, entityId },
          include: { folder: true },
        },
      },
    });

    const linkUpdated = updated?.links[0];
    return NextResponse.json({
      success: true,
      data: {
        id: updated?.id,
        portalVisible: updated?.portalVisible,
        folderId: linkUpdated?.folderId,
        folderName: linkUpdated?.folder?.name ?? null,
      },
    });
  } catch (error) {
    console.error("[CRM] Error updating file:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar archivo" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id: fileId } = await params;

    const file = await prisma.crmFile.findFirst({
      where: {
        id: fileId,
        tenantId: ctx.tenantId,
      },
      include: { links: true },
    });

    if (!file) {
      return NextResponse.json(
        { success: false, error: "Archivo no encontrado" },
        { status: 404 }
      );
    }

    await deleteFile(file.storageKey);
    await prisma.crmFile.delete({
      where: { id: fileId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CRM] Error deleting file:", error);
    return NextResponse.json(
      { success: false, error: "Error al eliminar archivo" },
      { status: 500 }
    );
  }
}
