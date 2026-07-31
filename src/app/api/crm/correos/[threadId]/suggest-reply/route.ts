/** GET → destinatarios de respuesta; POST → genera borrador on-demand (IA). */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { prisma } from "@/lib/prisma";
import { AIError, AI_ERROR_USER_MESSAGES } from "@/lib/ai-errors";
import { generateDraftReply } from "@/modules/crm/email/correo-draft-ai";
import { resolveCorreoAiStyle } from "@/modules/crm/email/correo-ai-style.server";
import { isDraftRefineMode } from "@/modules/crm/email/draft-reply-refine";
import { stripHtml } from "@/modules/crm/email/email-text-util";
import {
  computeReplyAllRecipients,
  preferredReplyAddress,
} from "@/modules/crm/email/reply-recipients";
import {
  extractEmailAddresses,
  formatFromHeaderForStorage,
  normalizeEmailAddress,
} from "@/lib/email-address";
import { gmailClientForAccount } from "@/modules/crm/email/gmail-account-client";
import { requireThreadMailbox } from "@/modules/crm/email/mailbox-scope";

export const maxDuration = 60;
type Ctx = { params: Promise<{ threadId: string }> };

async function loadThreadReply(tenantId: string, threadId: string) {
  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: threadId, tenantId },
    select: { id: true, subject: true, emailAccountId: true },
  });
  if (!thread) return null;
  const lastInbound = await prisma.crmEmailMessage.findFirst({
    where: { threadId, tenantId, direction: "in" },
    orderBy: { sentAt: "desc" },
    select: {
      id: true,
      providerMessageId: true,
      fromEmail: true,
      replyToEmail: true,
      toEmails: true,
      ccEmails: true,
      textBody: true,
      htmlBody: true,
      emailAccountId: true,
    },
  });
  return { thread, lastInbound };
}

/**
 * Backfill Reply-To desde Gmail para mensajes viejos (antes de persistir el
 * header). Best-effort: si falla, seguimos con From.
 */
