/**
 * API Route: /api/notes/[id]/reactions
 * POST — Toggle reaction (add if not exists, remove if exists)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id: noteId } = await params;
    const body = await request.json().catch(() => ({}));
    const emoji = typeof body.emoji === "string" ? body.emoji.trim() : "";

    if (!emoji) {
      return NextResponse.json(
        { success: false, error: "emoji es requerido" },
        { status: 400 },
      );
    }

    // Validate note exists and belongs to tenant
    const note = await prisma.note.findFirst({
      where: { id: noteId, tenantId: ctx.tenantId, deletedAt: null },
      select: { id: true },
    });

    if (!note) {
      return NextResponse.json(
        { success: false, error: "Nota no encontrada" },
        { status: 404 },
      );
    }

    // Toggle: check if reaction exists
    const existing = await prisma.noteReaction.findFirst({
      where: {
        tenantId: ctx.tenantId,
        noteId,
        userId: ctx.userId,
        emoji,
      },
    });

    if (existing) {
      await prisma.noteReaction.delete({ where: { id: existing.id } });
      return NextResponse.json({ success: true, action: "removed" });
    }

    const reaction = await prisma.noteReaction.create({
      data: {
        tenantId: ctx.tenantId,
        noteId,
        userId: ctx.userId,
        emoji,
      },
    });

    return NextResponse.json({ success: true, action: "added", data: reaction });
  } catch (error) {
    console.error("Error toggling reaction:", error);
    return NextResponse.json(
      { success: false, error: "Error al procesar reacción" },
      { status: 500 },
    );
  }
}
