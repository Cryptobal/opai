/**
 * DELETE /api/crm/gmail/drafts/[draftId] — descartar un borrador (C08):
 * lo elimina en Gmail (best-effort si ya no existe) y borra el espejo local.
 * `draftId` es el providerDraftId de Gmail.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { requireTenantModule } from "@/lib/require-module";
import { gmailClientForAccount } from "@/modules/crm/email/gmail-account-client";
import { deleteGmailDraft } from "@/modules/crm/email/gmail-drafts.service";
import { captureEmailError } from "@/modules/crm/email/email-observability";

export const maxDuration = 30;

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ draftId: string }> },
) {
  try {
    const mod = await requireTenantModule("crm");
    if (!mod.authorized) return mod.response;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx);
    if (forbidden) return forbidden;

    const { draftId } = await params;

    // La casilla dueña se resuelve por el espejo local del draft.
    const local = await prisma.crmEmailMessage.findFirst({
      where: {
        tenantId: ctx.tenantId,
        providerDraftId: draftId,
        isDraft: true,
      },
      select: { emailAccountId: true },
    });
    if (!local?.emailAccountId) {
      return NextResponse.json({ success: true, missing: true });
    }
    const account = await prisma.crmEmailAccount.findFirst({
      where: {
        id: local.emailAccountId,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        provider: "gmail",
        status: "active",
      },
    });
    if (!account) {
      return NextResponse.json(
        { success: false, error: "La casilla del borrador no es tuya" },
        { status: 403 },
      );
    }
    const gmail = gmailClientForAccount(account);
    if (!gmail) {
      return NextResponse.json(
        { success: false, error: "Gmail no conectado" },
        { status: 400 },
      );
    }
    await deleteGmailDraft({
      gmail,
      tenantId: ctx.tenantId,
      emailAccountId: account.id,
      providerDraftId: draftId,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    captureEmailError(error, { scope: "draft-delete" });
    return NextResponse.json(
      { success: false, error: "No se pudo descartar el borrador" },
      { status: 502 },
    );
  }
}
