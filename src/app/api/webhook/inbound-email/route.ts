/**
 * Webhook: Resend Inbound Email (email.received)
 *
 * Cuando se reenvía un correo a {tenantSlug}@{INBOUND_DOMAIN} (ej. gard@inbound.opai.cl),
 * Resend envía un POST con type "email.received". Aquí:
 * 1. Validamos destinatario
 * 2. Obtenemos contenido completo del email vía API Resend
 * 3. Descargamos adjuntos y los subimos a R2
 * 4. Extraemos datos con OpenAI y creamos un Lead CRM para revisión
 * 5. Guardamos el email en metadata del lead y creamos notificación
 *
 * Doc: https://resend.com/docs/dashboard/inbound/introduction
 */

import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { resend } from "@/lib/resend";
import { prisma } from "@/lib/prisma";
import { uploadFile, STORAGE_PROVIDER } from "@/lib/storage";
import { extractLeadFromEmail, parseFromHeader, isGarbageEmail } from "@/lib/email-lead-extractor";

import { toSentenceCaseWords, formatChileanPhone } from "@/lib/text-format";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { resolveTenantFromSlug } from "@/lib/tenant";

const INBOUND_DOMAIN = process.env.INBOUND_DOMAIN || "inbound.opai.cl";
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10MB

