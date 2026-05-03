import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { notify } from "@/lib/notifications/notify";
import type { TicketComment } from "@/lib/tickets";

type Params = { id: string };

/* ── Mapper ──────────────────────────────────────────────────── */

function mapComment(c: any, actorMap?: Map<string, { name: string }>): TicketComment {
  const isDeleted = c.deletedAt != null;
  const isEdited = c.editedAt != null;
  return {
    id: c.id,
    ticketId: c.ticketId,
    userId: c.userId,
    userName: actorMap?.get(c.userId)?.name ?? null,
    body: isDeleted ? "" : c.body,
    bodyHtml: isDeleted ? null : c.bodyHtml ?? null,
    isInternal: c.isInternal,
    direction: c.direction ?? "internal",
    fromEmail: c.fromEmail ?? null,
    fromName: c.fromName ?? null,
    toEmails: c.toEmails ?? [],
    ccEmails: c.ccEmails ?? [],
    bccEmails: c.bccEmails ?? [],
    subject: c.subject ?? null,
    messageId: c.messageId ?? null,
    inReplyToMessageId: c.inReplyToMessageId ?? null,
    threadMessageIds: c.threadMessageIds ?? [],
    attachments: isDeleted ? null : (c.attachments ?? null),
    sentAt: c.sentAt instanceof Date ? c.sentAt.toISOString() : c.sentAt ?? null,
    deliveryStatus: c.deliveryStatus ?? null,
    deliveryError: c.deliveryError ?? null,
    resendId: c.resendId ?? null,
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
    updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt,
    isDeleted,
    deletedAt:
      c.deletedAt instanceof Date ? c.deletedAt.toISOString() : c.deletedAt ?? null,
    isEdited,
    editedAt:
      c.editedAt instanceof Date ? c.editedAt.toISOString() : c.editedAt ?? null,
  };
}

/* ── GET /api/ops/tickets/[id]/comments ──────────────────────── */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id: ticketId } = await params;

    // Verify ticket belongs to tenant
    const ticket = await prisma.opsTicket.findFirst({
      where: { id: ticketId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!ticket) {
      return NextResponse.json(
        { success: false, error: "Ticket no encontrado" },
        { status: 404 },
      );
    }

    const comments = await prisma.opsTicketComment.findMany({
      where: { ticketId },
      orderBy: { createdAt: "desc" },
    });

    const { resolveActorNames } = await import("@/lib/notifications/resolve-actor-name");
    const userIds = [...new Set(comments.map((c) => c.userId).filter(Boolean))];
    const actorMap = await resolveActorNames(ctx.tenantId, userIds);

    const items: TicketComment[] = comments.map((c) => mapComment(c, actorMap));

    return NextResponse.json({ success: true, data: { items } });
  } catch (error) {
    console.error("[OPS] Error listing ticket comments:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener los comentarios" },
      { status: 500 },
    );
  }
}

