/**
 * API Route: /api/webhooks/email/inbound
 * POST — Receive inbound emails (from Resend / Mailgun / Postmark)
 *
 * Resolves the target ticket from plus-addressing, subject regex,
 * or In-Reply-To/References headers. Creates an OpsTicketComment
 * with direction="email_in". Reopens closed/resolved tickets.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { uploadFile } from "@/lib/storage";
import { sendNotification, sendNotificationToUser } from "@/lib/notification-service";
import { parseTicketIdFromEmail } from "@/lib/tickets-email";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface InboundEmail {
  from: { email: string; name?: string };
  to: string[];
  cc?: string[];
  subject: string;
  text?: string;
  html?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
  date?: string;
  headers?: Record<string, string>;
  attachments?: Array<{
    filename: string;
    content: string; // base64
    contentType: string;
    size: number;
  }>;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(request: NextRequest) {
  try {
    // Verify webhook authentication
    const webhookSecret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;
    if (webhookSecret) {
      const authHeader = request.headers.get("authorization");
      const sigHeader = request.headers.get("x-webhook-secret");
      if (authHeader !== `Bearer ${webhookSecret}` && sigHeader !== webhookSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const payload = await request.json();

    // Normalize payload (support Resend, Mailgun, and Postmark formats)
    const email = normalizeInboundPayload(payload);
    if (!email) {
      return NextResponse.json(
        { error: "Invalid payload format" },
        { status: 400 },
      );
    }

    // Loop prevention: skip auto-replies and self-sends
    const autoSubmitted = email.headers?.["auto-submitted"] || email.headers?.["Auto-Submitted"];
    if (autoSubmitted && autoSubmitted !== "no") {
      return NextResponse.json({ success: true, skipped: "auto-submitted" });
    }

    // Check if this is our own email (would cause a loop)
    const fromEmail = email.from.email.toLowerCase();
    if (fromEmail.includes("noreply@") || fromEmail.includes("no-reply@")) {
      return NextResponse.json({ success: true, skipped: "noreply_sender" });
    }

    // Idempotency: check if messageId already exists
    if (email.messageId) {
      const existing = await prisma.opsTicketComment.findUnique({
        where: { messageId: email.messageId },
        select: { id: true },
      });
      if (existing) {
        return NextResponse.json({ success: true, skipped: "duplicate_message_id" });
      }
    }

    // Resolve ticket ID
    const { ticketId: parsedId, method } = parseTicketIdFromEmail({
      toAddresses: email.to,
      subject: email.subject,
      inReplyTo: email.inReplyTo,
      references: email.references,
    });

    let ticketId = parsedId;
    let ticket: {
      id: string;
      tenantId: string;
      code: string;
      title: string;
      status: string;
      assignedTo: string | null;
      assignedTeam: string;
    } | null = null;

    // If parsedId is from subject_code, look up by code
    if (method === "subject_code" && ticketId) {
      ticket = await prisma.opsTicket.findFirst({
        where: { code: ticketId },
        select: {
          id: true,
          tenantId: true,
          code: true,
          title: true,
          status: true,
          assignedTo: true,
          assignedTeam: true,
        },
      });
      if (ticket) ticketId = ticket.id;
      else ticketId = null;
    }

    // If plus-addressing resolved a UUID, verify it exists
    if (method === "plus_addressing" && ticketId) {
      ticket = await prisma.opsTicket.findUnique({
        where: { id: ticketId },
        select: {
          id: true,
          tenantId: true,
          code: true,
          title: true,
          status: true,
          assignedTo: true,
          assignedTeam: true,
        },
      });
      if (!ticket) ticketId = null;
    }

    // Fallback: try In-Reply-To / References via DB lookup
    if (!ticketId && email.inReplyTo) {
      const refComment = await prisma.opsTicketComment.findUnique({
        where: { messageId: email.inReplyTo },
        select: { ticketId: true },
      });
      if (refComment) {
        ticketId = refComment.ticketId;
        ticket = await prisma.opsTicket.findUnique({
          where: { id: refComment.ticketId },
          select: {
            id: true,
            tenantId: true,
            code: true,
            title: true,
            status: true,
            assignedTo: true,
            assignedTeam: true,
          },
        });
      }
    }

    if (!ticketId && email.references?.length) {
      for (const ref of email.references.reverse()) {
        const refComment = await prisma.opsTicketComment.findUnique({
          where: { messageId: ref },
          select: { ticketId: true },
        });
        if (refComment) {
          ticketId = refComment.ticketId;
          ticket = await prisma.opsTicket.findUnique({
            where: { id: refComment.ticketId },
            select: {
              id: true,
              tenantId: true,
              code: true,
              title: true,
              status: true,
              assignedTo: true,
              assignedTeam: true,
            },
          });
          break;
        }
      }
    }

    // If still no ticket found, create orphan ticket
    if (!ticketId || !ticket) {
      const orphanCode = `TKT-${Date.now().toString(36).toUpperCase()}`;
      // Determine tenant from to addresses (fallback to first tenant)
      const tenants = await prisma.tenant.findMany({ select: { id: true }, take: 1 });
      const tenantId = tenants[0]?.id;
      if (!tenantId) {
        return NextResponse.json(
          { error: "No tenant found" },
          { status: 500 },
        );
      }

      const orphanTicket = await prisma.opsTicket.create({
        data: {
          tenantId,
          code: orphanCode,
          title: email.subject || "Email entrante sin ticket asociado",
          description: `Email de ${email.from.email} no pudo ser asociado a un ticket existente.`,
          status: "open",
          priority: "p3",
          assignedTeam: "operaciones",
          source: "email_inbound_orphan",
          reportedBy: "system",
        },
      });

      ticket = {
        id: orphanTicket.id,
        tenantId,
        code: orphanCode,
        title: orphanTicket.title,
        status: "open",
        assignedTo: null,
        assignedTeam: "operaciones",
      };
      ticketId = orphanTicket.id;

      // Notify about orphan
      sendNotification({
        tenantId,
        type: "ticket_new_email_reply",
        title: `Email huérfano: ${orphanCode}`,
        message: `Se recibió un email de ${email.from.email} que no pudo ser asociado a un ticket existente. Se creó ${orphanCode}.`,
        data: { ticketId: orphanTicket.id, code: orphanCode, fromEmail: email.from.email },
        link: `/ops/tickets/${orphanTicket.id}`,
      }).catch(() => {});
    }

    // Upload attachments to R2
    const commentAttachments: Array<{
      fileName: string;
      r2Key: string;
      size: number;
      contentType: string;
      url: string;
    }> = [];

    if (email.attachments?.length) {
      for (const att of email.attachments) {
        try {
          const buffer = Buffer.from(att.content, "base64");
          const sanitizedName = (att.filename || "attachment").replace(
            /[^a-zA-Z0-9._-]/g,
            "_",
          );
          const result = await uploadFile(
            buffer,
            sanitizedName,
            att.contentType,
            `tickets/${ticket.tenantId}/${ticketId}/inbound`,
            ticket.tenantId,
          );
          commentAttachments.push({
            fileName: att.filename || "attachment",
            r2Key: result.storageKey,
            size: buffer.length,
            contentType: att.contentType,
            url: result.publicUrl,
          });
        } catch (err) {
          console.error("[inbound] Attachment upload failed:", err);
        }
      }
    }

    // Create OpsTicketComment
    const bodyText = email.text || (email.html ? stripHtml(email.html) : "");

    await prisma.opsTicketComment.create({
      data: {
        ticketId: ticketId!,
        userId: "email-inbound",
        direction: "email_in",
        body: bodyText,
        bodyHtml: email.html ?? null,
        fromEmail: email.from.email,
        fromName: email.from.name ?? null,
        toEmails: email.to,
        ccEmails: email.cc ?? [],
        subject: email.subject,
        messageId: email.messageId ?? null,
        inReplyToMessageId: email.inReplyTo ?? null,
        threadMessageIds: email.references ?? [],
        attachments:
          commentAttachments.length > 0 ? commentAttachments : undefined,
        isInternal: false,
        sentAt: email.date ? new Date(email.date) : new Date(),
        deliveryStatus: "delivered",
      },
    });

    // Reopen ticket if it was resolved/closed
    if (["resolved", "closed"].includes(ticket.status)) {
      await prisma.opsTicket.update({
        where: { id: ticketId! },
        data: { status: "in_progress" },
      });

      // Add internal audit comment
      await prisma.opsTicketComment.create({
        data: {
          ticketId: ticketId!,
          userId: "system",
          body: `Ticket reabierto automáticamente por respuesta entrante de ${email.from.email}`,
          isInternal: true,
          direction: "internal",
        },
      });
    }

    // Notify assignee or team
    const notifPayload = {
      tenantId: ticket.tenantId,
      type: "ticket_new_email_reply",
      title: `Respuesta en ${ticket.code}`,
      message: `${email.from.name || email.from.email} respondió en "${ticket.title}"`,
      data: {
        ticketId: ticketId!,
        code: ticket.code,
        fromEmail: email.from.email,
      },
      link: `/ops/tickets/${ticketId}`,
    };

    if (ticket.assignedTo) {
      sendNotificationToUser({
        ...notifPayload,
        targetUserId: ticket.assignedTo,
      }).catch(() => {});
    } else {
      sendNotification(notifPayload).catch(() => {});
    }

    return NextResponse.json({ success: true, ticketId });
  } catch (error) {
    console.error("[Webhook] Inbound email error:", error);
    return NextResponse.json(
      { success: false, error: "Inbound processing failed" },
      { status: 500 },
    );
  }
}

/**
 * Normalize different inbound email provider payloads to a common format.
 */