/** GET: health check para confirmar que la URL del webhook responde */
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "inbound-email",
    inboundDomain: INBOUND_DOMAIN,
    pattern: `{tenantSlug}@${INBOUND_DOMAIN}`,
  });
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.text();

    // Verify Resend webhook signature via svix
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    let body: { type: string; data: Record<string, unknown> };

    if (secret) {
      const svixHeaders = {
        "svix-id": request.headers.get("svix-id") ?? "",
        "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
        "svix-signature": request.headers.get("svix-signature") ?? "",
      };

      try {
        const wh = new Webhook(secret);
        body = wh.verify(payload, svixHeaders) as typeof body;
      } catch (err) {
        console.error("[webhook/inbound-email] Signature verification failed:", err);
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    } else {
      console.warn("[webhook/inbound-email] RESEND_WEBHOOK_SECRET not set — signature verification SKIPPED");
      body = JSON.parse(payload);
    }

    const { type, data } = body;

    console.log("[inbound-email] Webhook received:", { type, emailId: data?.email_id, to: data?.to });

    if (type !== "email.received") {
      return NextResponse.json({ success: true, skipped: "not_email.received" });
    }

    const emailId = data?.email_id as string | undefined;
    const toList = (data?.to as string[]) || [];
    const ccList = (data?.cc as string[]) || [];
    const bccList = (data?.bcc as string[]) || [];
    const allRecipients = [...toList, ...ccList, ...bccList];
    if (!emailId) {
      return NextResponse.json(
        { error: "email_id requerido" },
        { status: 400 }
      );
    }

    // Extract email address from "Name <email>" or plain "email" format
    const extractEmail = (addr: string): string => {
      const s = (addr || "").trim();
      const match = s.match(/<([^>]+)>/);
      return match ? match[1].toLowerCase().trim() : s.toLowerCase();
    };

    // Find recipient matching our inbound domain ({slug}@inbound.opai.cl)
    const domainSuffix = `@${INBOUND_DOMAIN.toLowerCase()}`;
    let tenantSlug: string | null = null;
    for (const addr of allRecipients) {
      const email = extractEmail(addr);
      if (email.endsWith(domainSuffix)) {
        tenantSlug = email.replace(domainSuffix, "");
        break;
      }
    }

    if (!tenantSlug) {
      console.log("[inbound-email] Skipped: no recipient matching inbound domain", {
        to: toList,
        cc: ccList,
        bcc: bccList,
        expectedDomain: INBOUND_DOMAIN,
        hint: `El correo debe enviarse a {slug}@${INBOUND_DOMAIN}`,
      });
      return NextResponse.json({ success: true, skipped: "wrong_recipient" });
    }

    // Resolve tenant from the slug in the recipient address
    const tenant = await resolveTenantFromSlug(tenantSlug);
    if (!tenant) {
      console.log("[inbound-email] Skipped: tenant not found for slug", { tenantSlug });
      return NextResponse.json({ success: true, skipped: "tenant_not_found" });
    }
    const tenantId = tenant.id;
    const tenantCfg = await getTenantCompanyConfig(tenantId);

    const emailResponse = await resend.emails.receiving.get(emailId);
    if (emailResponse.error || !emailResponse.data) {
      console.error("[inbound-email] Error fetching email:", emailResponse.error);
      return NextResponse.json(
        { error: "No se pudo obtener el correo" },
        { status: 502 }
      );
    }

    const email = emailResponse.data;
    const from = email.from || "";
    const subject = email.subject || "(sin asunto)";
    console.log("[inbound-email] Processing", { from, subject, to: toList });
    const html = email.html ?? null;
    const text = email.text ?? null;
    const attachments = email.attachments || [];

    // ─────────────────────────────────────────────────────────
    // TICKET REPLY DETECTION
    // Before creating a lead, check if this email is a reply to an
    // existing ticket. Triggers: `+ticket-{uuid}` in recipient OR
    // `[TKT-XXX]` in subject. If matched, create an OpsTicketComment
    // and return early — do NOT create a lead.
    // ─────────────────────────────────────────────────────────
    {
      const ticketResult = await handleTicketReply({
        tenantId,
        recipients: allRecipients,
        subject,
        from,
        text,
        html,
        emailId,
        attachments,
        receivedAt: email.created_at,
      });
      if (ticketResult.handled) {
        return NextResponse.json({
          success: true,
          routed: "ticket",
          ticketId: ticketResult.ticketId,
          commentId: ticketResult.commentId,
        });
      }
    }

    if (isGarbageEmail({ textBody: text, htmlBody: html, subject })) {
      console.log("[inbound-email] Skipped: garbage content", { from, subject });
      return NextResponse.json({ success: true, skipped: "garbage_content" });
    }

    let extracted: Awaited<ReturnType<typeof extractLeadFromEmail>>;
    try {
      extracted = await extractLeadFromEmail({
        subject,
        htmlBody: html,
        textBody: text,
        fromEmail: from,
        ownDomain: tenantCfg.website || undefined,
        ownCompanyName: tenantCfg.commercialName || undefined,
      });
    } catch (extractErr) {
      console.warn("[inbound-email] Extract failed, creating lead from envelope:", extractErr);
      const parsedFrom = parseFromHeader(from || "");
      const nameParts = parsedFrom.name?.split(/\s+/) || [];
      extracted = {
        companyName: null,
        rut: null,
        legalName: null,
        businessActivity: null,
        legalRepresentativeName: null,
        contactFirstName: nameParts[0] || null,
        contactLastName: nameParts.slice(1).join(" ") || null,
        contactEmail: parsedFrom.email || null,
        contactPhone: null,
        contactRole: null,
        address: null,
        city: null,
        commune: null,
        serviceType: null,
        serviceDuration: null,
        coverageDetails: null,
        guardsPerShift: null,
        numberOfLocations: null,
        startDate: null,
        summary: subject,
        industry: null,
        website: null,
      };
    }

    const firstName = toSentenceCaseWords(extracted.contactFirstName?.trim() || "") ?? null;
    const lastName = toSentenceCaseWords(extracted.contactLastName?.trim() || "") ?? null;
    const companyName = toSentenceCaseWords(extracted.companyName?.trim() || "") ?? null;
    const contactRole = toSentenceCaseWords(extracted.contactRole?.trim() || "") ?? null;
    const phone = formatChileanPhone(extracted.contactPhone) ?? (extracted.contactPhone?.trim() || null);

    console.log("[inbound-email] Extracted data:", {
      companyName: extracted.companyName,
      contactFirstName: extracted.contactFirstName,
      contactLastName: extracted.contactLastName,
      contactEmail: extracted.contactEmail,
      hasSummary: !!extracted.summary,
      summaryPreview: extracted.summary?.slice(0, 80),
    });

    const notesParts: string[] = [];
    if (extracted.summary) notesParts.push(extracted.summary);
    if (extracted.coverageDetails) notesParts.push(`Cobertura: ${extracted.coverageDetails}`);
    if (extracted.serviceDuration) notesParts.push(`Duración: ${extracted.serviceDuration}`);
    if (extracted.guardsPerShift) notesParts.push(`Guardias por turno: ${extracted.guardsPerShift}`);
    if (extracted.numberOfLocations) notesParts.push(`Puntos a cubrir: ${extracted.numberOfLocations}`);
    if (extracted.startDate) notesParts.push(`Inicio estimado: ${extracted.startDate}`);
    if (extracted.businessActivity) notesParts.push(`Giro: ${extracted.businessActivity}`);
    const notes = notesParts.length > 0 ? notesParts.join("\n\n") : null;

    const lead = await prisma.crmLead.create({
      data: {
        tenantId,
        status: "pending",
        source: "email_forward",
        firstName,
        lastName,
        email: extracted.contactEmail?.trim() || null,
        phone,
        companyName,
        notes,
        industry: extracted.industry?.trim() || null,
        address: extracted.address?.trim() || null,
        commune: extracted.commune?.trim() || null,
        city: extracted.city?.trim() || null,
        website: extracted.website?.trim() || null,
        serviceType: extracted.serviceType?.trim() || null,
        metadata: {
          inboundEmail: {
            subject,
            html: html?.slice(0, 100_000) ?? null,
            text: text?.slice(0, 50_000) ?? null,
            from,
            to: toList,
            receivedAt: email.created_at,
            resendEmailId: emailId,
          },
          extracted: {
            rut: extracted.rut || null,
            legalName: extracted.legalName || null,
            businessActivity: extracted.businessActivity || null,
            legalRepresentativeName: extracted.legalRepresentativeName || null,
            contactRole,
            guardsPerShift: extracted.guardsPerShift || null,
            numberOfLocations: extracted.numberOfLocations || null,
            startDate: extracted.startDate || null,
          },
        },
      },
    });

    for (const att of attachments) {
      try {
        const attResponse = await resend.emails.receiving.attachments.get({
          emailId,
          id: att.id,
        });
        if (attResponse.error || !attResponse.data?.download_url) continue;
        const downloadUrl = attResponse.data.download_url;
        const filename = attResponse.data.filename || att.filename || `attachment-${att.id}`;
        const contentType = attResponse.data.content_type || att.content_type || "application/octet-stream";
        const res = await fetch(downloadUrl);
        if (!res.ok) continue;
        const buffer = Buffer.from(await res.arrayBuffer());
        if (buffer.length > MAX_ATTACHMENT_SIZE) continue;
        const result = await uploadFile(buffer, filename, contentType, "leads", tenantId);
        const crmFile = await prisma.crmFile.create({
          data: {
            tenantId,
            fileName: result.fileName,
            mimeType: result.mimeType,
            size: result.size,
            storageProvider: STORAGE_PROVIDER,
            storageKey: result.storageKey,
            createdBy: null,
          },
        });
        await prisma.crmFileLink.create({
          data: {
            tenantId,
            fileId: crmFile.id,
            entityType: "lead",
            entityId: lead.id,
          },
        });
      } catch (err) {
        console.warn("[inbound-email] Skip attachment:", att.id, err);
      }
    }

    try {
      const { sendNotification } = await import("@/lib/notification-service");
      await sendNotification({
        tenantId,
        type: "new_lead",
        title: "Nuevo lead por correo",
        message: `${extracted.companyName || "Sin empresa"} – ${subject}`,
        data: { leadId: lead.id, source: "email_forward" },
        link: `/crm/leads?focus=${lead.id}`,
      });
    } catch (e) {
      console.warn("[inbound-email] Failed to send notification", e);
    }

    return NextResponse.json({ success: true, leadId: lead.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error("[inbound-email] Error:", error);
    return NextResponse.json(
      {
        error: "Error procesando correo entrante",
        detail: message,
        ...(process.env.NODE_ENV === "development" && stack ? { stack } : {}),
      },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════
//  TICKET REPLY HANDLER
// ═══════════════════════════════════════════════════════════════

interface HandleTicketReplyInput {
  tenantId: string;
  recipients: string[];
  subject: string;
  from: string;
  text: string | null;
  html: string | null;
  emailId: string;
  attachments: Array<{ id: string; filename?: string | null; content_type?: string | null }>;
  receivedAt?: string;
}

interface HandleTicketReplyResult {
  handled: boolean;
  ticketId?: string;
  commentId?: string;
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

async function handleTicketReply(
  input: HandleTicketReplyInput,
): Promise<HandleTicketReplyResult> {
  const { tenantId, recipients, subject, from, text, html, emailId, attachments, receivedAt } = input;

  // 1. Try to resolve the ticket:
  //    a) Plus-addressing: {slug}+ticket-{uuid}@inbound.opai.cl
  //    b) Subject regex: [TKT-CODE]
  let ticketId: string | null = null;

  const extractEmail = (addr: string): string => {
    const s = (addr || "").trim();
    const match = s.match(/<([^>]+)>/);
    return match ? match[1].toLowerCase().trim() : s.toLowerCase();
  };

  // a) Plus-addressing in recipient
  for (const addr of recipients) {
    const email = extractEmail(addr);
    const match = email.match(
      /\+ticket-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@/i,
    );
    if (match) {
      ticketId = match[1];
      break;
    }
  }

  // b) Subject regex: [TKT-CODE] → look up by code
  if (!ticketId) {
    const subjectMatch = subject?.match(/\[TKT-([A-Z0-9-]+)\]/i);
    if (subjectMatch) {
      const code = subjectMatch[1];
      const ticketByCode = await prisma.opsTicket.findFirst({
        where: { code: `TK-${code}`, tenantId },
        select: { id: true },
      });
      if (ticketByCode) {
        ticketId = ticketByCode.id;
      } else {
        // Try raw code (without TK- prefix)
        const ticketByRawCode = await prisma.opsTicket.findFirst({
          where: { code, tenantId },
          select: { id: true },
        });
        if (ticketByRawCode) ticketId = ticketByRawCode.id;
      }
    }
  }

  if (!ticketId) {
    return { handled: false };
  }

  // 2. Verify ticket exists and belongs to tenant
  const ticket = await prisma.opsTicket.findFirst({
    where: { id: ticketId, tenantId },
    select: {
      id: true,
      code: true,
      title: true,
      status: true,
      assignedTo: true,
      assignedTeam: true,
      tenantId: true,
    },
  });
  if (!ticket) {
    console.warn("[inbound-email] Ticket found in address but not in DB:", ticketId);
    return { handled: false };
  }

  // 3. Idempotency: check if we already have a comment with this resendId
  const existing = await prisma.opsTicketComment.findFirst({
    where: { ticketId: ticket.id, resendId: emailId },
    select: { id: true },
  });
  if (existing) {
    return { handled: true, ticketId: ticket.id, commentId: existing.id };
  }

  // 4. Loop prevention: skip auto-replies
  if (/auto-?repl(y|ied)|noreply|no-reply|mailer-daemon|postmaster/i.test(from)) {
    console.log("[inbound-email] Skipped ticket reply: loop prevention", { from });
    return { handled: true, ticketId: ticket.id };
  }

  // 5. Parse from header → email + name
  const fromMatch = from.match(/^(.*?)\s*<([^>]+)>$/);
  const fromName = fromMatch?.[1]?.trim().replace(/^["']|["']$/g, "") || null;
  const fromEmail = (fromMatch?.[2] || from).trim().toLowerCase();

  // 6. Upload attachments to R2
  const commentAttachments: Array<{
    fileName: string;
    r2Key: string;
    size: number;
    contentType: string;
    url: string;
  }> = [];

  for (const att of attachments) {
    try {
      const attResponse = await resend.emails.receiving.attachments.get({
        emailId,
        id: att.id,
      });
      if (attResponse.error || !attResponse.data?.download_url) continue;
      const downloadUrl = attResponse.data.download_url;
      const filename =
        attResponse.data.filename || att.filename || `attachment-${att.id}`;
      const contentType =
        attResponse.data.content_type || att.content_type || "application/octet-stream";
      const res = await fetch(downloadUrl);
      if (!res.ok) continue;
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length > MAX_ATTACHMENT_SIZE) continue;
      const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      const result = await uploadFile(
        buffer,
        sanitized,
        contentType,
        `tickets/${tenantId}/${ticket.id}/inbound`,
        tenantId,
      );
      commentAttachments.push({
        fileName: filename,
        r2Key: result.storageKey,
        size: buffer.length,
        contentType,
        url: result.publicUrl,
      });
    } catch (err) {
      console.warn("[inbound-email] Skip ticket attachment:", att.id, err);
    }
  }

  // 7. Create the comment
  const bodyText = text || (html ? stripHtml(html) : "");
  const comment = await prisma.opsTicketComment.create({
    data: {
      ticketId: ticket.id,
      userId: "email-inbound",
      direction: "email_in",
      body: bodyText,
      bodyHtml: html,
      fromEmail,
      fromName,
      toEmails: recipients.map(extractEmail),
      subject,
      messageId: emailId,
      attachments: (commentAttachments.length > 0 ? (commentAttachments as unknown as any) : undefined),
      isInternal: false,
      sentAt: receivedAt ? new Date(receivedAt) : new Date(),
      deliveryStatus: "delivered",
      resendId: emailId,
    },
  });

  // 8. Reopen if resolved/closed
  if (["resolved", "closed"].includes(ticket.status)) {
    await prisma.opsTicket.update({
      where: { id: ticket.id },
      data: { status: "in_progress" },
    });
    await prisma.opsTicketComment.create({
      data: {
        ticketId: ticket.id,
        userId: "system",
        body: `Ticket reabierto automáticamente por respuesta entrante de ${fromEmail}`,
        isInternal: true,
        direction: "internal",
      },
    });
  }

  // 9. Notify assignee or team
  try {
    const { sendNotification, sendNotificationToUser } = await import(
      "@/lib/notification-service"
    );
    const notifPayload = {
      tenantId: ticket.tenantId,
      type: "ticket_new_email_reply",
      title: `Respuesta en ${ticket.code}`,
      message: `${fromName || fromEmail} respondió en "${ticket.title}"`,
      data: { ticketId: ticket.id, code: ticket.code, fromEmail },
      link: `/ops/tickets/${ticket.id}`,
    };
    if (ticket.assignedTo) {
      await sendNotificationToUser({
        ...notifPayload,
        targetUserId: ticket.assignedTo,
      });
    } else {
      await sendNotification(notifPayload);
    }
  } catch (notifErr) {
    console.warn("[inbound-email] Failed to send ticket notification:", notifErr);
  }

  console.log("[inbound-email] Routed to ticket:", {
    ticketId: ticket.id,
    code: ticket.code,
    commentId: comment.id,
  });

  return { handled: true, ticketId: ticket.id, commentId: comment.id };
}
