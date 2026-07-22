import { after, NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseGmailPushBody } from "@/modules/crm/email/gmail-push-payload";
import { writeSyncState } from "@/modules/crm/email/gmail-sync-state";
import {
  enqueueGmailSyncJob,
  processGmailSyncJob,
} from "@/modules/crm/email/gmail-sync-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/webhook/gmail — notificaciones push de Gmail vía Cloud Pub/Sub.
 * Encola durablemente y responde 204; `after()` intenta el delta inmediato sin
 * hacer esperar a Pub/Sub. El cron de 1 minuto recupera cualquier fallo.
 */
export async function POST(req: NextRequest) {
  const pushToken = process.env.GMAIL_PUSH_TOKEN;
  if (pushToken && req.nextUrl.searchParams.get("token") !== pushToken) {
    return new NextResponse(null, { status: 403 });
  }

  if (process.env.GMAIL_PUSH_ENABLED !== "true") {
    return new NextResponse(null, { status: 204 });
  }

  try {
    const payload = parseGmailPushBody(await req.json().catch(() => null));
    if (!payload?.emailAddress) return new NextResponse(null, { status: 204 });

    const accounts = await prisma.crmEmailAccount.findMany({
      where: {
        provider: "gmail",
        email: payload.emailAddress,
        status: "active",
      },
      select: {
        id: true,
        tenantId: true,
      },
    });
    if (accounts.length === 0) return new NextResponse(null, { status: 204 });

    await Promise.all(
      accounts.map(async (account) => {
        await writeSyncState(account.id, {
          push: {
            lastPushAt: new Date().toISOString(),
            lastPushHistoryId: payload.historyId,
          },
        });
        await enqueueGmailSyncJob({
          tenantId: account.tenantId,
          emailAccountId: account.id,
          reason: "push",
          historyId: payload.historyId,
        });
      }),
    );

    console.info("[gmail] push", {
      emailAccountIds: accounts.map((account) => account.id),
      email: payload.emailAddress,
      historyId: payload.historyId,
    });

    after(async () => {
      await Promise.allSettled(
        accounts.map(async (account) => {
          try {
            await processGmailSyncJob({
              emailAccountId: account.id,
              profile: "delta",
              maxResults: 100,
              deadlineMs: Date.now() + 25_000,
            });
          } catch (err) {
            console.warn("[gmail] push delta falló; queda en retry", {
              emailAccountId: account.id,
              err,
            });
          }
        }),
      );
    });
  } catch (err) {
    console.warn("[gmail] push enqueue falló", err);
  }

  return new NextResponse(null, { status: 204 });
}
