/**
 * API Route: /api/notes/unread-entity-ids
 * GET — Returns entity IDs that have unread notes for the current user.
 *
 * Query params:
 *   contextType: NoteContextType (required) — e.g. "ACCOUNT", "INSTALLATION"
 *
 * Response: { success: true, data: string[] }
 *   data = array of contextIds with at least one unread note
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { isNotesTableMissing, notesNotAvailableResponse } from "@/lib/note-utils";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const contextType = req.nextUrl.searchParams.get("contextType");
    if (!contextType) {
      return NextResponse.json(
        { success: false, error: "contextType is required" },
        { status: 400 },
      );
    }

    // Get the user's read status for this context type
    const readStatuses = await prisma.noteReadStatus.findMany({
      where: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        contextType: contextType as any,
      },
      select: { contextId: true, lastReadAt: true },
    });

    const readMap = new Map<string, Date>();
    for (const rs of readStatuses) {
      if (rs.contextId) {
        readMap.set(rs.contextId, rs.lastReadAt);
      }
    }

    // Find all distinct contextIds of this type that have notes newer than
    // the user's last read (or any notes if never read), excluding user's own notes
    const notesGrouped = await prisma.note.groupBy({
      by: ["contextId"],
      where: {
        tenantId: ctx.tenantId,
        contextType: contextType as any,
        deletedAt: null,
        parentNoteId: null,
        NOT: { authorId: ctx.userId },
        OR: [
          { visibility: "PUBLIC" },
          { visibleToUsers: { has: ctx.userId } },
        ],
      },
      _max: { createdAt: true },
    });

    // Filter to only those with notes newer than last read
    const unreadIds: string[] = [];
    for (const row of notesGrouped) {
      const lastRead = readMap.get(row.contextId);
      const latestNote = row._max.createdAt;
      if (!latestNote) continue;
      if (!lastRead || latestNote > lastRead) {
        unreadIds.push(row.contextId);
      }
    }

    return NextResponse.json({ success: true, data: unreadIds });
  } catch (error) {
    if (isNotesTableMissing(error)) return notesNotAvailableResponse();
    console.error("Error fetching unread entity IDs:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener IDs con notas no leídas" },
      { status: 500 },
    );
  }
}