/* ── POST /api/ops/tickets/[id]/comments ─────────────────────── */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id: ticketId } = await params;
    const body = await request.json();

    if (!body.body) {
      return NextResponse.json(
        { success: false, error: "body es requerido" },
        { status: 400 },
      );
    }

    // Verify ticket belongs to tenant
    const ticket = await prisma.opsTicket.findFirst({
      where: { id: ticketId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!ticket) {
      return NextResponse.json(
        { success: false, error: "Ticket no encontrado" },
        { status: 404 },
      );
    }

    const comment = await prisma.opsTicketComment.create({
      data: {
        ticketId,
        userId: ctx.userId,
        body: body.body,
        isInternal: body.isInternal ?? false,
      },
    });

    // Parse @mentions (users AND groups) and send notifications.
    // Reglas anti-spam:
    //  - Mínimo 2 caracteres por mention (descarta @a, @x).
    //  - Grupos: match EXACTO contra el nombre del grupo (no substring),
    //    para evitar que "@op" expanda "Operaciones" a 30 personas.
    //  - Usuarios: match si la mention aparece como PREFIJO de alguna
    //    palabra del nombre, no como substring arbitrario. Esto evita
    //    que "@an" matchee a "Juan", "Daniel" y "Mariana" simultáneamente.
    //  - Máximo 8 mentions distintas por comentario.
    try {
      const mentionPattern = /@([A-Za-z\u00C0-\u024F]+(?:\s+[A-Za-z\u00C0-\u024F]+)*)/g;
      const mentions: string[] = [];
      let match: RegExpExecArray | null;
      while ((match = mentionPattern.exec(body.body)) !== null) {
        const m = match[1].trim();
        if (m.length >= 2) mentions.push(m);
      }
      // Dedup case-insensitive y cap a 8.
      const uniqueMentions = Array.from(
        new Set(mentions.map((m) => m.toLowerCase())),
      ).slice(0, 8);

      if (uniqueMentions.length > 0) {
        const [allAdmins, allGroups] = await Promise.all([
          prisma.admin.findMany({
            where: { tenantId: ctx.tenantId, status: "active" },
            select: { id: true, name: true },
          }),
          prisma.adminGroup.findMany({
            where: { tenantId: ctx.tenantId, isActive: true },
            select: {
              id: true,
              name: true,
              memberships: { select: { adminId: true } },
            },
          }),
        ]);

        const mentionedUserIds: string[] = [];
        const mentionedGroupIds: string[] = [];

        for (const mentionLower of uniqueMentions) {
          // 1. Grupo por match exacto.
          const matchingGroup = allGroups.find(
            (g) => g.name.toLowerCase() === mentionLower,
          );
          if (matchingGroup) {
            mentionedGroupIds.push(matchingGroup.id);
            for (const m of matchingGroup.memberships) {
              if (m.adminId !== ctx.userId) {
                mentionedUserIds.push(m.adminId);
              }
            }
            continue;
          }

          // 2. Usuario por prefijo de palabra (caso insensible).
          for (const admin of allAdmins) {
            if (!admin.name || admin.id === ctx.userId) continue;
            const words = admin.name.toLowerCase().split(/\s+/);
            const isWordPrefixMatch = words.some((w) =>
              w.startsWith(mentionLower),
            );
            if (isWordPrefixMatch) {
              mentionedUserIds.push(admin.id);
            }
          }
        }

        const uniqueIds = [...new Set(mentionedUserIds)];
        if (uniqueIds.length > 0) {
          const ticketInfo = await prisma.opsTicket.findFirst({
            where: { id: ticketId },
            select: { code: true, title: true },
          });
          await notify({
            tenantId: ctx.tenantId,
            type: mentionedGroupIds.length > 0 ? "mention_group" : "ticket_mention",
            targetIds: uniqueIds,
            targetType: "ADMIN",
            title: `Te mencionaron en ticket ${ticketInfo?.code ?? ""}`,
            body:
              body.body.length > 100
                ? body.body.slice(0, 100) + "..."
                : body.body,
            link: `/ops/tickets/${ticketId}`,
            data: { ticketId, commentId: comment.id, groupIds: mentionedGroupIds },
          });
        }
      }
    } catch (mentionErr) {
      console.error("[OPS] Error processing mentions:", mentionErr);
    }

    // Notificación a interesados (assignedTo + reportedBy) en comentarios públicos.
    // Comentarios internos (isInternal=true) no notifican a interesados.
    if (!comment.isInternal) {
      try {
        const ticketInfo = await prisma.opsTicket.findFirst({
          where: { id: ticketId, tenantId: ctx.tenantId },
          select: { code: true, title: true, assignedTo: true, reportedBy: true },
        });
        if (ticketInfo) {
          const interested = new Set<string>();
          if (ticketInfo.assignedTo) interested.add(ticketInfo.assignedTo);
          if (ticketInfo.reportedBy) interested.add(ticketInfo.reportedBy);
          interested.delete(ctx.userId); // no notificar al autor del comentario
          if (interested.size > 0) {
            const { notify } = await import("@/lib/notifications/notify");
            await notify({
              tenantId: ctx.tenantId,
              type: "ticket_mention", // reusa el tipo existente para evitar churn de catálogo
              targetIds: Array.from(interested),
              targetType: "ADMIN",
              title: `Nuevo comentario en ticket ${ticketInfo.code}`,
              body:
                body.body.length > 140
                  ? body.body.slice(0, 140) + "..."
                  : body.body,
              link: `/opai/ops/tickets/${ticketId}`,
              data: { ticketId, commentId: comment.id, source: "comment" },
            });
          }
        }
      } catch (notifyErr) {
        console.error("[OPS] Error notificando comentario:", notifyErr);
      }
    }

    const { resolveActorNames } = await import("@/lib/notifications/resolve-actor-name");
    const actorMap = await resolveActorNames(ctx.tenantId, [comment.userId]);

    return NextResponse.json(
      { success: true, data: mapComment(comment, actorMap) },
      { status: 201 },
    );
  } catch (error) {
    console.error("[OPS] Error adding ticket comment:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo agregar el comentario" },
      { status: 500 },
    );
  }
}
