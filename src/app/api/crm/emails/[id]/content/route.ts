/**
 * API Route: /api/crm/emails/[id]/content
 * GET - Obtiene/hidrata el contenido de un correo Gmail
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmView } from "@/lib/api-auth-crm";
import { decryptText } from "@/lib/crypto";
import { getGmailClient } from "@/lib/gmail";
import {
  extractGmailMessageBodies,
  type GmailMessagePart,
} from "@/lib/gmail-message-content";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
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

    const emailAccount = await prisma.crmEmailAccount.findFirst({
      where: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        provider: "gmail",
        status: "active",
      },
    });

    if (!emailAccount?.accessTokenEncrypted) {
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
    const full = await gmail.users.messages.get({
      userId: "me",
      id: message.providerMessageId,
      format: "full",
    });

    const { htmlBody, textBody } = extractGmailMessageBodies(
      full.data.payload as GmailMessagePart | undefined
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
