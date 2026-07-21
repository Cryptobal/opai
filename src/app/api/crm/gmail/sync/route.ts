/**
 * API Route: /api/crm/gmail/sync
 * GET  - Sincroniza la casilla Gmail del usuario (wrapper fino, compat).
 * POST - "Sincronizar ahora" desde la bandeja Correos (misma lógica).
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireTenantModule } from "@/lib/require-module";
import { syncGmailAccount } from "@/modules/crm/email/gmail-sync.service";

async function handle(request: NextRequest) {
  const modCheck = await requireTenantModule("crm");
  if (!modCheck.authorized) return modCheck.response;

  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
  }

  const maxResults = Math.min(
    Math.max(Number(request.nextUrl.searchParams.get("max") || "300"), 1),
    500,
  );

  const emailAccount = await prisma.crmEmailAccount.findFirst({
    where: {
      tenantId: session.user.tenantId,
      userId: session.user.id,
      provider: "gmail",
      status: "active",
    },
  });
  if (!emailAccount) {
    return NextResponse.json({ success: false, error: "Gmail no conectado" }, { status: 400 });
  }

  const result = await syncGmailAccount({
    tenantId: session.user.tenantId,
    emailAccountId: emailAccount.id,
    maxResults,
    createdByUserId: session.user.id,
  });

  const refreshed = await prisma.crmEmailAccount.findUnique({
    where: { id: emailAccount.id },
    select: { syncState: true },
  });
  const syncState =
    refreshed?.syncState && typeof refreshed.syncState === "object" && !Array.isArray(refreshed.syncState)
      ? (refreshed.syncState as { backfillDone?: boolean; lastSyncAt?: string })
      : {};
  const totalThreads = await prisma.crmEmailThread.count({
    where: { tenantId: session.user.tenantId, emailAccountId: emailAccount.id },
  });

  const { invalidateCorreoFolderCounts } = await import(
    "@/modules/crm/email/correos-folder-counts"
  );
  invalidateCorreoFolderCounts(session.user.tenantId, emailAccount.id);

  return NextResponse.json({
    success: true,
    count: result.syncedCount,
    syncedCount: result.syncedCount,
    fetched: result.fetched,
    mode: result.mode,
    backfillDone: Boolean(syncState.backfillDone),
    totalThreads,
    lastSyncAt: syncState.lastSyncAt ?? null,
  });
}

export async function GET(request: NextRequest) {
  try {
    return await handle(request);
  } catch (error) {
    console.error("Error syncing Gmail:", error);
    return NextResponse.json({ success: false, error: "Failed to sync Gmail" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    return await handle(request);
  } catch (error) {
    console.error("Error syncing Gmail:", error);
    return NextResponse.json({ success: false, error: "Failed to sync Gmail" }, { status: 500 });
  }
}
