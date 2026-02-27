/**
 * API Route: /api/notes/activity
 * GET — Activity feed: notes from followed entities + direct mentions
 *       filter=all|mentions|alerts|decisions|tasks
 *       read=all|true|false
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { CONTEXT_LABELS, buildNoteContextLink } from "@/lib/note-utils";
import type { NoteContextType, NoteType, Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const sp = request.nextUrl.searchParams;
    const filter = sp.get("filter") || "all"; // all|mentions|alerts|decisions|tasks
    const readParam = sp.get("read") || "all"; // all|true|false
    const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(sp.get("limit") || "30", 10)));
    const offset = (page - 1) * limit;

    // Get followed contexts
    const followers = await prisma.entityFollower.findMany({
      where: { tenantId: ctx.tenantId, userId: ctx.userId },
      select: { contextType: true, contextId: true },
    });

    // Build where clause
    const conditions: Prisma.NoteWhereInput[] = [];

    // Notes from followed contexts
    if (followers.length > 0) {
      const contextGroups: Prisma.NoteWhereInput[] = followers.map((f) => ({
        contextType: f.contextType,
        contextId: f.contextId,
      }));

      conditions.push({ OR: contextGroups });
    }

    // Direct mentions (always included)
    conditions.push({
      mentions: {
        some: {
          OR: [
            { mentionedUserId: ctx.userId },
            { mentionType: "ALL" },
          ],
        },
      },
    });

    if (conditions.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        meta: { total: 0, page, limit, totalPages: 0 },
      });
    }

    const where: Prisma.NoteWhereInput = {
      tenantId: ctx.tenantId,
      deletedAt: null,
      parentNoteId: null, // root notes only
      OR: conditions,
    };

    // Filter by note type
    if (filter === "mentions") {
      where.mentions = {
        some: {
          OR: [
            { mentionedUserId: ctx.userId },
            { mentionType: "ALL" },
          ],
        },
      };
    } else if (filter === "alerts") {
      where.noteType = "ALERT";
    } else if (filter === "decisions") {
      where.noteType = "DECISION";
    } else if (filter === "tasks") {
      where.noteType = "TASK";
    }

    // Read filter
    if (readParam === "false") {
      // Get read statuses for user
      const readStatuses = await prisma.noteReadStatus.findMany({
        where: { tenantId: ctx.tenantId, userId: ctx.userId },
        select: { contextType: true, contextId: true, lastReadAt: true },
      });
      const readMap = new Map<string, Date>();
      for (const rs of readStatuses) {
        if (rs.contextType && rs.contextId) {
          readMap.set(`${rs.contextType}:${rs.contextId}`, rs.lastReadAt);
        }
      }
      // Only show notes newer than lastReadAt
      if (readMap.size > 0) {
        const unreadConditions: Prisma.NoteWhereInput[] = [];
        for (const [key, lastRead] of readMap) {
          const [ct, ci] = key.split(":");
          unreadConditions.push({
            contextType: ct as NoteContextType,
            contextId: ci,
            createdAt: { gt: lastRead },
          });
        }
        // Also include contexts with no read status
        const readContextKeys = new Set(readMap.keys());
        unreadConditions.push({
          NOT: {
            AND: followers
              .filter((f) => readContextKeys.has(`${f.contextType}:${f.contextId}`))
              .map((f) => ({
                contextType: f.contextType,
                contextId: f.contextId,
              })),
          },
        } as any);
        where.AND = [{ OR: unreadConditions }];
      }
    }

    // Visibility check
    const isFullAdmin = ctx.userRole === "owner" || ctx.userRole === "admin";
    if (!isFullAdmin) {
      const visFilter: Prisma.NoteWhereInput = {
        OR: [
          { visibility: "PUBLIC" },
          { authorId: ctx.userId },
          { visibleToUsers: { has: ctx.userId } },
        ],
      };
      where.AND = [...(Array.isArray(where.AND) ? where.AND : []), visFilter];
    }

    const [notes, total] = await Promise.all([
      prisma.note.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
        include: {
          author: { select: { id: true, name: true, email: true } },
          _count: { select: { replies: true, reactions: true } },
          mentions: {
            select: {
              id: true,
              mentionType: true,
              mentionedUserId: true,
              isRead: true,
            },
          },
        },
      }),
      prisma.note.count({ where }),
    ]);

    // Enrich with context labels & links
    const enriched = notes.map((note) => ({
      ...note,
      contextLabel: CONTEXT_LABELS[note.contextType] ?? note.contextType,
      contextLink: buildNoteContextLink(note.contextType, note.contextId),
      replyCount: note._count.replies,
      reactionCount: note._count.reactions,
      isMentioned: note.mentions.some(
        (m) => m.mentionedUserId === ctx.userId || m.mentionType === "ALL",
      ),
    }));

    return NextResponse.json({
      success: true,
      data: enriched,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Error fetching activity feed:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener actividad" },
      { status: 500 },
    );
  }
}
