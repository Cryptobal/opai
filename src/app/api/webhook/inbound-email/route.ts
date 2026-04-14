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
      try {
        body = JSON.parse(payload);
      } catch {
        return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
      }
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
    console.log("[inbound-email] Processing for leads", { from, subject, to: toList });
    const html = email.html ?? null;
    const text = email.text ?? null;
    const attachments = email.attachments || [];

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
