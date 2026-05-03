import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { isAdminRole } from "@/lib/access";
import type { TicketComment } from "@/lib/tickets";

type Params = { id: string; commentId: string };

/* ── Mapper ──────────────────────────────────────────────────── */

function mapComment(c: any, actorMap?: Map<string, { name: string }>): TicketComment {
  return {
    id: c.id,
    ticketId: c.ticketId,
    userId: c.userId,
    userName: actorMap?.get(c.userId)?.name ?? null,
    body: c.body,
    bodyHtml: c.bodyHtml ?? null,
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
    attachments: c.attachments ?? null,
    sentAt: c.sentAt instanceof Date ? c.sentAt.toISOString() : c.sentAt ?? null,
    deliveryStatus: c.deliveryStatus ?? null,
    deliveryError: c.deliveryError ?? null,
    resendId: c.resendId ?? null,
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
    updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt,
  };
}

/**
 * Determina si el usuario actual puede editar/borrar el comentario.
 * Reglas:
 *  - El autor del comentario siempre puede.
 *  - Owners y Admins pueden editar/borrar comentarios de cualquier usuario
 *    del mismo tenant (moderación).
 *  - Comentarios de tipo email (direction = email_in / email_out) son
 *    inmutables: representan correo enviado o recibido y modificarlos
 *    falsearía el historial. Solo se permite borrar a admins (limpieza).
 */
function canEdit(opts: {
  comment: { userId: string; direction: string | null };
  userId: string;
  userRole: string;
}): { allowed: boolean; reason?: string } {
  const isAuthor = opts.comment.userId === opts.userId;
  const isAdmin = isAdminRole(opts.userRole);
  const dir = opts.comment.direction ?? "internal";

  if (dir === "email_in" || dir === "email_out") {
    return {
      allowed: false,
      reason: "Los emails enviados/recibidos no se pueden editar",
    };
  }
  if (!isAuthor && !isAdmin) {
    return {
      allowed: false,
      reason: "Solo el autor o un administrador pueden editar este comentario",
    };
  }
  return { allowed: true };
}

function canDelete(opts: {
  comment: { userId: string };
  userId: string;
  userRole: string;
}): { allowed: boolean; reason?: string } {
  const isAuthor = opts.comment.userId === opts.userId;
  const isAdmin = isAdminRole(opts.userRole);
  if (!isAuthor && !isAdmin) {
    return {
      allowed: false,
      reason: "Solo el autor o un administrador pueden eliminar este comentario",
    };
  }
  return { allowed: true };
}

/* ── PATCH /api/ops/tickets/[id]/comments/[commentId] ─────────── */

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

    // Cargar el comentario asegurando que pertenezca a un ticket del tenant.
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
        isInternal: true,
        body: true,
      },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Comentario no encontrado" },
        { status: 404 },
      );
    }

    const check = canEdit({
      comment: { userId: existing.userId, direction: existing.direction },
      userId: ctx.userId,
      userRole: ctx.userRole,
    });
    if (!check.allowed) {
      return NextResponse.json(
        { success: false, error: check.reason ?? "Sin permisos" },
        { status: 403 },
      );
    }

    // updatedAt se setea automáticamente vía @updatedAt; el cliente puede
    // detectar edición comparando createdAt vs updatedAt.
    const updated = await prisma.opsTicketComment.update({
      where: { id: commentId },
      data: { body: newBody },
    });

    const { resolveActorNames } = await import("@/lib/notifications/resolve-actor-name");
    const actorMap = await resolveActorNames(ctx.tenantId, [updated.userId]);

    return NextResponse.json({
      success: true,
      data: mapComment(updated, actorMap),
    });
  } catch (error) {
    console.error("[OPS] Error editing ticket comment:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo editar el comentario" },
      { status: 500 },
    );
  }
}

/* ── DELETE /api/ops/tickets/[id]/comments/[commentId] ────────── */

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
      select: { id: true, userId: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Comentario no encontrado" },
        { status: 404 },
      );
    }

    const check = canDelete({
      comment: { userId: existing.userId },
      userId: ctx.userId,
      userRole: ctx.userRole,
    });
    if (!check.allowed) {
      return NextResponse.json(
        { success: false, error: check.reason ?? "Sin permisos" },
        { status: 403 },
      );
    }

    await prisma.opsTicketComment.delete({ where: { id: commentId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[OPS] Error deleting ticket comment:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo eliminar el comentario" },
      { status: 500 },
    );
  }
}
