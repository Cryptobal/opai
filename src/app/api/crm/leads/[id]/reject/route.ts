/**
 * API Route: /api/crm/leads/[id]/reject
 * POST - Rechazar lead (mantener en CRM Leads) con motivo y correo opcional.
 */

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { rejectLeadSchema } from "@/lib/validations/crm";
import { decryptText } from "@/lib/crypto";
import { getGmailClient } from "@/lib/gmail";
import { normalizeEmailAddress, normalizeEmailList } from "@/lib/email-address";
import { requireTenantModule } from '@/lib/require-module';

function buildRawEmail({
  from,
  to,
  subject,
  html,
  text,
}: {
  from: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
}) {
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    html
      ? 'Content-Type: text/html; charset="UTF-8"'
      : 'Content-Type: text/plain; charset="UTF-8"',
  ].join("\r\n");

  const body = html || text || "";
  const raw = `${headers}\r\n\r\n${body}`;
  return Buffer.from(raw).toString("base64url");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function stripHtml(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function plainTextToHtml(value: string): string {
  const lines = value.split(/\r?\n/);
  return lines
    .map((line) => {
      const clean = escapeHtml(line.trim());
      return clean ? `<p style="margin:0 0 8px;">${clean}</p>` : `<p style="margin:0 0 8px;">&nbsp;</p>`;
    })
    .join("");
}

function normalizeEmailBody(body: string): { html: string; text: string } {
  const trimmed = body.trim();
  const hasHtmlTags = /<\/?[a-z][\s\S]*>/i.test(trimmed);
  if (hasHtmlTags) {
    return {
      html: trimmed,
      text: stripHtml(trimmed),
    };
  }
  return {
    html: plainTextToHtml(trimmed),
    text: trimmed,
  };
}

type LeadMetadata = Record<string, unknown>;

function parseLeadMetadata(value: unknown): LeadMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as LeadMetadata;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx, "leads");
    if (forbidden) return forbidden;

    const { id } = await params;
    const parsed = await parseBody(request, rejectLeadSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const lead = await prisma.crmLead.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!lead) {
      return NextResponse.json(
        { success: false, error: "Lead no encontrado" },
        { status: 404 }
      );
    }

    if (lead.status === "approved") {
      return NextResponse.json(
        {
          success: false,
          error:
            "El lead ya fue aprobado y convertido. No se puede rechazar en este estado.",
        },
        { status: 400 }
      );
    }

    const emailTo = (lead.email || "").trim();
    let emailSent = false;
    let providerMessageId: string | null = null;
    const normalizedReason = body.reason;

    let finalSubject = body.emailSubject?.trim() || "";
    let finalBody = body.emailBody?.trim() || "";
    let resolvedTemplateId: string | null = body.emailTemplateId ?? null;

    if (body.sendEmail) {
      if (!emailTo) {
        return NextResponse.json(
          { success: false, error: "El lead no tiene email para enviar respuesta." },
          { status: 400 }
        );
      }

      if (body.emailTemplateId) {
        const template = await prisma.crmEmailTemplate.findFirst({
          where: { id: body.emailTemplateId, tenantId: ctx.tenantId },
          select: { id: true, subject: true, body: true },
        });
        if (!template) {
          return NextResponse.json(
            { success: false, error: "Template de correo no encontrado." },
            { status: 404 }
          );
        }
        finalSubject = template.subject;
        finalBody = template.body;
        resolvedTemplateId = template.id;
      }

      if (!finalSubject || !finalBody) {
        return NextResponse.json(
          {
            success: false,
            error: "Asunto y cuerpo del correo son requeridos al enviar respuesta.",
          },
          { status: 400 }
        );
      }

      const emailAccount = await prisma.crmEmailAccount.findFirst({
        where: {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          provider: "gmail",
          status: "active",
        },
      });
      if (!emailAccount || !emailAccount.accessTokenEncrypted) {
        return NextResponse.json(
          { success: false, error: "Gmail no conectado para el usuario actual." },
          { status: 400 }
        );
      }

      const tokenSecret = process.env.GMAIL_TOKEN_SECRET || "dev-secret";
      const accessToken = decryptText(emailAccount.accessTokenEncrypted, tokenSecret);
      const refreshToken = emailAccount.refreshTokenEncrypted
        ? decryptText(emailAccount.refreshTokenEncrypted, tokenSecret)
        : undefined;

      const normalizedBody = normalizeEmailBody(finalBody);
      let finalHtml = normalizedBody.html;
      let signatureId: string | null = null;

      const signature =
        (await prisma.crmEmailSignature.findFirst({
          where: {
            tenantId: ctx.tenantId,
            userId: ctx.userId,
            isDefault: true,
            isActive: true,
          },
        })) ||
        (await prisma.crmEmailSignature.findFirst({
          where: {
            tenantId: ctx.tenantId,
            isDefault: true,
            isActive: true,
          },
        }));

      if (signature?.htmlContent) {
        finalHtml += signature.htmlContent;
        signatureId = signature.id;
      }

      const gmail = getGmailClient(accessToken, refreshToken);
      const raw = buildRawEmail({
        from: emailAccount.email,
        to: emailTo,
        subject: finalSubject,
        html: finalHtml,
        text: normalizedBody.text,
      });

      const response = await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw },
      });
      providerMessageId = response.data.id || null;

      const thread = await prisma.crmEmailThread.create({
        data: {
          tenantId: ctx.tenantId,
          subject: finalSubject,
          lastMessageAt: new Date(),
        },
      });

      await prisma.crmEmailMessage.create({
        data: {
          tenantId: ctx.tenantId,
          threadId: thread.id,
          providerMessageId,
          direction: "out",
          fromEmail: normalizeEmailAddress(emailAccount.email),
          toEmails: normalizeEmailList([emailTo]),
          ccEmails: [],
          bccEmails: [],
          subject: finalSubject,
          htmlBody: finalHtml,
          textBody: normalizedBody.text || null,
          sentAt: new Date(),
          createdBy: ctx.userId,
          status: "sent",
          source: "gmail",
          signatureId,
        },
      });

      emailSent = true;
    }

    const now = new Date();
    const previousMetadata = parseLeadMetadata(lead.metadata);
    const updatedMetadata: LeadMetadata = {
      ...previousMetadata,
      rejection: {
        reason: normalizedReason,
        note: body.note?.trim() || null,
        rejectedAt: now.toISOString(),
        rejectedBy: ctx.userId,
        emailSent,
        emailTemplateId: resolvedTemplateId,
        emailSubject: emailSent ? finalSubject : null,
        emailProviderMessageId: providerMessageId,
      },
    };

    const updatedLead = await prisma.crmLead.update({
      where: { id: lead.id },
      data: {
        status: "rejected",
        metadata: updatedMetadata as Prisma.InputJsonValue,
      },
    });

    await prisma.crmHistoryLog.create({
      data: {
        tenantId: ctx.tenantId,
        entityType: "lead",
        entityId: lead.id,
        action: "lead_rejected",
        details: {
          reason: normalizedReason,
          note: body.note?.trim() || null,
          emailSent,
          emailTemplateId: resolvedTemplateId,
        },
        createdBy: ctx.userId,
      },
    });

    return NextResponse.json({
      success: true,
      data: updatedLead,
      email: { sent: emailSent },
    });
  } catch (error) {
    console.error("Error rejecting CRM lead:", error);
    return NextResponse.json(
      { success: false, error: "Error al rechazar el lead" },
      { status: 500 }
    );
  }
}
