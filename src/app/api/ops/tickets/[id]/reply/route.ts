/**
 * API Route: /api/ops/tickets/[id]/reply
 * POST — Send an email reply from a ticket
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { sendTicketEmail } from "@/lib/tickets-email";

type Params = { id: string };

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = await request.json();
    const {
      to,
      cc,
      bcc,
      subject,
      bodyText,
      bodyHtml,
      attachmentKeys,
      inReplyToCommentId,
    } = body;

    // Validate required fields
    if (!to || !Array.isArray(to) || to.length === 0) {
      return NextResponse.json(
        { success: false, error: "Se requiere al menos un destinatario (to)" },
        { status: 400 },
      );
    }
    const invalidEmails = to.filter((e: string) => !EMAIL_REGEX.test(e));
    if (invalidEmails.length > 0) {
      return NextResponse.json(
        { success: false, error: `Emails inválidos: ${invalidEmails.join(", ")}` },
        { status: 400 },
      );
    }
    if (!bodyText || typeof bodyText !== "string" || !bodyText.trim()) {
      return NextResponse.json(
        { success: false, error: "Se requiere bodyText" },
        { status: 400 },
      );
    }

    // Verify ticket exists and belongs to tenant
    const ticket = await prisma.opsTicket.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, code: true, title: true },
    });
    if (!ticket) {
      return NextResponse.json(
        { success: false, error: "Ticket no encontrado" },
        { status: 404 },
      );
    }

    // Resolve threading from inReplyToCommentId
    let inReplyToMessageId: string | undefined;
    let threadMessageIds: string[] | undefined;

    if (inReplyToCommentId) {
      const replyToComment = await prisma.opsTicketComment.findUnique({
        where: { id: inReplyToCommentId },
        select: { messageId: true, threadMessageIds: true },
      });
      if (replyToComment?.messageId) {
        inReplyToMessageId = replyToComment.messageId;
        threadMessageIds = [
          ...(replyToComment.threadMessageIds ?? []),
          replyToComment.messageId,
        ];
      }
    }

    // Build attachments from r2Keys
    let attachments: Array<{
      fileName: string;
      r2Key: string;
      contentType: string;
    }> = [];
    if (attachmentKeys?.length) {
      attachments = attachmentKeys.map((key: string) => {
        const parts = key.split("/");
        const fileName = parts[parts.length - 1]?.replace(/^[^-]+-/, "") || "attachment";
        return { fileName, r2Key: key, contentType: "application/octet-stream" };
      });
    }

    const comment = await sendTicketEmail({
      tenantId: ctx.tenantId,
      ticketId: id,
      to,
      cc,
      bcc,
      subject: subject || `Re: ${ticket.title}`,
      bodyText: bodyText.trim(),
      bodyHtml: bodyHtml || undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
      inReplyToMessageId,
      threadMessageIds,
      sentByUserId: ctx.userId,
    });

    return NextResponse.json({ success: true, data: comment }, { status: 201 });
  } catch (error) {
    console.error("[OPS] Error sending ticket reply:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo enviar el email" },
      { status: 500 },
    );
  }
}
