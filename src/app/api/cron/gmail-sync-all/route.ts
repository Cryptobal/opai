import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncGmailAccount } from "@/modules/crm/email/gmail-sync.service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accounts = await prisma.crmEmailAccount.findMany({
    where: { status: "active", provider: "gmail" },
    select: { id: true, tenantId: true, email: true },
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
      const r = await syncGmailAccount({
        tenantId: acc.tenantId,
        emailAccountId: acc.id,
        maxResults: 300,
        deadlineMs,
      });
      synced += r.syncedCount;
      ok++;
    } catch (err) {
      failed++;
      console.warn("[gmail-sync-all] cuenta falló", acc.email, err);
    }
  }

  return NextResponse.json({ ok: true, syncedAccounts: ok, failed, synced });
}
