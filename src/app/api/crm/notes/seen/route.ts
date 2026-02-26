import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

const NOTE_NOTIFICATION_TYPES = [
  "mention",
  "mention_direct",
  "mention_group",
  "note_thread_reply",
] as const;

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const body = await request.json().catch(() => ({}));
    const rawNoteIds: unknown[] = Array.isArray(body.noteIds) ? body.noteIds : [];
    const noteIds = Array.from(
      new Set(
        rawNoteIds
          .map((item) => String(item))
          .filter((item) => item.length > 0)
      )
    );
    const read = typeof body.read === "boolean" ? body.read : true;

    if (noteIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "noteIds es requerido" },
        { status: 400 }
      );
    }

    await Promise.all(
      noteIds.map((noteId) =>
        prisma.notification.updateMany({
          where: {
            tenantId: ctx.tenantId,
            type: { in: [...NOTE_NOTIFICATION_TYPES] },
            AND: [
              {
                OR: [
                  { data: { path: ["targetUserId"], equals: ctx.userId } },
                  {
                    type: "mention",
                    data: { path: ["mentionUserId"], equals: ctx.userId },
                  },
                ],
              },
              {
                OR: [
                  { data: { path: ["noteId"], equals: noteId } },
                  { data: { path: ["rootNoteId"], equals: noteId } },
                ],
              },
            ],
          },
          data: { read },
        })
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating note seen state:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo actualizar estado de lectura de notas" },
      { status: 500 }
    );
  }
}
