/**
 * API Route: /api/crm/gmail/send
 * POST - Enviar correo con Gmail conectado
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { decryptText } from "@/lib/crypto";
import { getGmailClient } from "@/lib/gmail";

function buildRawEmail({
  from,
  to,
  cc,
  bcc,
  subject,
  html,
  text,
}: {
  from: string;
  to: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  html?: string;
  text?: string;
}) {
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    cc?.length ? `Cc: ${cc.join(", ")}` : null,
    bcc?.length ? `Bcc: ${bcc.join(", ")}` : null,
    `Subject: ${subject}`,
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
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const tenantId = session.user?.tenantId ?? (await getDefaultTenantId());
    const body = await request.json();

    const { to, cc = [], bcc = [], subject, html, text, dealId, accountId, contactId } = body;

    if (!to || !subject) {
      return NextResponse.json(
        { success: false, error: "to y subject son requeridos" },
        { status: 400 }
      );
    }

    const emailAccount = await prisma.crmEmailAccount.findFirst({
      where: {
        tenantId,
        userId: session.user.id,
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

    const gmail = getGmailClient(accessToken, refreshToken);
    const raw = buildRawEmail({
      from: emailAccount.email,
      to,
      cc,
      bcc,
      subject,
      html,
      text,
    });

    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });

    const messageId = response.data.id;

    const thread = await prisma.crmEmailThread.findFirst({
      where: {
        tenantId,
        subject,
        accountId: accountId || null,
        contactId: contactId || null,
        dealId: dealId || null,
      },
    });

    const threadRecord = thread
      ? thread
      : await prisma.crmEmailThread.create({
          data: {
            tenantId,
            subject,
            accountId: accountId || null,
            contactId: contactId || null,
            dealId: dealId || null,
            lastMessageAt: new Date(),
          },
        });

    const message = await prisma.crmEmailMessage.create({
      data: {
        tenantId,
        threadId: threadRecord.id,
        providerMessageId: messageId || null,
        direction: "out",
        fromEmail: emailAccount.email,
        toEmails: [to],
        ccEmails: cc,
        bccEmails: bcc,
        subject,
        htmlBody: html || null,
        textBody: text || null,
        sentAt: new Date(),
        createdBy: session.user.id,
      },
    });

    await prisma.crmEmailThread.update({
      where: { id: threadRecord.id },
      data: { lastMessageAt: new Date() },
    });

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
    return NextResponse.json(
      { success: false, error: "Failed to send email" },
      { status: 500 }
    );
  }
}
