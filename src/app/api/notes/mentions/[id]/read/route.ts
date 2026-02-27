/**
 * API Route: /api/notes/mentions/[id]/read
 * PATCH — Mark a single mention as read
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { isNotesTableMissing, notesNotAvailableResponse } from "@/lib/note-utils";

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id } = await params;

    const mention = await prisma.noteMention.findFirst({
      where: {
        id,
        tenantId: ctx.tenantId,
        OR: [
          { mentionedUserId: ctx.userId },
          { mentionType: "ALL" },
        ],
      },
    });

    if (!mention) {
      return NextResponse.json(
        { success: false, error: "Mención no encontrada" },
        { status: 404 },
      );
    }

    if (mention.isRead) {
      return NextResponse.json({ success: true, data: mention });
    }

    const updated = await prisma.noteMention.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (isNotesTableMissing(error)) return notesNotAvailableResponse();
    console.error("Error marking mention as read:", error);
    return NextResponse.json(
      { success: false, error: "Error al marcar mención como leída" },
      { status: 500 },
    );
  }
}
