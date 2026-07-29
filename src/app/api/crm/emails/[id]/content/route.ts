/**
 * API Route: /api/crm/emails/[id]/content
 * GET - Obtiene/hidrata el contenido de un correo Gmail
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmView } from "@/lib/api-auth-crm";
import { decryptText, getGmailTokenSecret } from "@/lib/crypto";
import { getGmailClient } from "@/lib/gmail";
import {
  extractGmailMessageBodiesAsync,
  type GmailMessagePart,
} from "@/lib/gmail-message-content";
import { requireTenantModule } from '@/lib/require-module';
import {
  listUserMailboxes,
  requireThreadMailbox,
} from "@/modules/crm/email/mailbox-scope";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmView(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const message = await prisma.crmEmailMessage.findFirst({
      where: {
        id,
        tenantId: ctx.tenantId,
      },
    });

    if (!message) {
      return NextResponse.json(
        { success: false, error: "Correo no encontrado" },
        { status: 404 }
      );
    }

    if (message.htmlBody || message.textBody) {
      return NextResponse.json({ success: true, data: message, hydrated: false });
    }

    if (!message.providerMessageId) {
      return NextResponse.json({ success: true, data: message, hydrated: false });
    }

    // Propiedad multicuenta: hilo del usuario, o mensaje de una casilla propia.
    let emailAccountId: string | null = null;
    if (message.threadId) {
      const owned = await requireThreadMailbox({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        threadId: message.threadId,
      });
      if (!owned.ok) {
        return NextResponse.json(
          { success: false, error: "Correo no encontrado" },
          { status: 404 },
        );
      }
      emailAccountId = owned.account.id;
    } else if (message.emailAccountId) {
      const mailboxes = await listUserMailboxes({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
      });
      if (!mailboxes.some((a) => a.id === message.emailAccountId)) {
        return NextResponse.json(
          { success: false, error: "Correo no encontrado" },
          { status: 404 },
        );
      }
      emailAccountId = message.emailAccountId;
    } else {
      return NextResponse.json(
        { success: false, error: "Correo no encontrado" },
        { status: 404 },
      );
    }

    const emailAccount = await prisma.crmEmailAccount.findFirst({
      where: {
        id: emailAccountId,
        tenantId: ctx.tenantId,
      },
    });

    if (!emailAccount?.accessTokenEncrypted) {
      return NextResponse.json(
        { success: false, error: "Gmail no conectado" },
        { status: 400 }
      );
    }

    const tokenSecret = getGmailTokenSecret();
    const accessToken = decryptText(emailAccount.accessTokenEncrypted, tokenSecret);
    const refreshToken = emailAccount.refreshTokenEncrypted
      ? decryptText(emailAccount.refreshTokenEncrypted, tokenSecret)
      : undefined;

    const gmail = getGmailClient(accessToken, refreshToken);
    const full = await gmail.users.messages.get({
      userId: "me",
      id: message.providerMessageId,
      format: "full",
    });

    const { htmlBody, textBody } = await extractGmailMessageBodiesAsync(
      full.data.payload as GmailMessagePart | undefined,
      async (attachmentId) => {
        try {
          const att = await gmail.users.messages.attachments.get({
            userId: "me",
            messageId: message.providerMessageId!,
            id: attachmentId,
          });
          return att.data.data ?? null;
        } catch {
          return null;
        }
      },
    );
    const snippet = full.data.snippet?.trim() || null;

    if (!htmlBody && !textBody && !snippet) {
      return NextResponse.json({ success: true, data: message, hydrated: false });
    }

    const updated = await prisma.crmEmailMessage.update({
      where: { id: message.id },
      data: {
        htmlBody: htmlBody || message.htmlBody,
        textBody: textBody || snippet || message.textBody,
      },
    });

    return NextResponse.json({ success: true, data: updated, hydrated: true });
  } catch (error) {
    console.error("Error fetching email content:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo cargar el contenido del correo" },
      { status: 500 }
    );
  }
}
