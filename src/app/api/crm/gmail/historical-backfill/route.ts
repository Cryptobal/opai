/**
 * POST /api/crm/gmail/historical-backfill
 * Re-dispara importación histórica de Gmail (query configurable).
 * Requiere módulo CRM. Usa la casilla activa del usuario.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireTenantModule } from "@/lib/require-module";
import {
  HISTORICAL_BACKFILL_QUERY,
  requestHistoricalBackfill,
} from "@/modules/crm/email/gmail-historical-backfill";
import { processGmailSyncJob } from "@/modules/crm/email/gmail-sync-queue";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const modCheck = await requireTenantModule("crm");
  if (!modCheck.authorized) return modCheck.response;

  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
  }

  let body: { query?: string; processNow?: boolean } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const emailAccount = await prisma.crmEmailAccount.findFirst({
    where: {
      tenantId: session.user.tenantId,
      userId: session.user.id,
      provider: "gmail",
      status: "active",
    },
    select: { id: true, email: true },
  });
  if (!emailAccount) {
    return NextResponse.json({ success: false, error: "Gmail no conectado" }, { status: 400 });
  }

  const result = await requestHistoricalBackfill({
    tenantId: session.user.tenantId,
    emailAccountId: emailAccount.id,
    query: body.query ?? HISTORICAL_BACKFILL_QUERY,
  });
  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }

  let processed: Awaited<ReturnType<typeof processGmailSyncJob>> | null = null;
  if (body.processNow !== false) {
    processed = await processGmailSyncJob({
      emailAccountId: emailAccount.id,
      profile: "maintenance",
      maxResults: 500,
      deadlineMs: Date.now() + 50_000,
      createdByUserId: session.user.id,
      forceReconcile: false,
    });
  }

  return NextResponse.json({
    success: true,
    email: emailAccount.email,
    query: result.query,
    processed: processed
      ? {
          status: processed.status,
          syncedCount: "syncedCount" in processed ? processed.syncedCount : 0,
          mode: "mode" in processed ? processed.mode : null,
        }
      : null,
    note: "El cron flush-gmail-sync continuará el backfill hasta agotar la query.",
  });
}
