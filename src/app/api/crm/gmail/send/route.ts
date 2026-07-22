/**
 * API Route: /api/crm/gmail/send
 * POST - Enviar correo con Gmail conectado
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { decryptText } from "@/lib/crypto";
import { getGmailClient } from "@/lib/gmail";
import { normalizeEmailAddress, normalizeEmailList } from "@/lib/email-address";
import { requireTenantModule } from '@/lib/require-module';
import { resolveReplyContext } from "@/modules/crm/email/gmail-reply";

/** RFC 2047: los headers MIME son ASCII — un asunto con acentos va codificado. */
function encodeHeaderWord(s: string): string {
  return /[^\x20-\x7e]/.test(s) ? `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=` : s;
}

function buildRawEmail({
  from,
  to,
  cc,
  bcc,
  subject,
  html,
  text,
  inReplyTo,
  references,
}: {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html?: string;
  text?: string;
  inReplyTo?: string;
  references?: string;
}) {
  const headers = [
    `From: ${from}`,
    `To: ${to.join(", ")}`,
    cc?.length ? `Cc: ${cc.join(", ")}` : null,
    bcc?.length ? `Bcc: ${bcc.join(", ")}` : null,
    `Subject: ${encodeHeaderWord(subject)}`,
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : null,
    references ? `References: ${references}` : null,
    "MIME-Version: 1.0",
    html
      ? 'Content-Type: text/html; charset="UTF-8"'
      : 'Content-Type: text/plain; charset="UTF-8"',
  ]
    .filter(Boolean)
    .join("\r\n");

  const body = html || text || "";
  const raw = `${headers}\r\n\r\n${body}`;
  return Buffer.from(raw).toString("base64url");
}

export async function POST(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx);
    if (forbidden) return forbidden;

    const body = await request.json();

    const { to, cc = [], bcc = [], subject, html, text, dealId, accountId, contactId, threadId } = body;

    // `to` acepta string (compat) o string[] (Para editable / Responder a todos).
    const toList = (Array.isArray(to) ? to : [to]).filter(
      (v: unknown): v is string => typeof v === "string" && v.trim().length > 0,
    );
    if (toList.length === 0 || !subject) {
      return NextResponse.json(
        { success: false, error: "to y subject son requeridos" },
        { status: 400 }
      );
    }

    const ccList = Array.isArray(cc) ? cc : [cc];
    const bccList = Array.isArray(bcc) ? bcc : [bcc];
    const normalizedToEmails = normalizeEmailList(toList);
    const normalizedCcEmails = normalizeEmailList(ccList);
    const normalizedBccEmails = normalizeEmailList(bccList);

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
        { success: false, error: "Gmail no conectado" },
        { status: 400 }
      );
    }

    const tokenSecret = process.env.GMAIL_TOKEN_SECRET || "dev-secret";
    const accessToken = decryptText(emailAccount.accessTokenEncrypted, tokenSecret);
    const refreshToken = emailAccount.refreshTokenEncrypted
      ? decryptText(emailAccount.refreshTokenEncrypted, tokenSecret)
      : undefined;

    // ── Inyectar firma del usuario ──
    let finalHtml = html || "";
    let signatureId: string | null = null;

    try {
      const signature = await prisma.crmEmailSignature.findFirst({
        where: {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          isDefault: true,
          isActive: true,
        },
      });

      // Si no hay firma del usuario, buscar firma default del tenant
      const sig =
        signature ||
        (await prisma.crmEmailSignature.findFirst({
          where: {
            tenantId: ctx.tenantId,
            isDefault: true,
            isActive: true,
          },
        }));

      if (sig?.htmlContent) {
        finalHtml += sig.htmlContent;
        signatureId = sig.id;
      }
    } catch (sigError) {
      console.error("Error cargando firma:", sigError);
    }

    const gmail = getGmailClient(accessToken, refreshToken);

    // Modo respuesta en hilo: si viene threadId (CrmEmailThread interno), agrupa
    // en el mismo hilo de Gmail y agrega headers In-Reply-To/References.
    const replyCtx = threadId
      ? await resolveReplyContext({ gmail, tenantId: ctx.tenantId, threadId })
      : null;

    const raw = buildRawEmail({
      from: emailAccount.email,
      to: toList,
      cc: ccList,
      bcc: bccList,
      subject,
      html: finalHtml || undefined,
      text: finalHtml ? undefined : text,
      inReplyTo: replyCtx?.inReplyTo ?? undefined,
      references: replyCtx?.references ?? undefined,
    });

    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw, ...(replyCtx?.gmailThreadId ? { threadId: replyCtx.gmailThreadId } : {}) },
    });

    const messageId = response.data.id;

    const thread = replyCtx
      ? null
      : await prisma.crmEmailThread.findFirst({
          where: {
            tenantId: ctx.tenantId,
            subject,
            accountId: accountId || null,
            contactId: contactId || null,
            dealId: dealId || null,
          },
        });

    const threadRecord = replyCtx
      ? { id: replyCtx.threadId }
      : thread
        ? thread
        : await prisma.crmEmailThread.create({
            data: {
              tenantId: ctx.tenantId,
              subject,
              accountId: accountId || null,
              contactId: contactId || null,
              dealId: dealId || null,
              lastMessageAt: new Date(),
            },
          });

    const message = await prisma.crmEmailMessage.create({
      data: {
        tenantId: ctx.tenantId,
        threadId: threadRecord.id,
        providerMessageId: messageId || null,
        direction: "out",
        fromEmail: normalizeEmailAddress(emailAccount.email),
        toEmails: normalizedToEmails.length
          ? normalizedToEmails
          : toList.map(normalizeEmailAddress),
        ccEmails: normalizedCcEmails,
        bccEmails: normalizedBccEmails,
        subject,
        htmlBody: finalHtml || null,
        textBody: text || null,
        sentAt: new Date(),
        createdBy: ctx.userId,
        status: "sent",
        source: "gmail",
        signatureId,
      },
    });

    // Responder NO reordena la bandeja: el orden lo manda el último correo
    // RECIBIDO (como Gmail). Solo se registra firstReplyAt (KPI de respuesta)
    // en la primera respuesta al inbound; lastMessageAt no se toca.
    if (replyCtx && !replyCtx.firstReplyAt) {
      await prisma.crmEmailThread.update({
        where: { id: threadRecord.id },
        data: { firstReplyAt: new Date() },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        threadId: threadRecord.id,
        messageId: message.id,
        providerMessageId: messageId,
      },
    });
  } catch (error) {
    console.error("Error sending Gmail:", error);
    const e = error as { code?: number; status?: number; response?: { status?: number } };
    const status = e?.code ?? e?.status ?? e?.response?.status;
    if (status === 401 || status === 403) {
      return NextResponse.json(
        {
          success: false,
          error: "Gmail rechazó el envío (permisos). Reconectá tu casilla desde Integraciones.",
        },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { success: false, error: "No se pudo enviar el correo por Gmail" },
      { status: 502 }
    );
  }
}
