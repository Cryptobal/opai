import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { isAdminRole } from "@/lib/access";
import type { TicketComment } from "@/lib/tickets";

type Params = { id: string; commentId: string };

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

function canEditDelete(opts: {
  comment: { userId: string; direction: string | null; deletedAt: Date | null };
  userId: string;
  userRole: string;
  action: "edit" | "delete";
}): { allowed: boolean; reason?: string } {
  if (opts.comment.deletedAt) {
    return { allowed: false, reason: "El comentario ya fue eliminado" };
  }
  const isAuthor = opts.comment.userId === opts.userId;
  const isAdmin = isAdminRole(opts.userRole);
  const dir = opts.comment.direction ?? "internal";

  if (opts.action === "edit" && (dir === "email_in" || dir === "email_out")) {
    return {
      allowed: false,
      reason: "Los emails enviados/recibidos no se pueden editar",
    };
  }
  if (!isAuthor && !isAdmin) {
    return {
      allowed: false,
      reason:
        opts.action === "edit"
          ? "Solo el autor o un administrador pueden editar este comentario"
          : "Solo el autor o un administrador pueden eliminar este comentario",
    };
  }
  return { allowed: true };
}

/* ── PATCH ── editar body ─────────────────────────────────────── */

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id: ticketId, commentId } = await params;
    const body = await request.json();
    const newBody = typeof body.body === "string" ? body.body.trim() : "";
    if (!newBody) {
      return NextResponse.json(
        { success: false, error: "El cuerpo del comentario no puede estar vacío" },
        { status: 400 },
      );
    }
    if (newBody.length > 5000) {
      return NextResponse.json(
        { success: false, error: "El comentario excede el largo máximo (5000 caracteres)" },
        { status: 400 },
      );
    }

    const existing = await prisma.opsTicketComment.findFirst({
      where: {
        id: commentId,
        ticketId,
        ticket: { tenantId: ctx.tenantId },
      },
      select: {
        id: true,
        userId: true,
        direction: true,
        body: true,
        originalBody: true,
        deletedAt: true,
      },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Comentario no encontrado" },
        { status: 404 },
      );
    }
    const check = canEditDelete({
      comment: existing,
      userId: ctx.userId,
      userRole: ctx.userRole,
      action: "edit",
    });
    if (!check.allowed) {
      return NextResponse.json(
        { success: false, error: check.reason ?? "Sin permisos" },
        { status: 403 },
      );
    }

    const now = new Date();
    const updated = await prisma.opsTicketComment.update({
      where: { id: commentId },
      data: {
        body: newBody,
        editedAt: now,
        editedBy: ctx.userId,
        // Solo se setea la primera vez para preservar la intención inicial.
        originalBody: existing.originalBody ?? existing.body,
      },
    });

    // Audit trail (best-effort).
    try {
      const { recordTicketEvent } = await import("@/lib/tickets-events");
      await recordTicketEvent({
        tenantId: ctx.tenantId,
        ticketId,
        type: "comment_edited",
        actorId: ctx.userId,
        data: { commentId },
      });
    } catch {
      // ignore
    }

    const { resolveActorNames } = await import("@/lib/notifications/resolve-actor-name");
    const actorMap = await resolveActorNames(ctx.tenantId, [updated.userId]);

    return NextResponse.json({ success: true, data: mapComment(updated, actorMap) });
  } catch (error) {
    console.error("[OPS] Error editing ticket comment:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo editar el comentario" },
      { status: 500 },
    );
  }
}

/* ── DELETE ── soft delete ────────────────────────────────────── */

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id: ticketId, commentId } = await params;

    const existing = await prisma.opsTicketComment.findFirst({
      where: {
        id: commentId,
        ticketId,
        ticket: { tenantId: ctx.tenantId },
      },
      select: { id: true, userId: true, direction: true, deletedAt: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Comentario no encontrado" },
        { status: 404 },
      );
    }
    const check = canEditDelete({
      comment: existing,
      userId: ctx.userId,
      userRole: ctx.userRole,
      action: "delete",
    });
    if (!check.allowed) {
      return NextResponse.json(
        { success: false, error: check.reason ?? "Sin permisos" },
        { status: 403 },
      );
    }

    const now = new Date();
    await prisma.opsTicketComment.update({
      where: { id: commentId },
      data: {
        deletedAt: now,
        deletedBy: ctx.userId,
      },
    });

    try {
      const { recordTicketEvent } = await import("@/lib/tickets-events");
      await recordTicketEvent({
        tenantId: ctx.tenantId,
        ticketId,
        type: "comment_deleted",
        actorId: ctx.userId,
        data: { commentId },
      });
    } catch {
      // ignore
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[OPS] Error deleting ticket comment:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo eliminar el comentario" },
      { status: 500 },
    );
  }
}