async function ensureReplyTo(params: {
  tenantId: string;
  message: {
    id: string;
    providerMessageId: string | null;
    fromEmail: string;
    replyToEmail: string | null;
    emailAccountId: string | null;
  };
  emailAccountId: string | null;
}): Promise<string | null> {
  if (params.message.replyToEmail) return params.message.replyToEmail;
  const accountId = params.message.emailAccountId || params.emailAccountId;
  const providerMessageId = params.message.providerMessageId;
  if (!accountId || !providerMessageId) return null;
  try {
    const account = await prisma.crmEmailAccount.findFirst({
      where: { id: accountId, tenantId: params.tenantId },
      select: {
        id: true,
        accessTokenEncrypted: true,
        refreshTokenEncrypted: true,
      },
    });
    if (!account) return null;
    const gmail = gmailClientForAccount(account);
    if (!gmail) return null;
    const full = await gmail.users.messages.get({
      userId: "me",
      id: providerMessageId,
      format: "metadata",
      metadataHeaders: ["From", "Reply-To"],
    });
    const headers = full.data.payload?.headers ?? [];
    const get = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";
    const rawReplyTo = get("Reply-To");
    const replyToParsed = extractEmailAddresses(rawReplyTo)[0] || null;
    const fromParsed = extractEmailAddresses(get("From") || params.message.fromEmail)[0] || null;
    if (
      !replyToParsed ||
      (fromParsed &&
        normalizeEmailAddress(replyToParsed) === normalizeEmailAddress(fromParsed))
    ) {
      return null;
    }
    const replyToEmail = formatFromHeaderForStorage(rawReplyTo, replyToParsed);
    await prisma.crmEmailMessage.update({
      where: { id: params.message.id },
      data: { replyToEmail },
    });
    return replyToEmail;
  } catch {
    return null;
  }
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const mod = await requireCorreosAccess();
  if (!mod.authorized) return mod.response;
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const { threadId } = await params;

  const owned = await requireThreadMailbox({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    threadId,
  });
  if (!owned.ok) return NextResponse.json({ error: owned.error }, { status: owned.status });
  const { account } = owned;

  const data = await loadThreadReply(ctx.tenantId, threadId);
  if (!data) return NextResponse.json({ error: "Hilo no encontrado" }, { status: 404 });

  const ownEmail = account.email || "";

  let replyToEmail = data.lastInbound?.replyToEmail ?? null;
  if (data.lastInbound) {
    replyToEmail =
      (await ensureReplyTo({
        tenantId: ctx.tenantId,
        message: data.lastInbound,
        emailAccountId: account.id,
      })) ?? replyToEmail;
  }

  const replyTo = data.lastInbound
    ? preferredReplyAddress({
        fromEmail: data.lastInbound.fromEmail,
        replyToEmail,
      })
    : null;

  const replyAll = data.lastInbound
    ? computeReplyAllRecipients({
        fromEmail: data.lastInbound.fromEmail,
        replyToEmail,
        toEmails: data.lastInbound.toEmails ?? [],
        ccEmails: data.lastInbound.ccEmails ?? [],
        ownEmail,
      })
    : null;

  return NextResponse.json({
    to: replyTo,
    replyAll,
    subject: data.thread.subject,
  });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const mod = await requireCorreosAccess();
  if (!mod.authorized) return mod.response;
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const { threadId } = await params;

  const owned = await requireThreadMailbox({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    threadId,
  });
  if (!owned.ok) return NextResponse.json({ error: owned.error }, { status: owned.status });
  const { account } = owned;

  const data = await loadThreadReply(ctx.tenantId, threadId);
  if (!data?.lastInbound) return NextResponse.json({ error: "Sin correo entrante" }, { status: 404 });
  const payload = (await req.json().catch(() => ({}))) as {
    instructions?: unknown;
    currentDraft?: unknown;
    refine?: unknown;
  };
  const instructions =
    typeof payload.instructions === "string" ? payload.instructions.slice(0, 1200) : null;
  const currentDraft =
    typeof payload.currentDraft === "string" ? payload.currentDraft.slice(0, 8000) : null;
  const refine = isDraftRefineMode(payload.refine) ? payload.refine : null;
  const body = (data.lastInbound.textBody || stripHtml(data.lastInbound.htmlBody)).trim();
  const replyToEmail =
    (await ensureReplyTo({
      tenantId: ctx.tenantId,
      message: data.lastInbound,
      emailAccountId: account.id,
    })) ?? data.lastInbound.replyToEmail;
  const replyAddress = preferredReplyAddress({
    fromEmail: data.lastInbound.fromEmail,
    replyToEmail,
  });
  const style = await resolveCorreoAiStyle(ctx.tenantId, ctx.userId);
  try {
    const draft = await generateDraftReply({
      tenantId: ctx.tenantId,
      subject: data.thread.subject,
      fromEmail: replyAddress || data.lastInbound.fromEmail,
      body,
      resumen: "",
      instructions,
      currentDraft,
      refine,
      style,
    });
    if (!draft) {
      return NextResponse.json(
        { error: "La IA no devolvió un borrador. Probá de nuevo." },
        { status: 502 },
      );
    }
    return NextResponse.json({ draft, to: replyAddress });
  } catch (error) {
    if (error instanceof AIError) {
      const friendly = AI_ERROR_USER_MESSAGES[error.code];
      return NextResponse.json(
        {
          ...error.toResponse(),
          error: friendly?.description || error.message,
          title: friendly?.title,
        },
        { status: error.clientHttpStatus },
      );
    }
    console.error("[correos] suggest-reply failed:", error);
    return NextResponse.json(
      { error: "No se pudo generar el borrador. Reintentá en unos segundos." },
      { status: 500 },
    );
  }
}
