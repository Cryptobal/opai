import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { wakeSnoozedThreads } from "@/modules/crm/email/gmail-snooze";
import {
  enqueueGmailSyncJob,
  processGmailSyncJob,
} from "@/modules/crm/email/gmail-sync-queue";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Paso inicial: despertar los hilos pospuestos ya vencidos (best-effort).
  let woke = 0;
  try {
    woke = await wakeSnoozedThreads();
  } catch (err) {
    console.warn("[gmail-sync-all] wakeSnoozedThreads falló", err);
  }

  const accounts = await prisma.crmEmailAccount.findMany({
    where: { status: "active", provider: "gmail" },
    select: { id: true, tenantId: true, email: true },
    orderBy: { updatedAt: "asc" },
    take: 50,
  });

  // Deadline compartido entre casillas para no exceder maxDuration (60s).
  const deadlineMs = Date.now() + 50_000;
  let ok = 0;
  let failed = 0;
  let synced = 0;
  for (const acc of accounts) {
    if (Date.now() >= deadlineMs) break;
    try {
      await enqueueGmailSyncJob({
        tenantId: acc.tenantId,
        emailAccountId: acc.id,
        reason: "cron",
        maintenance: true,
      });
      const r = await processGmailSyncJob({
        emailAccountId: acc.id,
        profile: "maintenance",
        maxResults: 300,
        deadlineMs,
      });
      if (r.status === "processed") {
        synced += r.syncedCount;
        ok++;
      }
    } catch (err) {
      failed++;
      console.warn("[gmail-sync-all] cuenta falló", acc.email, err);
    }
  }

  return NextResponse.json({ ok: true, syncedAccounts: ok, failed, synced, woke });
}
