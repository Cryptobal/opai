/**
 * API Route: /api/crm/notes
 * GET  - List notes for an entity (query: entityType, entityId)
 * POST - Create a new note or a thread reply
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import {
  buildNoteDeepLink,
  resolveMentionsFromContent,
  type NoteMentionGroup,
  type NoteMentionUser,
} from "@/lib/crm-note-utils";

const VALID_ENTITY_TYPES = [
  "account",
  "contact",
  "deal",
  "quote",
  "installation",
  "ops_guardia",
  "installation_pauta",
] as const;
type ValidEntityType = (typeof VALID_ENTITY_TYPES)[number];

type EnrichedNote = {
  id: string;
  tenantId: string;
  entityType: string;
  entityId: string;
  parentId: string | null;
  content: string;
  mentions: string[];
  mentionMeta: unknown;
  createdBy: string;
  updatedAt: Date;
  createdAt: Date;
  author: { id: string; name: string; email: string };
  mentionNames: string[];
};

async function fetchMentionDirectory(tenantId: string): Promise<{
  users: NoteMentionUser[];
  groups: NoteMentionGroup[];
}> {
  const [users, groups] = await Promise.all([
    prisma.admin.findMany({
      where: { tenantId, status: "active" },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.adminGroup.findMany({
      where: { tenantId, isActive: true },
      select: {
        id: true,
        name: true,
        slug: true,
        memberships: {
          where: {
            admin: {
              tenantId,
              status: "active",
            },
          },
          select: {
            adminId: true,
          },
        },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    users,
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      slug: group.slug,
      memberIds: group.memberships.map((membership) => membership.adminId),
    })),
  };
}

async function enrichNotes(
  tenantId: string,
  notes: Array<{
    id: string;
    tenantId: string;
    entityType: string;
    entityId: string;
    parentId: string | null;
    content: string;
    mentions: string[];
    mentionMeta: unknown;
    createdBy: string;
    updatedAt: Date;
    createdAt: Date;
  }>
): Promise<EnrichedNote[]> {
  const authorIds = [...new Set(notes.map((note) => note.createdBy))];
  const mentionIds = [...new Set(notes.flatMap((note) => note.mentions))];

  const [authors, mentionedUsers] = await Promise.all([
    authorIds.length > 0
      ? prisma.admin.findMany({
          where: { id: { in: authorIds }, tenantId },
          select: { id: true, name: true, email: true },
        })
      : Promise.resolve([]),
    mentionIds.length > 0
      ? prisma.admin.findMany({
          where: { id: { in: mentionIds }, tenantId },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const authorMap = Object.fromEntries(authors.map((author) => [author.id, author]));
  const mentionMap = Object.fromEntries(mentionedUsers.map((user) => [user.id, user.name]));

  return notes.map((note) => ({
    ...note,
    author: authorMap[note.createdBy] || { id: note.createdBy, name: "Usuario", email: "" },
    mentionNames: note.mentions.map((id) => mentionMap[id] || "Usuario"),
  }));
}

async function sendMentionNotifications(input: {
  tenantId: string;
  actorUserId: string;
  actorName: string;
  entityType: ValidEntityType;
  entityId: string;
  rootNoteId: string;
  noteId: string;
  content: string;
  mentionResolution: ReturnType<typeof resolveMentionsFromContent>;
}) {
  const {
    tenantId,
    actorUserId,
    actorName,
    entityType,
    entityId,
    rootNoteId,
    noteId,
    content,
    mentionResolution,
  } = input;

  if (mentionResolution.resolvedRecipientIds.length === 0) return;

  const { sendNotificationToUser } = await import("@/lib/notification-service");
  const directMentionSet = new Set(mentionResolution.userMentionIds);

  await Promise.allSettled(
    mentionResolution.resolvedRecipientIds.map((targetUserId) => {
      const isDirect = !mentionResolution.mentionAll && directMentionSet.has(targetUserId);
      const type = isDirect ? "mention_direct" : "mention_group";
      const title = isDirect
        ? `${actorName} te mencionó en una nota`
        : mentionResolution.mentionAll
          ? `${actorName} mencionó a @Todos en una nota`
          : `${actorName} te mencionó en una nota grupal`;
      const link = buildNoteDeepLink({
        entityType,
        entityId,
        noteId,
        rootNoteId,
        focusReply: true,
      });

      return sendNotificationToUser({
        tenantId,
        type,
        title,
        message: content.slice(0, 220),
        emailMessage: content,
        link,
        data: {
          noteId: rootNoteId,
          rootNoteId,
          replyNoteId: noteId !== rootNoteId ? noteId : null,
          entityType,
          entityId,
          mentionAll: mentionResolution.mentionAll,
          mentionedUserIds: mentionResolution.userMentionIds,
          mentionedGroupIds: mentionResolution.groupMentionIds,
          authorId: actorUserId,
        },
        targetUserId,
      });
    })
  );
}

async function sendThreadReplyNotifications(input: {
  tenantId: string;
  actorUserId: string;
  actorName: string;
  entityType: ValidEntityType;
  entityId: string;
  rootNoteId: string;
  noteId: string;
  content: string;
  excludedUserIds: string[];
}) {
  const {
    tenantId,
    actorUserId,
    actorName,
    entityType,
    entityId,
    rootNoteId,
    noteId,
    content,
    excludedUserIds,
  } = input;
  const excluded = new Set(excludedUserIds);
  excluded.add(actorUserId);

  const participants = await prisma.crmNote.findMany({
    where: {
      tenantId,
      OR: [{ id: rootNoteId }, { parentId: rootNoteId }],
    },
    select: { createdBy: true },
  });
  const recipients = [...new Set(participants.map((item) => item.createdBy))].filter(
    (userId) => !excluded.has(userId)
  );
  if (recipients.length === 0) return;

  const { sendNotificationToUser } = await import("@/lib/notification-service");
  const link = buildNoteDeepLink({
    entityType,
    entityId,
    noteId,
    rootNoteId,
    focusReply: true,
  });

  await Promise.allSettled(
    recipients.map((targetUserId) =>
      sendNotificationToUser({
        tenantId,
        type: "note_thread_reply",
        title: `${actorName} respondió en un hilo`,
        message: content.slice(0, 220),
        emailMessage: content,
        link,
        data: {
          noteId: rootNoteId,
          rootNoteId,
          replyNoteId: noteId,
          entityType,
          entityId,
          authorId: actorUserId,
        },
        targetUserId,
      })
    )
  );
}

export async function GET(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entityType");
  const entityId = searchParams.get("entityId");

  if (!entityType || !entityId) {
    return NextResponse.json(
      { success: false, error: "entityType y entityId son requeridos" },
      { status: 400 }
    );
  }

  const notes = await prisma.crmNote.findMany({
    where: {
      tenantId: ctx.tenantId,
      entityType,
      entityId,
    },
    orderBy: { createdAt: "desc" },
  });
  const enriched = await enrichNotes(ctx.tenantId, notes);

  const repliesByParent = new Map<string, EnrichedNote[]>();
  for (const note of enriched) {
    if (!note.parentId) continue;
    const list = repliesByParent.get(note.parentId) || [];
    list.push(note);
    repliesByParent.set(note.parentId, list);
  }

  const threaded = enriched
    .filter((note) => !note.parentId)
    .map((note) => ({
      ...note,
      replies: (repliesByParent.get(note.id) || []).sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
      ),
    }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return NextResponse.json({ success: true, data: threaded });
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const body = await request.json().catch(() => ({}));
    const parentId = typeof body.parentId === "string" && body.parentId.trim()
      ? body.parentId.trim()
      : null;
    const content = typeof body.content === "string" ? body.content.trim() : "";

    if (!content) {
      return NextResponse.json(
        { success: false, error: "content es requerido" },
        { status: 400 }
      );
    }

    let entityType = typeof body.entityType === "string" ? body.entityType : "";
    let entityId = typeof body.entityId === "string" ? body.entityId : "";
    let rootNoteId: string | null = null;

    if (parentId) {
      const parent = await prisma.crmNote.findFirst({
        where: { id: parentId, tenantId: ctx.tenantId },
      });
      if (!parent) {
        return NextResponse.json(
          { success: false, error: "Nota padre no encontrada" },
          { status: 404 }
        );
      }
      const root =
        parent.parentId
          ? await prisma.crmNote.findFirst({
              where: { id: parent.parentId, tenantId: ctx.tenantId },
            })
          : parent;

      if (!root) {
        return NextResponse.json(
          { success: false, error: "No se encontró el hilo de la nota" },
          { status: 404 }
        );
      }
      rootNoteId = root.id;
      entityType = root.entityType;
      entityId = root.entityId;
    }

    if (!entityType || !entityId) {
      return NextResponse.json(
        { success: false, error: "entityType y entityId son requeridos" },
        { status: 400 }
      );
    }

    if (!VALID_ENTITY_TYPES.includes(entityType as ValidEntityType)) {
      return NextResponse.json(
        { success: false, error: "entityType inválido" },
        { status: 400 }
      );
    }

    try {
      const mentionDirectory = await fetchMentionDirectory(ctx.tenantId);
      const mentionResolution = resolveMentionsFromContent(
        content,
        mentionDirectory.users,
        mentionDirectory.groups,
        ctx.userId
      );

      const threadRootId = rootNoteId ?? "";
      const note = await prisma.crmNote.create({
        data: {
          tenantId: ctx.tenantId,
          entityType,
          entityId: String(entityId),
          parentId: rootNoteId,
          content,
          mentions: mentionResolution.resolvedRecipientIds,
          mentionMeta: mentionResolution.metadata as any,
          createdBy: ctx.userId,
        },
      });
      const effectiveRootNoteId = threadRootId || note.id;

      const author = await prisma.admin.findUnique({
        where: { id: ctx.userId },
        select: { id: true, name: true, email: true },
      });
      const authorName = author?.name || ctx.userEmail || "Alguien";

      await sendMentionNotifications({
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        actorName: authorName,
        entityType: entityType as ValidEntityType,
        entityId: String(entityId),
        rootNoteId: effectiveRootNoteId,
        noteId: note.id,
        content,
        mentionResolution,
      });

      if (rootNoteId) {
        await sendThreadReplyNotifications({
          tenantId: ctx.tenantId,
          actorUserId: ctx.userId,
          actorName: authorName,
          entityType: entityType as ValidEntityType,
          entityId: String(entityId),
          rootNoteId: effectiveRootNoteId,
          noteId: note.id,
          content,
          excludedUserIds: mentionResolution.resolvedRecipientIds,
        });
      }

      return NextResponse.json({
        success: true,
        data: {
          ...note,
          author: author || { id: ctx.userId, name: "Usuario", email: "" },
          mentionNames: note.mentions,
          replies: [],
        },
      });
    } catch (error) {
      console.error("Error creating note:", error);
      const err = error as Error & { code?: string; meta?: unknown };
      const message =
        err?.message ||
        (err?.code ? `Error de base de datos: ${err.code}` : "Error al crear la nota");
      return NextResponse.json(
        { success: false, error: message },
        { status: 500 }
      );
    }
  } catch (outerError) {
    console.error("Error in notes POST:", outerError);
    const msg = outerError instanceof Error ? outerError.message : "Error al crear la nota";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
