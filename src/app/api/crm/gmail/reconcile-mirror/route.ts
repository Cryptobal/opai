/**
 * POST /api/crm/gmail/reconcile-mirror
 * Reparación one-shot del espejo de carpetas Gmail↔OPAI.
 * Derivación local bidireccional (toda la casilla) + sweep con pertenencia
 * negativa cuando los sets están completos. Solo mueve `archived_at`.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireTenantModule } from "@/lib/require-module";
import { syncThreadStateFromLocalLabels } from "@/modules/crm/email/gmail-inbox-selfheal";
import { reconcileGmailFolders } from "@/modules/crm/email/gmail-folder-reconcile";
import { gmailClientForAccount } from "@/modules/crm/email/gmail-account-client";
import {
  countCorreoFolders,
  invalidateCorreoFolderCounts,
} from "@/modules/crm/email/correos-folder-counts";

export const maxDuration = 60;

export async function POST() {
  const modCheck = await requireTenantModule("crm");
  if (!modCheck.authorized) return modCheck.response;

  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
  }

  const tenantId = session.user.tenantId;
  const emailAccount = await prisma.crmEmailAccount.findFirst({
    where: {
      tenantId,
      userId: session.user.id,
      provider: "gmail",
      status: "active",
    },
  });
  if (!emailAccount?.accessTokenEncrypted) {
    return NextResponse.json({ success: false, error: "Gmail no conectado" }, { status: 400 });
  }

  const gmail = gmailClientForAccount(emailAccount);
  if (!gmail) {
    return NextResponse.json({ success: false, error: "Gmail no conectado" }, { status: 400 });
  }

  // Sin providerThreadIds: barre toda la casilla (reparación del estado corrupto).
  const local = await syncThreadStateFromLocalLabels({
    tenantId,
    emailAccountId: emailAccount.id,
  });

  const reconcile = await reconcileGmailFolders({
    gmail,
    tenantId,
    emailAccount: {
      id: emailAccount.id,
      email: emailAccount.email,
      userId: emailAccount.userId,
    },
    deadline: Date.now() + 40_000,
  });

  invalidateCorreoFolderCounts(tenantId, emailAccount.id);
  const counts = await countCorreoFolders({
    tenantId,
    emailAccountIds: [emailAccount.id],
  });

  return NextResponse.json({
    success: true,
    toInbox: local.toInbox,
    toArchive: local.toArchive,
    reconcile: {
      updated: reconcile.updated,
      importedInbox: reconcile.importedInbox,
      importedTrash: reconcile.importedTrash,
      complete: reconcile.complete,
    },
    counts,
  });
}
