/**
 * API Route: /api/notes/follow
 * POST — Follow an entity context for note notifications
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { isValidContextType, isNotesTableMissing, notesNotAvailableResponse } from "@/lib/note-utils";
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

    const follower = await prisma.entityFollower.upsert({
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
        autoFollow: false,
        notifyOnAll: body.notifyOnAll ?? true,
        notifyOnMention: body.notifyOnMention ?? true,
        notifyOnAlert: body.notifyOnAlert ?? true,
      },
      update: {
        notifyOnAll: body.notifyOnAll ?? undefined,
        notifyOnMention: body.notifyOnMention ?? undefined,
        notifyOnAlert: body.notifyOnAlert ?? undefined,
      },
    });

    return NextResponse.json({ success: true, data: follower });
  } catch (error) {
    if (isNotesTableMissing(error)) return notesNotAvailableResponse();
    console.error("Error following entity:", error);
    return NextResponse.json(
      { success: false, error: "Error al seguir entidad" },
      { status: 500 },
    );
  }
}
