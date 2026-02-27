/**
 * API Route: /api/notes/[id]
 * PATCH  — Edit a note (author or admin)
 * DELETE — Soft-delete a note (author or admin)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const note = await prisma.note.findFirst({
      where: { id, tenantId: ctx.tenantId, deletedAt: null },
    });

    if (!note) {
      return NextResponse.json(
        { success: false, error: "Nota no encontrada" },
        { status: 404 },
      );
    }

    const isAdmin = ctx.userRole === "owner" || ctx.userRole === "admin";
    if (note.authorId !== ctx.userId && !isAdmin) {
      return NextResponse.json(
        { success: false, error: "Solo puedes editar tus propias notas" },
        { status: 403 },
      );
    }

    const contentChanged = typeof body.content === "string" && body.content.trim() && body.content.trim() !== note.content;
    const content = contentChanged ? body.content.trim() : note.content;

    // Only mark as edited if content actually changed (not for metadata-only updates like task toggle)
    const isEdited = contentChanged ? true : note.isEdited;

    // ── Pin limit: max 3 pinned notes per context ──
    let isPinned = typeof body.isPinned === "boolean" ? body.isPinned : note.isPinned;
    if (isPinned && !note.isPinned) {
      const pinnedCount = await prisma.note.count({
        where: {
          tenantId: ctx.tenantId,
          contextType: note.contextType,
          contextId: note.contextId,
          isPinned: true,
          deletedAt: null,
          id: { not: id },
        },
      });
      if (pinnedCount >= 3) {
        return NextResponse.json(
          { success: false, error: "Máximo 3 notas fijadas por contexto" },
          { status: 400 },
        );
      }
    }

    const updated = await prisma.note.update({
      where: { id },
      data: {
        content,
        contentHtml: typeof body.contentHtml === "string" ? body.contentHtml : note.contentHtml,
        isEdited,
        isPinned,
        metadata: body.metadata !== undefined ? body.metadata : note.metadata,
        attachments: body.attachments !== undefined ? body.attachments : note.attachments,
      },
      include: {
        author: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error updating note:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar nota" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id } = await params;

    const note = await prisma.note.findFirst({
      where: { id, tenantId: ctx.tenantId, deletedAt: null },
    });

    if (!note) {
      return NextResponse.json(
        { success: false, error: "Nota no encontrada" },
        { status: 404 },
      );
    }

    const isAdmin = ctx.userRole === "owner" || ctx.userRole === "admin";
    if (note.authorId !== ctx.userId && !isAdmin) {
      return NextResponse.json(
        { success: false, error: "Solo puedes eliminar tus propias notas" },
        { status: 403 },
      );
    }

    // Soft delete: mark note and all replies
    await prisma.note.updateMany({
      where: {
        tenantId: ctx.tenantId,
        OR: [{ id }, { parentNoteId: id }],
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
        deletedBy: ctx.userId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting note:", error);
    return NextResponse.json(
      { success: false, error: "Error al eliminar nota" },
      { status: 500 },
    );
  }
}
