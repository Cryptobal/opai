/**
 * Ticket Email Helper
 *
 * Handles sending emails from tickets and creating the corresponding
 * OpsTicketComment with direction="email_out".
 * Follows the pattern from alertas-cobertura/notificacion.service.ts
 */

import { prisma } from "@/lib/prisma";
import { resend, getTenantEmailConfig } from "@/lib/resend";
import { getFileBuffer, getFileUrl } from "@/lib/storage";
import type { TicketComment, TicketCommentAttachment } from "@/lib/tickets";

export interface SendTicketEmailOpts {
  tenantId: string;
  ticketId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  attachments?: Array<{ fileName: string; r2Key: string; contentType: string }>;
  inReplyToMessageId?: string;
  threadMessageIds?: string[];
  sentByUserId: string;
}

/**
 * Send an email from a ticket and create the corresponding OpsTicketComment.
 * Never throws — on failure, creates a comment with deliveryStatus="failed".
 */
export async function sendTicketEmail(
  opts: SendTicketEmailOpts,
): Promise<TicketComment> {
  const {
    tenantId,
    ticketId,
    to,
    cc,
    bcc,
    subject,
    bodyText,
    bodyHtml,
    attachments: attachmentDefs,
    inReplyToMessageId,
    threadMessageIds,
    sentByUserId,
  } = opts;

  // 1. Fetch the ticket to get code
  const ticket = await prisma.opsTicket.findFirst({
    where: { id: ticketId, tenantId },
    select: { id: true, code: true, tenantId: true },
  });
  if (!ticket) {
    throw new Error(`Ticket ${ticketId} not found for tenant ${tenantId}`);
  }

  // 2. Get email config
  const emailCfg = await getTenantEmailConfig(tenantId);

  // 3. Build subject with [TKT-XXXX] prefix
  const codePrefix = `[${ticket.code}]`;
  const fullSubject = subject.includes(codePrefix)
    ? subject
    : `${codePrefix} ${subject}`;

  // 4. Build Reply-To with plus-addressing
  // Strategy:
  //   a) If TICKETS_INBOUND_DOMAIN is explicitly set AND its MX records resolve,
  //      use it: `tickets+{ticketId}@{TICKETS_INBOUND_DOMAIN}`
  //   b) Otherwise, use the tenant's own sender address with plus-addressing
  //      (e.g. `notificaciones+ticket-{ticketId}@gard.cl`). This works because
  //      the tenant's sending domain already has valid MX records, and most
  //      mail servers respect plus-addressing — delivering to the base mailbox.
  //   Inbound resolution then relies primarily on the subject [TKT-XXX] code.
  const replyToAlias = buildReplyToAlias(ticketId, emailCfg.from);

  // 5. Build custom headers
  const headers: Record<string, string> = {
    "X-Opai-Ticket-Id": ticketId,
    "X-Opai-Ticket-Code": ticket.code,
    "X-Opai-Tenant-Id": tenantId,
  };
  if (inReplyToMessageId) {
    headers["In-Reply-To"] = inReplyToMessageId;
    const refs = threadMessageIds?.length
      ? [...threadMessageIds, inReplyToMessageId].join(" ")
      : inReplyToMessageId;
    headers["References"] = refs;
  }

  // 6. Resolve attachments from R2
  let emailAttachments: Array<{
    filename: string;
    content: Buffer;
  }> = [];
  const commentAttachments: TicketCommentAttachment[] = [];

  if (attachmentDefs?.length) {
    for (const att of attachmentDefs) {
      try {
        const buffer = await getFileBuffer(att.r2Key, 25 * 1024 * 1024);
        emailAttachments.push({
          filename: att.fileName,
          content: buffer,
        });
        commentAttachments.push({
          fileName: att.fileName,
          r2Key: att.r2Key,
          size: buffer.length,
          contentType: att.contentType,
          url: getFileUrl(att.r2Key),
        });
      } catch (err) {
        console.error(
          `[tickets-email] Failed to fetch attachment ${att.r2Key}:`,
          err,
        );
      }
    }
  }

  // 7. Send email via Resend
  let resendId: string | null = null;
  let deliveryStatus = "sent";
  let deliveryError: string | null = null;
  let messageId: string | null = null;

  try {
    const result = await resend.emails.send({
      from: emailCfg.from,
      to,
      cc: cc?.length ? cc : undefined,
      bcc: bcc?.length ? bcc : undefined,
      replyTo: replyToAlias,
      subject: fullSubject,
      text: bodyText,
      html: bodyHtml || undefined,
      attachments: emailAttachments.length ? emailAttachments : undefined,
      headers,
    });
    resendId = result.data?.id ?? null;
    messageId = resendId; // Use Resend ID as our messageId reference
  } catch (err) {
    deliveryStatus = "failed";
    deliveryError =
      err instanceof Error ? err.message : "Unknown error sending email";
    console.error("[tickets-email] Send failed:", deliveryError);
  }

  // 8. Create OpsTicketComment with direction="email_out"
  const comment = await prisma.opsTicketComment.create({
    data: {
      ticketId,
      userId: sentByUserId,
      body: bodyText,
      bodyHtml: bodyHtml ?? null,
      isInternal: false,
      direction: "email_out",
      fromEmail: emailCfg.from,
      fromName: emailCfg.companyName,
      toEmails: to,
      ccEmails: cc ?? [],
      bccEmails: bcc ?? [],
      subject: fullSubject,
      messageId,
      inReplyToMessageId: inReplyToMessageId ?? null,
      threadMessageIds: threadMessageIds ?? [],
      attachments:
        commentAttachments.length > 0 ? (commentAttachments as unknown as any) : undefined,
      sentAt: deliveryStatus === "sent" ? new Date() : null,
      deliveryStatus,
      deliveryError,
      resendId,
    },
  });

  return mapComment(comment);
}

