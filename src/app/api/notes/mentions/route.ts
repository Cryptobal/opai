/**
 * API Route: /api/notes/mentions
 * GET — List mentions for the current user
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { isNotesTableMissing, notesNotAvailableResponse } from "@/lib/note-utils";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const sp = request.nextUrl.searchParams;
    const readFilter = sp.get("read"); // "true" | "false" | null (all)
    const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(sp.get("limit") || "20", 10)));
    const offset = (page - 1) * limit;

    const where: any = {
      tenantId: ctx.tenantId,
      note: { deletedAt: null },
      OR: [
        { mentionedUserId: ctx.userId },
        { mentionType: "ALL" },
      ],
    };

    if (readFilter === "true") where.isRead = true;
    if (readFilter === "false") where.isRead = false;

    const [mentions, total] = await Promise.all([
      prisma.noteMention.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
        include: {
          note: {
            select: {
              id: true,
              contextType: true,
              contextId: true,
              content: true,
              noteType: true,
              parentNoteId: true,
              createdAt: true,
              author: { select: { id: true, name: true, email: true } },
            },
          },
        },
      }),
      prisma.noteMention.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: mentions,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    if (isNotesTableMissing(error)) return notesNotAvailableResponse();
    console.error("Error listing mentions:", error);
    return NextResponse.json(
      { success: false, error: "Error al listar menciones" },
      { status: 500 },
    );
  }
}
