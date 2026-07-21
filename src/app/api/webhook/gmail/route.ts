import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseGmailPushBody } from "@/modules/crm/email/gmail-push-payload";
import { readSyncState, writeSyncState } from "@/modules/crm/email/gmail-sync-state";
import { syncGmailAccount } from "@/modules/crm/email/gmail-sync.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const COALESCE_MS = 5_000;

/**
 * POST /api/webhook/gmail — notificaciones push de Gmail vía Cloud Pub/Sub.
 * Responde 2xx siempre (Pub/Sub reintenta ante 5xx). Opt-in por env.
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

    const acc = await prisma.crmEmailAccount.findFirst({
      where: {
        provider: "gmail",
        email: payload.emailAddress,
        status: "active",
      },
      select: {
        id: true,
        tenantId: true,
        syncState: true,
      },
    });
    if (!acc) return new NextResponse(null, { status: 204 });

    const state = readSyncState(acc.syncState);
    const lastPushAt = state.push?.lastPushAt ? Date.parse(state.push.lastPushAt) : 0;
    if (lastPushAt && Date.now() - lastPushAt < COALESCE_MS) {
      return new NextResponse(null, { status: 204 });
    }

    if (!state.backfillDone) {
      return new NextResponse(null, { status: 204 });
    }

    await writeSyncState(acc.id, {
      push: {
        lastPushAt: new Date().toISOString(),
        lastPushHistoryId: payload.historyId,
      },
    });

    console.info("[gmail] push", {
      emailAccountId: acc.id,
      email: payload.emailAddress,
      historyId: payload.historyId,
    });

    await syncGmailAccount({
      tenantId: acc.tenantId,
      emailAccountId: acc.id,
      maxResults: 100,
      deadlineMs: Date.now() + 25_000,
    });
  } catch (err) {
    console.warn("[gmail] push sync falló", err);
  }

  return new NextResponse(null, { status: 204 });
}
