/**
 * API Route: /api/crm/gmail/sync
 * GET - Sincroniza correos recientes de Gmail
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { decryptText } from "@/lib/crypto";
import { getGmailClient } from "@/lib/gmail";

function getHeader(headers: { name?: string | null; value?: string | null }[], name: string) {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const tenantId = session.user?.tenantId ?? (await getDefaultTenantId());
    const maxResults = Number(request.nextUrl.searchParams.get("max") || 10);

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

    const list = await gmail.users.messages.list({
      userId: "me",
      maxResults,
      labelIds: ["INBOX", "SENT"],
    });

    const messages = list.data.messages || [];

    for (const message of messages) {
      if (!message.id) continue;
      const existing = await prisma.crmEmailMessage.findFirst({
        where: { providerMessageId: message.id, tenantId },
      });
      if (existing) continue;

      const full = await gmail.users.messages.get({
        userId: "me",
        id: message.id,
        format: "full",
      });

      const payload = full.data.payload;
      const headers = payload?.headers || [];
      const subject = getHeader(headers, "Subject") || "Sin asunto";
      const fromEmail = getHeader(headers, "From");
      const toEmail = getHeader(headers, "To");
      const ccEmail = getHeader(headers, "Cc");
      const dateHeader = getHeader(headers, "Date");
      const labelIds = full.data.labelIds || [];
      const direction = labelIds.includes("SENT") ? "out" : "in";

      const thread = await prisma.crmEmailThread.findFirst({
        where: {
          tenantId,
          subject,
        },
      });

      const threadRecord = thread
        ? thread
        : await prisma.crmEmailThread.create({
            data: {
              tenantId,
              subject,
              lastMessageAt: new Date(),
            },
          });

      await prisma.crmEmailMessage.create({
        data: {
          tenantId,
          threadId: threadRecord.id,
          providerMessageId: message.id,
          direction,
          fromEmail: fromEmail || emailAccount.email,
          toEmails: toEmail ? [toEmail] : [],
          ccEmails: ccEmail ? [ccEmail] : [],
          subject,
          htmlBody: null,
          textBody: null,
          sentAt: dateHeader ? new Date(dateHeader) : new Date(),
          createdBy: session.user.id,
        },
      });

      await prisma.crmEmailThread.update({
        where: { id: threadRecord.id },
        data: { lastMessageAt: new Date() },
      });
    }

    return NextResponse.json({ success: true, count: messages.length });
  } catch (error) {
    console.error("Error syncing Gmail:", error);
    return NextResponse.json(
      { success: false, error: "Failed to sync Gmail" },
      { status: 500 }
    );
  }
}
