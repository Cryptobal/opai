/**
 * API Route: /api/cpq/quotes/[id]/attachments/[attachmentId]
 * DELETE - Eliminar adjunto
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { createCrmHistoryLog } from "@/lib/crm-history";
import { deleteFile } from "@/lib/storage";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id, attachmentId } = await params;
    const attachment = await prisma.cpqQuoteAttachment.findFirst({
      where: {
        id: attachmentId,
        quoteId: id,
        tenantId: ctx.tenantId,
      },
    });

    if (!attachment) {
      return NextResponse.json({ success: false, error: "Adjunto no encontrado" }, { status: 404 });
    }

    try {
      await deleteFile(attachment.storageKey);
    } catch (delErr) {
      console.warn("[CPQ] Could not delete file from storage:", delErr);
    }

    await prisma.cpqQuoteAttachment.delete({
      where: { id: attachmentId },
    });

    const quote = await prisma.cpqQuote.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { code: true } });
    await createCrmHistoryLog({
      tenantId: ctx.tenantId,
      entityType: "quote",
      entityId: id,
      action: "quote_attachment_deleted",
      details: { quoteCode: quote?.code ?? null, fileName: attachment.fileName },
      createdBy: ctx.userId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CPQ] Error deleting attachment:", error);
    return NextResponse.json({ success: false, error: "Error al eliminar adjunto" }, { status: 500 });
  }
}
