/**
 * API Route: /api/crm/gmail/sync
 * GET  - Sincroniza la casilla Gmail del usuario (wrapper fino, compat).
 * POST - "Sincronizar ahora" desde la bandeja Correos (misma lógica).
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireTenantModule } from "@/lib/require-module";
import {
  enqueueGmailSyncJob,
  processGmailSyncJob,
} from "@/modules/crm/email/gmail-sync-queue";
import {
  countCorreoFolders,
  invalidateCorreoFolderCounts,
} from "@/modules/crm/email/correos-folder-counts";

export const maxDuration = 60;

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

  // Sync manual (botón "Sincronizar ahora"): siempre forceReconcile +
  // self-heal amplio para reparar Recibidos vacío. `?force=0` desactiva el
  // sweep. `?background=1` es el check silencioso al abrir la bandeja: solo
  // delta (history/labels, igual que el push), sin sweep ni self-heal, para
  // no pagar una corrida de mantenimiento completa en cada apertura.
  const forceParam = request.nextUrl.searchParams.get("force");
  const background = request.nextUrl.searchParams.get("background") === "1";
  await enqueueGmailSyncJob({
    tenantId: session.user.tenantId,
    emailAccountId: emailAccount.id,
    reason: background ? "open" : "manual",
    maintenance: !background,
  });
  const processed = await processGmailSyncJob({
    emailAccountId: emailAccount.id,
    profile: background ? "delta" : "maintenance",
    maxResults: background ? Math.min(maxResults, 50) : maxResults,
    deadlineMs: Date.now() + (background ? 20_000 : 50_000),
    createdByUserId: session.user.id,
    forceReconcile: background ? false : forceParam !== "0",
    selfHealBudgetMs: background ? undefined : 15_000,
  });
  const result =
    processed.status === "processed"
      ? processed
      : {
          syncedCount: 0,
          fetched: 0,
          mode: "incremental" as const,
          reconcile: "skipped" as const,
          healed: 0,
        };

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

  invalidateCorreoFolderCounts(session.user.tenantId, emailAccount.id);
  const counts = await countCorreoFolders({
    tenantId: session.user.tenantId,
    emailAccountId: emailAccount.id,
  });

  return NextResponse.json({
    success: true,
    queued: processed.status !== "processed",
    count: result.syncedCount,
    syncedCount: result.syncedCount,
    fetched: result.fetched,
    mode: result.mode,
    reconcile: result.reconcile,
    healed: result.healed,
    inboxCount: counts.inbox,
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
