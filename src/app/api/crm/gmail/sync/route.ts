/**
 * API Route: /api/crm/gmail/sync
 * GET - Sincroniza correos recientes de Gmail
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decryptText } from "@/lib/crypto";
import { getGmailClient } from "@/lib/gmail";
import { extractEmailAddresses, normalizeEmailAddress } from "@/lib/email-address";
import { extractGmailMessageBodies, type GmailMessagePart } from "@/lib/gmail-message-content";
import { requireTenantModule } from '@/lib/require-module';

function getHeader(headers: { name?: string | null; value?: string | null }[], name: string) {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

function parseDateHeader(value: string): Date {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export async function GET(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const tenantId = session.user.tenantId;
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }
    const maxResults = Math.min(
      Math.max(Number(request.nextUrl.searchParams.get("max") || "20"), 1),
      100
    );

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

    const [inboxList, sentList] = await Promise.all([
      gmail.users.messages.list({
        userId: "me",
        maxResults,
        labelIds: ["INBOX"],
      }),
      gmail.users.messages.list({
        userId: "me",
        maxResults,
        labelIds: ["SENT"],
      }),
    ]);

    const uniqueMessages = new Map<string, { id?: string | null }>();
    for (const message of [
      ...(inboxList.data.messages || []),
      ...(sentList.data.messages || []),
    ]) {
      if (message.id) uniqueMessages.set(message.id, message);
    }
    const messages = Array.from(uniqueMessages.values());
    let syncedCount = 0;

    for (const message of messages) {
      if (!message.id) continue;
      const existing = await prisma.crmEmailMessage.findFirst({
        where: { providerMessageId: message.id, tenantId },
      });
      const shouldBackfillExisting =
        Boolean(existing) && !existing?.htmlBody && !existing?.textBody;
      if (existing && !shouldBackfillExisting) continue;

      const full = await gmail.users.messages.get({
        userId: "me",
        id: message.id,
        format: "full",
      });

      const payload = full.data.payload;
      const headers = payload?.headers || [];
      const subject = getHeader(headers, "Subject") || "Sin asunto";
      const fromHeader = getHeader(headers, "From");
      const toHeader = getHeader(headers, "To");
      const ccHeader = getHeader(headers, "Cc");
      const bccHeader = getHeader(headers, "Bcc");
      const dateHeader = getHeader(headers, "Date");
      const labelIds = full.data.labelIds || [];
      const direction = labelIds.includes("SENT") ? "out" : "in";
      const fromEmail =
        extractEmailAddresses(fromHeader)[0] ||
        normalizeEmailAddress(emailAccount.email);
      const toEmails = extractEmailAddresses(toHeader);
      const ccEmails = extractEmailAddresses(ccHeader);
      const bccEmails = extractEmailAddresses(bccHeader);
      const sentOrReceivedAt = parseDateHeader(dateHeader);
      const { htmlBody, textBody } = extractGmailMessageBodies(payload as GmailMessagePart | undefined);
      const snippet = full.data.snippet?.trim() || null;

      if (existing) {
        await prisma.crmEmailMessage.update({
          where: { id: existing.id },
          data: {
            direction,
            fromEmail,
            toEmails,
            ccEmails,
            bccEmails,
            subject,
            htmlBody,
            textBody: textBody || snippet,
            sentAt: sentOrReceivedAt,
            receivedAt: direction === "in" ? sentOrReceivedAt : null,
            status: direction === "out" ? "sent" : "received",
            source: "gmail",
          },
        });
        syncedCount += 1;
        continue;
      }

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
              lastMessageAt: sentOrReceivedAt,
            },
          });

      await prisma.crmEmailMessage.create({
        data: {
          tenantId,
          threadId: threadRecord.id,
          providerMessageId: message.id,
          direction,
          fromEmail,
          toEmails,
          ccEmails,
          bccEmails,
          subject,
          htmlBody,
          textBody: textBody || snippet,
          sentAt: sentOrReceivedAt,
          receivedAt: direction === "in" ? sentOrReceivedAt : null,
          createdBy: session.user.id,
          status: direction === "out" ? "sent" : "received",
          source: "gmail",
        },
      });
      syncedCount += 1;

      await prisma.crmEmailThread.update({
        where: { id: threadRecord.id },
        data: { lastMessageAt: sentOrReceivedAt },
      });
    }

    return NextResponse.json({
      success: true,
      count: syncedCount,
      fetched: messages.length,
    });
  } catch (error) {
    console.error("Error syncing Gmail:", error);
    return NextResponse.json(
      { success: false, error: "Failed to sync Gmail" },
      { status: 500 }
    );
  }
}