/**
 * Build the Reply-To alias for a ticket email.
 *
 * If TICKETS_INBOUND_DOMAIN is set, use it as the base domain with plus-addressing:
 *   `tickets+{ticketId}@{TICKETS_INBOUND_DOMAIN}`
 *
 * Otherwise, reuse the tenant's own sender address with plus-addressing:
 *   `notificaciones+ticket-{ticketId}@gard.cl`
 *
 * The latter is safer because the tenant's sending domain already has working
 * MX records. Inbound resolution in the webhook then relies on parsing the
 * plus-tag OR the [TKT-CODE] prefix in the subject line.
 */
export function buildReplyToAlias(ticketId: string, fromAddress: string): string {
  const inboundDomain = process.env.TICKETS_INBOUND_DOMAIN;
  if (inboundDomain) {
    return `tickets+${ticketId}@${inboundDomain}`;
  }

  // Extract the bare email from `"Name <email@domain>"` format
  const match = fromAddress.match(/<([^>]+)>/);
  const bareEmail = (match ? match[1] : fromAddress).trim();
  const [local, domain] = bareEmail.split("@");
  if (!local || !domain) {
    // Fallback: if parsing fails, use the raw address
    return `tickets+${ticketId}@opai.cl`;
  }

  // Use local+ticket-{id}@domain — plus-addressing routes to base mailbox
  return `${local}+ticket-${ticketId}@${domain}`;
}

/**
 * Parse a ticket ID from various email addressing formats.
 * Returns null if no ticket ID can be resolved.
 */
export function parseTicketIdFromEmail(input: {
  toAddresses: string[];
  subject: string;
  inReplyTo?: string | null;
  references?: string[];
}): { ticketId: string | null; method: string } {
  // 1a. Plus-addressing: tickets+{uuid}@...
  for (const addr of input.toAddresses) {
    const match = addr.match(
      /tickets\+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@/i,
    );
    if (match) {
      return { ticketId: match[1], method: "plus_addressing" };
    }
  }

  // 1b. Plus-addressing variant: local+ticket-{uuid}@domain (tenant's own domain)
  for (const addr of input.toAddresses) {
    const match = addr.match(
      /\+ticket-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@/i,
    );
    if (match) {
      return { ticketId: match[1], method: "plus_addressing" };
    }
  }

  // 2. Subject regex: [TKT-XXXX]
  const subjectMatch = input.subject?.match(/\[TKT-([A-Z0-9-]+)\]/i);
  if (subjectMatch) {
    return { ticketId: subjectMatch[1], method: "subject_code" };
  }

  // 3. In-Reply-To / References will be resolved by caller via DB lookup
  return { ticketId: null, method: "none" };
}

/** Map Prisma row to TicketComment type */
function mapComment(c: any): TicketComment {
  return {
    id: c.id,
    ticketId: c.ticketId,
    userId: c.userId,
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
