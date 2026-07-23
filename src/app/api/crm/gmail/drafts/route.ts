/**
 * POST /api/crm/gmail/drafts — autosave del composer a Gmail Drafts (C08).
 * Crea o actualiza (si viene `providerDraftId`) el draft y su espejo local.
 * Cerrar el composer nunca pierde trabajo: el draft queda en Gmail y OPAI.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { requireTenantModule } from "@/lib/require-module";
import { normalizeEmailList } from "@/lib/email-address";
import { resolveSenderAccount } from "@/modules/crm/email/sender-account";
import { gmailClientForAccount } from "@/modules/crm/email/gmail-account-client";
import { saveGmailDraft } from "@/modules/crm/email/gmail-drafts.service";
import { captureEmailError } from "@/modules/crm/email/email-observability";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const mod = await requireTenantModule("crm");
    if (!mod.authorized) return mod.response;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx);
    if (forbidden) return forbidden;

    const body = await request.json();
    const toList = (Array.isArray(body.to) ? body.to : []).filter(
      (v: unknown): v is string => typeof v === "string" && v.trim().length > 0,
    );
    const ccList = (Array.isArray(body.cc) ? body.cc : []).filter(
      (v: unknown): v is string => typeof v === "string",
    );
    const bccList = (Array.isArray(body.bcc) ? body.bcc : []).filter(
      (v: unknown): v is string => typeof v === "string",
    );
    const subject = typeof body.subject === "string" ? body.subject : "";
    const html = typeof body.html === "string" ? body.html : null;
    const threadDbId =
      typeof body.threadId === "string" && body.threadId ? body.threadId : null;
    const providerDraftId =
      typeof body.providerDraftId === "string" && body.providerDraftId
        ? body.providerDraftId
        : null;

    // Un draft totalmente vacío no se guarda (evita basura por autosave).
    if (!subject.trim() && !(html && html.replace(/<[^>]+>/g, "").trim()) && toList.length === 0) {
      return NextResponse.json({ success: true, skipped: true });
    }

    const senderResult = await resolveSenderAccount({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      threadId: threadDbId,
      emailAccountId:
        typeof body.emailAccountId === "string" ? body.emailAccountId : null,
    });
    if (!senderResult.ok) {
      return NextResponse.json(
        { success: false, error: senderResult.error },
        { status: senderResult.status },
      );
    }
    const account = senderResult.account;
    const gmail = gmailClientForAccount(account);
    if (!gmail) {
      return NextResponse.json(
        { success: false, error: "Gmail no conectado" },
        { status: 400 },
      );
    }

    const result = await saveGmailDraft({
      gmail,
      tenantId: ctx.tenantId,
      emailAccount: { id: account.id, email: account.email, userId: account.userId },
      providerDraftId,
      to: normalizeEmailList(toList),
      cc: normalizeEmailList(ccList),
      bcc: normalizeEmailList(bccList),
      subject: subject.trim(),
      html,
      text: null,
      threadDbId,
      createdByUserId: ctx.userId,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    captureEmailError(error, { scope: "draft-save" });
    return NextResponse.json(
      { success: false, error: "No se pudo guardar el borrador" },
      { status: 502 },
    );
  }
}
