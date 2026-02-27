/**
 * API Route: /api/notes/unfollow
 * DELETE — Stop following an entity context
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { isValidContextType } from "@/lib/note-utils";
import type { NoteContextType } from "@prisma/client";

export async function DELETE(request: NextRequest) {
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

    await prisma.entityFollower.deleteMany({
      where: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        contextType: contextType as NoteContextType,
        contextId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error unfollowing entity:", error);
    return NextResponse.json(
      { success: false, error: "Error al dejar de seguir entidad" },
      { status: 500 },
    );
  }
}
