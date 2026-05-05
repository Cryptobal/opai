/**
 * API Route: /api/ops/tickets/[id]/attachments/[attachmentId]
 *
 * DELETE — Elimina un adjunto persistido del ticket. Solo el autor del
 * upload o un administrador pueden eliminarlo. También borra el objeto
 * de R2 (best-effort: si R2 falla, igual borramos la fila para no dejar
 * huérfanos visibles en la UI).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { isAdminRole } from "@/lib/access";
import { deleteFile } from "@/lib/storage";
import { recordTicketEvent } from "@/lib/tickets-events";

type Params = { id: string; attachmentId: string };

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id: ticketId, attachmentId } = await params;

    const att = await prisma.opsTicketAttachment.findFirst({
      where: {
        id: attachmentId,
        ticketId,
        tenantId: ctx.tenantId,
      },
      select: {
        id: true,
        storageKey: true,
        fileName: true,
        uploadedBy: true,
      },
    });
    if (!att) {
      return NextResponse.json(
        { success: false, error: "Adjunto no encontrado" },
        { status: 404 },
      );
    }

    const isAuthor = att.uploadedBy === ctx.userId;
    const isAdmin = isAdminRole(ctx.userRole);
    if (!isAuthor && !isAdmin) {
      return NextResponse.json(
        {
          success: false,
          error: "Solo quien subió el archivo o un administrador puede eliminarlo",
        },
        { status: 403 },
      );
    }

    await prisma.opsTicketAttachment.delete({ where: { id: attachmentId } });

    // Borrar de R2 (best-effort).
    try {
      await deleteFile(att.storageKey);
    } catch (err) {
      console.warn(
        "[OPS] No se pudo borrar el objeto en R2 (fila eliminada igual)",
        { storageKey: att.storageKey, err },
      );
    }

    // Audit trail.
    try {
      await recordTicketEvent({
        tenantId: ctx.tenantId,
        ticketId,
        type: "attachment_removed",
        actorId: ctx.userId,
        data: { attachmentId, fileName: att.fileName },
      });
    } catch {
      // ignore
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[OPS] Error deleting ticket attachment:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo eliminar el adjunto" },
      { status: 500 },
    );
  }
}
