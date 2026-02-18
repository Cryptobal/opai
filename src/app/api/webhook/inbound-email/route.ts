/**
 * Webhook: Resend Inbound Email (email.received)
 *
 * Cuando se reenvía un correo a la dirección configurada (ej. leads@inbound.gard.cl),
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
import { resend } from "@/lib/resend";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { uploadFile, STORAGE_PROVIDER } from "@/lib/storage";
import { extractLeadFromEmail } from "@/lib/email-lead-extractor";

import { toSentenceCase } from "@/lib/text-format";

const INBOUND_LEADS_TO = process.env.INBOUND_LEADS_EMAIL || "leads@inbound.gard.cl";
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10MB

/** GET: health check para confirmar que la URL del webhook responde */
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "inbound-email",
    expectedRecipient: INBOUND_LEADS_TO,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, data } = body;

    console.log("[inbound-email] Webhook received:", { type, emailId: data?.email_id, to: data?.to });

    if (type !== "email.received") {
      return NextResponse.json({ success: true, skipped: "not_email.received" });
    }

    const emailId = data?.email_id as string | undefined;
    const toList = (data?.to as string[]) || [];
    if (!emailId) {
      return NextResponse.json(
        { error: "email_id requerido" },
        { status: 400 }
      );
    }

    const isForLeads = toList.some(
      (addr: string) => addr.toLowerCase().replace(/\s/g, "") === INBOUND_LEADS_TO.toLowerCase().replace(/\s/g, "")
    );
    if (!isForLeads) {
      console.log("[inbound-email] Skipped: recipient not matched", { toList, expected: INBOUND_LEADS_TO });
      return NextResponse.json({ success: true, skipped: "wrong_recipient" });
    }

    const tenantId = await getDefaultTenantId();

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
    const html = email.html ?? null;
    const text = email.text ?? null;
    const attachments = email.attachments || [];

    const extracted = await extractLeadFromEmail({
      subject,
      htmlBody: html,
      textBody: text,
      fromEmail: from,
      ownDomain: "gard.cl",
    });

    const firstName = toSentenceCase(extracted.contactFirstName?.trim() || "") ?? null;
    const lastName = toSentenceCase(extracted.contactLastName?.trim() || "") ?? null;
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
        phone: extracted.contactPhone?.trim() || null,
        companyName: extracted.companyName?.trim() || null,
        notes,
        industry: extracted.industry?.trim() || null,
        address: extracted.address?.trim() || null,
        commune: extracted.commune?.trim() || null,
        city: extracted.city?.trim() || null,
        website: null,
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
            contactRole: extracted.contactRole || null,
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
        const result = await uploadFile(buffer, filename, contentType, "leads");
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
    console.error("[inbound-email] Error:", error);
    return NextResponse.json(
      { error: "Error procesando correo entrante" },
      { status: 500 }
    );
  }
}