function normalizeInboundPayload(payload: any): InboundEmail | null {
  const provider = process.env.INBOUND_PROVIDER || "resend";

  try {
    if (provider === "resend") {
      // Resend inbound webhook format
      const data = payload.data || payload;
      return {
        from: {
          email: data.from?.email || data.from || "",
          name: data.from?.name,
        },
        to: Array.isArray(data.to) ? data.to : [data.to].filter(Boolean),
        cc: data.cc ? (Array.isArray(data.cc) ? data.cc : [data.cc]) : undefined,
        subject: data.subject || "",
        text: data.text,
        html: data.html,
        messageId: data.message_id || data.messageId,
        inReplyTo: data.in_reply_to || data.inReplyTo,
        references: data.references
          ? typeof data.references === "string"
            ? data.references.split(/\s+/)
            : data.references
          : undefined,
        date: data.date,
        headers: data.headers,
        attachments: data.attachments?.map((a: any) => ({
          filename: a.filename || a.name,
          content: a.content,
          contentType: a.content_type || a.contentType || "application/octet-stream",
          size: a.size || 0,
        })),
      };
    }

    if (provider === "mailgun") {
      return {
        from: {
          email: payload.sender || payload.from || "",
          name: payload["from-name"],
        },
        to: (payload.recipient || payload.To || "").split(",").map((s: string) => s.trim()),
        cc: payload.Cc ? payload.Cc.split(",").map((s: string) => s.trim()) : undefined,
        subject: payload.subject || payload.Subject || "",
        text: payload["body-plain"] || payload["stripped-text"],
        html: payload["body-html"] || payload["stripped-html"],
        messageId: payload["Message-Id"],
        inReplyTo: payload["In-Reply-To"],
        references: payload.References
          ? payload.References.split(/\s+/)
          : undefined,
        date: payload.Date,
        headers: {},
        attachments: [], // Mailgun sends attachments separately
      };
    }

    if (provider === "postmark") {
      return {
        from: {
          email: payload.FromFull?.Email || payload.From || "",
          name: payload.FromFull?.Name,
        },
        to: (payload.ToFull || []).map((t: any) => t.Email),
        cc: (payload.CcFull || []).map((c: any) => c.Email),
        subject: payload.Subject || "",
        text: payload.TextBody,
        html: payload.HtmlBody,
        messageId: payload.MessageID,
        inReplyTo: payload.Headers?.find((h: any) => h.Name === "In-Reply-To")?.Value,
        references: payload.Headers?.find((h: any) => h.Name === "References")
          ?.Value?.split(/\s+/),
        date: payload.Date,
        headers: Object.fromEntries(
          (payload.Headers || []).map((h: any) => [h.Name, h.Value]),
        ),
        attachments: (payload.Attachments || []).map((a: any) => ({
          filename: a.Name,
          content: a.Content,
          contentType: a.ContentType,
          size: a.ContentLength || 0,
        })),
      };
    }

    // Default: try generic format
    return {
      from: { email: payload.from?.email || payload.from || "" },
      to: Array.isArray(payload.to) ? payload.to : [payload.to].filter(Boolean),
      subject: payload.subject || "",
      text: payload.text || payload.body,
      html: payload.html,
      messageId: payload.messageId,
    };
  } catch {
    return null;
  }
}
