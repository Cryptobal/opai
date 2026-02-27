/**
 * API Route: /api/notes/following
 * GET — List entities the current user is following
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { isNotesTableMissing, notesNotAvailableResponse } from "@/lib/note-utils";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const followers = await prisma.entityFollower.findMany({
      where: { tenantId: ctx.tenantId, userId: ctx.userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        contextType: true,
        contextId: true,
        autoFollow: true,
        notifyOnAll: true,
        notifyOnMention: true,
        notifyOnAlert: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, data: followers });
  } catch (error) {
    if (isNotesTableMissing(error)) return notesNotAvailableResponse();
    console.error("Error listing followed entities:", error);
    return NextResponse.json(
      { success: false, error: "Error al listar entidades seguidas" },
      { status: 500 },
    );
  }
}
