/**
 * API Route: /api/notes/unread-counts
 * GET — Unread note counts for the current user across followed contexts
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import type { NoteContextType } from "@prisma/client";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    // Get all contexts the user follows
    const followers = await prisma.entityFollower.findMany({
      where: { tenantId: ctx.tenantId, userId: ctx.userId },
      select: { contextType: true, contextId: true },
    });

    if (followers.length === 0) {
      return NextResponse.json({
        success: true,
        data: { total: 0, byContext: {}, byModule: {} },
      });
    }

    // Get read statuses
    const readStatuses = await prisma.noteReadStatus.findMany({
      where: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
      },
      select: { contextType: true, contextId: true, lastReadAt: true },
    });

    const readMap = new Map<string, Date>();
    for (const rs of readStatuses) {
      if (rs.contextType && rs.contextId) {
        readMap.set(`${rs.contextType}:${rs.contextId}`, rs.lastReadAt);
      }
    }

    // Count unread notes per context in a single query
    // Build OR conditions for each followed context
    const orConditions = followers.map((f) => {
      const lastRead = readMap.get(`${f.contextType}:${f.contextId}`);
      return {
        contextType: f.contextType,
        contextId: f.contextId,
        ...(lastRead ? { createdAt: { gt: lastRead } } : {}),
      };
    });

    const unreadNotes = await prisma.note.groupBy({
      by: ["contextType", "contextId"],
      where: {
        tenantId: ctx.tenantId,
        deletedAt: null,
        parentNoteId: null,
        NOT: { authorId: ctx.userId },
        AND: [
          { OR: orConditions },
          { OR: [
            { visibility: "PUBLIC" },
            { visibleToUsers: { has: ctx.userId } },
          ]},
        ],
      },
      _count: { id: true },
    });

    // Build response
    const byContext: Record<string, number> = {};
    const byModule: Record<string, number> = {};
    let total = 0;

    for (const row of unreadNotes) {
      const key = `${row.contextType.toLowerCase()}_${row.contextId}`;
      const count = row._count.id;
      byContext[key] = count;
      total += count;

      const moduleKey = row.contextType.toLowerCase();
      byModule[moduleKey] = (byModule[moduleKey] || 0) + count;
    }

    return NextResponse.json({
      success: true,
      data: { total, byContext, byModule },
    });
  } catch (error) {
    console.error("Error fetching unread counts:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener conteos de no leídas" },
      { status: 500 },
    );
  }
}
