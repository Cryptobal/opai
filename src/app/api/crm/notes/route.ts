/**
 * API Route: /api/crm/notes
 * GET  - List notes for an entity (query: entityType, entityId)
 * POST - Create a new note
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

/** Construye el link para una entidad. Para installation_pauta, entityId es "installationId_year-month". */
function getEntityLink(entityType: string, entityId: string): string | null {
  const base: Record<string, string> = {
    account: "/crm/accounts",
    contact: "/crm/contacts",
    deal: "/crm/deals",
    quote: "/crm/cotizaciones",
    ops_guardia: "/personas/guardias",
    installation_pauta: "/ops/pauta-mensual",
  };
  const basePath = base[entityType];
  if (!basePath) return null;
  if (entityType === "installation_pauta") {
    const [installationId] = entityId.split("_");
    if (!installationId) return "/ops/pauta-mensual";
    return `${basePath}?installationId=${installationId}`;
  }
  return `${basePath}/${entityId}`;
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

  // Fetch author names
  const authorIds = [...new Set(notes.map((n) => n.createdBy))];
  const authors = authorIds.length > 0
    ? await prisma.admin.findMany({
        where: { id: { in: authorIds }, tenantId: ctx.tenantId },
        select: { id: true, name: true, email: true },
      })
    : [];
  const authorMap = Object.fromEntries(authors.map((a) => [a.id, a]));

  // Fetch mentioned user names
  const allMentionIds = [...new Set(notes.flatMap((n) => n.mentions))];
  const mentionedUsers = allMentionIds.length > 0
    ? await prisma.admin.findMany({
        where: { id: { in: allMentionIds }, tenantId: ctx.tenantId },
        select: { id: true, name: true },
      })
    : [];
  const mentionMap = Object.fromEntries(mentionedUsers.map((u) => [u.id, u.name]));

  const enriched = notes.map((note) => ({
    ...note,
    author: authorMap[note.createdBy] || { id: note.createdBy, name: "Usuario", email: "" },
    mentionNames: note.mentions.map((id) => mentionMap[id] || "Usuario"),
  }));

  return NextResponse.json({ success: true, data: enriched });
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const body = await request.json().catch(() => ({}));
    const { entityType, entityId, content, mentions } = body;

    if (!entityType || !entityId || !content?.trim()) {
      return NextResponse.json(
        { success: false, error: "entityType, entityId y content son requeridos" },
        { status: 400 }
      );
    }

    const validTypes = ["account", "contact", "deal", "quote", "ops_guardia", "installation_pauta"];
    if (!validTypes.includes(entityType)) {
      return NextResponse.json(
        { success: false, error: "entityType inválido" },
        { status: 400 }
      );
    }

    if (!prisma.crmNote) {
      console.error("Prisma client missing crmNote. Run: npx prisma generate && restart dev server.");
      return NextResponse.json(
        {
          success: false,
          error:
            "Cliente de BD sin modelo de notas. Ejecuta 'npx prisma generate' y reinicia el servidor (npm run dev).",
        },
        { status: 503 }
      );
    }

    try {
      const mentionIds = Array.isArray(mentions)
        ? [...new Set(mentions.map((id: unknown) => String(id)).filter(Boolean))]
        : [];

      const note = await prisma.crmNote.create({
        data: {
          tenantId: ctx.tenantId,
          entityType,
          entityId: String(entityId),
          content: content.trim(),
          mentions: mentionIds,
          createdBy: ctx.userId,
        },
      });

      // Fetch author info
      const author = await prisma.admin.findUnique({
        where: { id: ctx.userId },
        select: { id: true, name: true, email: true },
      });

      // Notificaciones de menciones por usuario (siempre dentro del mismo tenant)
      const targetMentionIds = mentionIds.filter((id) => id !== ctx.userId);
      if (targetMentionIds.length > 0) {
        const mentionedUsers = await prisma.admin.findMany({
          where: {
            tenantId: ctx.tenantId,
            status: "active",
            id: { in: targetMentionIds },
          },
          select: { id: true },
        });

        if (mentionedUsers.length > 0) {
          const authorName = author?.name || ctx.userEmail || "Alguien";
          const entityLink = getEntityLink(entityType, String(entityId));

          const { sendNotificationToUser } = await import("@/lib/notification-service");
          await Promise.allSettled(
            mentionedUsers.map((user) =>
              sendNotificationToUser({
                tenantId: ctx.tenantId,
                type: "mention",
                title: `${authorName} te mencionó en una nota`,
                message: content.trim().slice(0, 180),
                link: entityLink,
                data: {
                  mentionUserId: user.id,
                  entityType,
                  entityId: String(entityId),
                  noteId: note.id,
                  authorId: ctx.userId,
                },
                targetUserId: user.id,
              })
            )
          );
        }
      }

      return NextResponse.json({
        success: true,
        data: {
          ...note,
          author: author || { id: ctx.userId, name: "Usuario", email: "" },
          mentionNames: [],
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
