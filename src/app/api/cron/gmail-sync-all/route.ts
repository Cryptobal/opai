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
      // Token irrecuperable (revocado, cliente OAuth cambiado, cuenta huérfana):
      // marcar revoked para que deje de reintentarse en cada corrida. El usuario
      // la reactiva reconectando (connect emite un token nuevo y status=active).
      const msg = err instanceof Error ? err.message : String(err);
      if (/invalid_grant|unauthorized_client|invalid_client/i.test(msg)) {
        await prisma.crmEmailAccount
          .update({ where: { id: acc.id }, data: { status: "revoked" } })
          .catch(() => {});
        console.warn("[gmail-sync-all] cuenta auto-desactivada (token muerto):", acc.email);
      }
    }
  }

  return NextResponse.json({ ok: true, syncedAccounts: ok, failed, synced });
}
