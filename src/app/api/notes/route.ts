/**
 * API Route: /api/notes
 * GET  — List notes for a context (query: contextType, contextId, page, limit)
 * POST — Create a note or thread reply
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasModuleAccess } from "@/lib/permissions";
import {
  isValidContextType,
  getContextModule,
  buildNoteContextLink,
  extractEntityReferences,
  CONTEXT_LABELS,
} from "@/lib/note-utils";
import {
  resolveMentionsFromContent,
  type NoteMentionUser,
  type NoteMentionGroup,
} from "@/lib/crm-note-utils";
import type { NoteContextType, NoteVisibility, Prisma } from "@prisma/client";

// ── GET — List notes ──

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const sp = request.nextUrl.searchParams;
    const contextType = sp.get("contextType") ?? "";
    const contextId = sp.get("contextId") ?? "";
    const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(sp.get("limit") || "20", 10)));
    const offset = (page - 1) * limit;

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

    // Permission check: user needs access to the module of this context
    const perms = await resolveApiPerms(ctx);
    const module = getContextModule(contextType as NoteContextType);
    if (!hasModuleAccess(perms, module as any)) {
      return NextResponse.json(
        { success: false, error: `Sin permisos para módulo ${module.toUpperCase()}` },
        { status: 403 },
      );
    }

    // Visibility filter: PUBLIC + notes where user is author or in visibleToUsers
    // Admins with role owner/admin see everything
    const isFullAdmin = ctx.userRole === "owner" || ctx.userRole === "admin";

    const visibilityFilter: Prisma.NoteWhereInput = isFullAdmin
      ? {}
      : {
          OR: [
            { visibility: "PUBLIC" },
            { authorId: ctx.userId },
            { visibleToUsers: { has: ctx.userId } },
          ],
        };

    const where: Prisma.NoteWhereInput = {
      tenantId: ctx.tenantId,
      contextType: contextType as NoteContextType,
      contextId,
      parentNoteId: null, // only root notes
      deletedAt: null,
      ...visibilityFilter,
    };

    const [notes, total] = await Promise.all([
      prisma.note.findMany({
        where,
        orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
        skip: offset,
        take: limit,
        include: {
          author: { select: { id: true, name: true, email: true } },
          replies: {
            where: { deletedAt: null },
            orderBy: { createdAt: "asc" },
            include: {
              author: { select: { id: true, name: true, email: true } },
              reactions: {
                select: { id: true, emoji: true, userId: true },
              },
              mentions: {
                select: {
                  id: true,
                  mentionType: true,
                  mentionedUserId: true,
                  mentionedRole: true,
                },
              },
              entityRefs: {
                select: {
                  id: true,
                  referencedEntityType: true,
                  referencedEntityId: true,
                  referencedEntityLabel: true,
                  referencedEntityCode: true,
                },
              },
            },
          },
          reactions: {
            select: { id: true, emoji: true, userId: true },
          },
          mentions: {
            select: {
              id: true,
              mentionType: true,
              mentionedUserId: true,
              mentionedRole: true,
            },
          },
          entityRefs: {
            select: {
              id: true,
              referencedEntityType: true,
              referencedEntityId: true,
              referencedEntityLabel: true,
              referencedEntityCode: true,
            },
          },
        },
      }),
      prisma.note.count({ where }),
    ]);

    // Group reactions by emoji for convenience
    const enriched = notes.map((note) => ({
      ...note,
      replyCount: note.replies.length,
      reactionSummary: groupReactions(note.reactions),
      replies: note.replies.map((reply) => ({
        ...reply,
        reactionSummary: groupReactions(reply.reactions),
      })),
    }));

    return NextResponse.json({
      success: true,
      data: enriched,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Error listing notes:", error);
    return NextResponse.json(
      { success: false, error: "Error al listar notas" },
      { status: 500 },
    );
  }
}

// ── POST — Create note ──

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const body = await request.json().catch(() => ({}));
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) {
      return NextResponse.json(
        { success: false, error: "content es requerido" },
        { status: 400 },
      );
    }

    const parentNoteId =
      typeof body.parentNoteId === "string" && body.parentNoteId.trim()
        ? body.parentNoteId.trim()
        : null;

    let contextType: NoteContextType;
    let contextId: string;
    let visibility: NoteVisibility = body.visibility ?? "PUBLIC";
    let visibleToUsers: string[] = Array.isArray(body.visibleToUsers) ? body.visibleToUsers : [];
    let threadDepth = 0;

    // ── If reply, inherit context & visibility from parent ──
    if (parentNoteId) {
      const parent = await prisma.note.findFirst({
        where: { id: parentNoteId, tenantId: ctx.tenantId, deletedAt: null },
      });
      if (!parent) {
        return NextResponse.json(
          { success: false, error: "Nota padre no encontrada" },
          { status: 404 },
        );
      }
      // Replies always go to the root (max 1 level deep)
      const rootId = parent.parentNoteId ?? parent.id;
      const root = parent.parentNoteId
        ? await prisma.note.findFirst({
            where: { id: rootId, tenantId: ctx.tenantId },
          })
        : parent;
      if (!root) {
        return NextResponse.json(
          { success: false, error: "Hilo raíz no encontrado" },
          { status: 404 },
        );
      }
      contextType = root.contextType;
      contextId = root.contextId;
      visibility = root.visibility;
      visibleToUsers = root.visibleToUsers;
      threadDepth = 1;
    } else {
      // ── New root note ──
      const rawContextType = typeof body.contextType === "string" ? body.contextType : "";
      const rawContextId = typeof body.contextId === "string" ? body.contextId : "";
      if (!rawContextType || !rawContextId) {
        return NextResponse.json(
          { success: false, error: "contextType y contextId son requeridos" },
          { status: 400 },
        );
      }
      if (!isValidContextType(rawContextType)) {
        return NextResponse.json(
          { success: false, error: "contextType inválido" },
          { status: 400 },
        );
      }
      contextType = rawContextType as NoteContextType;
      contextId = rawContextId;
    }

    // ── Permission check ──
    const perms = await resolveApiPerms(ctx);
    const module = getContextModule(contextType);
    if (!hasModuleAccess(perms, module as any)) {
      return NextResponse.json(
        { success: false, error: `Sin permisos para módulo ${module.toUpperCase()}` },
        { status: 403 },
      );
    }

    // ── Validate noteType permissions ──
    const noteType = body.noteType ?? "GENERAL";
    if (!["GENERAL", "ALERT", "DECISION", "TASK"].includes(noteType)) {
      return NextResponse.json(
        { success: false, error: "noteType inválido" },
        { status: 400 },
      );
    }

    // ── Validate visibility ──
    if (!["PUBLIC", "PRIVATE", "GROUP"].includes(visibility)) {
      return NextResponse.json(
        { success: false, error: "visibility inválido" },
        { status: 400 },
      );
    }
    if ((visibility === "PRIVATE" || visibility === "GROUP") && visibleToUsers.length === 0 && !parentNoteId) {
      return NextResponse.json(
        { success: false, error: "visibleToUsers es requerido para notas PRIVATE/GROUP" },
        { status: 400 },
      );
    }

    // ── Resolve mentions ──
    const [users, groups] = await Promise.all([
      prisma.admin.findMany({
        where: { tenantId: ctx.tenantId, status: "active" },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      }),
      prisma.adminGroup.findMany({
        where: { tenantId: ctx.tenantId, isActive: true },
        select: {
          id: true,
          name: true,
          slug: true,
          memberships: {
            where: { admin: { tenantId: ctx.tenantId, status: "active" } },
            select: { adminId: true },
          },
        },
        orderBy: { name: "asc" },
      }),
    ]);

    const mentionUsers: NoteMentionUser[] = users;
    const mentionGroups: NoteMentionGroup[] = groups.map((g) => ({
      id: g.id,
      name: g.name,
      slug: g.slug,
      memberIds: g.memberships.map((m) => m.adminId),
    }));

    const mentionResolution = resolveMentionsFromContent(
      content,
      mentionUsers,
      mentionGroups,
      ctx.userId,
    );

    // ── Extract entity references ──
    const entityRefs = extractEntityReferences(content);
    // Client may provide labels: { "ACCOUNT:uuid": { label: "Acme", code: "RUT" } }
    const entityRefLabels: Record<string, { label?: string; code?: string | null }> =
      typeof body.entityRefLabels === "object" && body.entityRefLabels !== null
        ? body.entityRefLabels
        : {};

    // ── Create note + mentions + entity refs in transaction ──
    const rootNoteId = parentNoteId ?? undefined;
    const note = await prisma.$transaction(async (tx) => {
      const created = await tx.note.create({
        data: {
          tenantId: ctx.tenantId,
          contextType,
          contextId,
          authorId: ctx.userId,
          content,
          contentHtml: typeof body.contentHtml === "string" ? body.contentHtml : null,
          noteType: noteType as any,
          visibility,
          visibleToUsers,
          parentNoteId: rootNoteId ?? null,
          threadDepth,
          metadata: body.metadata ?? null,
          attachments: body.attachments ?? null,
        },
        include: {
          author: { select: { id: true, name: true, email: true } },
        },
      });

      // Create NoteMention rows
      const mentionData: Prisma.NoteMentionCreateManyInput[] = [];

      if (mentionResolution.mentionAll) {
        mentionData.push({
          tenantId: ctx.tenantId,
          noteId: created.id,
          mentionType: "ALL",
        });
      }

      for (const userId of mentionResolution.userMentionIds) {
        mentionData.push({
          tenantId: ctx.tenantId,
          noteId: created.id,
          mentionType: "USER",
          mentionedUserId: userId,
        });
      }

      if (mentionData.length > 0) {
        await tx.noteMention.createMany({ data: mentionData });
      }

      // Create NoteEntityReference rows
      if (entityRefs.length > 0) {
        await tx.noteEntityReference.createMany({
          data: entityRefs.map((ref) => {
            const key = `${ref.type}:${ref.id}`;
            const clientLabel = entityRefLabels[key];
            return {
              tenantId: ctx.tenantId,
              noteId: created.id,
              referencedEntityType: ref.type,
              referencedEntityId: ref.id,
              referencedEntityLabel: clientLabel?.label || CONTEXT_LABELS[ref.type] || ref.type,
              referencedEntityCode: clientLabel?.code ?? null,
            };
          }),
        });
      }

      // Auto-follow: create EntityFollower for author if not exists
      await tx.entityFollower.upsert({
        where: {
          tenantId_userId_contextType_contextId: {
            tenantId: ctx.tenantId,
            userId: ctx.userId,
            contextType,
            contextId,
          },
        },
        create: {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          contextType,
          contextId,
          autoFollow: true,
        },
        update: {}, // no-op if already exists
      });

      return created;
    });

    // ── Send notifications asynchronously (don't block response) ──
    if (mentionResolution.resolvedRecipientIds.length > 0 || parentNoteId) {
      sendNoteNotifications({
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        actorName: note.author.name,
        contextType,
        contextId,
        noteId: note.id,
        rootNoteId: rootNoteId ?? note.id,
        content,
        mentionResolution,
        isReply: !!parentNoteId,
      }).catch((err) => console.error("Error sending note notifications:", err));
    }

    return NextResponse.json({
      success: true,
      data: {
        ...note,
        replies: [],
        reactions: [],
        replyCount: 0,
        reactionSummary: [],
      },
    });
  } catch (error) {
    console.error("Error creating note:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear nota" },
      { status: 500 },
    );
  }
}

// ── Helpers ──

function groupReactions(
  reactions: Array<{ id: string; emoji: string; userId: string }>,
): Array<{ emoji: string; count: number; userIds: string[] }> {
  const map = new Map<string, string[]>();
  for (const r of reactions) {
    const list = map.get(r.emoji) || [];
    list.push(r.userId);
    map.set(r.emoji, list);
  }
  return Array.from(map.entries()).map(([emoji, userIds]) => ({
    emoji,
    count: userIds.length,
    userIds,
  }));
}

async function sendNoteNotifications(input: {
  tenantId: string;
  actorUserId: string;
  actorName: string;
  contextType: NoteContextType;
  contextId: string;
  noteId: string;
  rootNoteId: string;
  content: string;
  mentionResolution: ReturnType<typeof resolveMentionsFromContent>;
  isReply: boolean;
}) {
  const { sendNotificationToUser } = await import("@/lib/notification-service");
  const link = buildNoteContextLink(input.contextType, input.contextId);
  const contextLabel = CONTEXT_LABELS[input.contextType] ?? input.contextType;
  const directMentionSet = new Set(input.mentionResolution.userMentionIds);

  // Send mention notifications
  await Promise.allSettled(
    input.mentionResolution.resolvedRecipientIds.map((targetUserId) => {
      const isDirect =
        !input.mentionResolution.mentionAll && directMentionSet.has(targetUserId);
      const type = isDirect ? "mention_direct" : "mention_group";
      const title = isDirect
        ? `${input.actorName} te mencionó en ${contextLabel}`
        : input.mentionResolution.mentionAll
          ? `${input.actorName} mencionó a @Todos en ${contextLabel}`
          : `${input.actorName} te mencionó en una nota grupal`;

      return sendNotificationToUser({
        tenantId: input.tenantId,
        type,
        title,
        message: input.content.slice(0, 220),
        emailMessage: input.content,
        link,
        data: {
          noteId: input.rootNoteId,
          rootNoteId: input.rootNoteId,
          replyNoteId: input.noteId !== input.rootNoteId ? input.noteId : null,
          entityType: input.contextType,
          entityId: input.contextId,
          authorId: input.actorUserId,
        },
        targetUserId,
      });
    }),
  );

  // Send thread reply notifications to participants (excluding already-mentioned)
  if (input.isReply) {
    const excluded = new Set(input.mentionResolution.resolvedRecipientIds);
    excluded.add(input.actorUserId);

    const participants = await prisma.note.findMany({
      where: {
        tenantId: input.tenantId,
        OR: [{ id: input.rootNoteId }, { parentNoteId: input.rootNoteId }],
        deletedAt: null,
      },
      select: { authorId: true },
    });

    const recipients = [...new Set(participants.map((p) => p.authorId))].filter(
      (uid) => !excluded.has(uid),
    );

    await Promise.allSettled(
      recipients.map((targetUserId) =>
        sendNotificationToUser({
          tenantId: input.tenantId,
          type: "note_thread_reply",
          title: `${input.actorName} respondió en un hilo (${contextLabel})`,
          message: input.content.slice(0, 220),
          emailMessage: input.content,
          link,
          data: {
            noteId: input.rootNoteId,
            rootNoteId: input.rootNoteId,
            replyNoteId: input.noteId,
            entityType: input.contextType,
            entityId: input.contextId,
            authorId: input.actorUserId,
          },
          targetUserId,
        }),
      ),
    );
  }
}
