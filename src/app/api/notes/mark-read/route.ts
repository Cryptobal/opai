/**
 * API Route: /api/notes/mark-read
 * POST — Mark notes as read for the current user in a context
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { isValidContextType } from "@/lib/note-utils";
import type { NoteContextType } from "@prisma/client";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const body = await request.json().catch(() => ({}));
    const contextType = typeof body.contextType === "string" ? body.contextType : "";
    const contextId = typeof body.contextId === "string" ? body.contextId : "";

    if (!contextType || !contextId) {
      return NextResponse.json(
        { success: false, error: "contextType y contextId son requeridos" },
        { status: 400 },
      );
    }
    if (!isValidContextType(contextType)) {
      return NextResponse.json(
        { success: false, error: "contextType inválido" },
        { status: 400 },
      );
    }

    const now = new Date();

    await prisma.noteReadStatus.upsert({
      where: {
        tenantId_userId_contextType_contextId: {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          contextType: contextType as NoteContextType,
          contextId,
        },
      },
      create: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        contextType: contextType as NoteContextType,
        contextId,
        lastReadAt: now,
      },
      update: {
        lastReadAt: now,
      },
    });

    // Also mark pending mentions as read
    await prisma.noteMention.updateMany({
      where: {
        tenantId: ctx.tenantId,
        mentionedUserId: ctx.userId,
        isRead: false,
        note: {
          contextType: contextType as NoteContextType,
          contextId,
          deletedAt: null,
        },
      },
      data: {
        isRead: true,
        readAt: now,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error marking notes as read:", error);
    return NextResponse.json(
      { success: false, error: "Error al marcar como leído" },
      { status: 500 },
    );
  }
}
