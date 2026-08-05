import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { tokenSecret } from "@/lib/google-workspace";
import {
  processGoogleCalendarInbound,
  resolveAccountForChannel,
} from "@/modules/calendar/calendar-inbound-sync";

export const dynamic = "force-dynamic";

function verifyChannelToken(token: string | null): {
  accountId: string;
  tenantId: string;
} | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  try {
    // tokenSecret() es fail-closed (lanza sin GMAIL_TOKEN_SECRET): tratarlo
    // como token inválido (401) en vez de 500, que Google reintentaría.
    const expected = createHmac("sha256", tokenSecret()).update(payload).digest("hex");
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      accountId?: string;
      tenantId?: string;
    };
    if (!parsed.accountId || !parsed.tenantId) return null;
    return { accountId: parsed.accountId, tenantId: parsed.tenantId };
  } catch {
    return null;
  }
}

/** Push notification Google Calendar → sync inverso a OPAI (nunca borra). */
export async function POST(req: NextRequest) {
  const channelToken = req.headers.get("x-goog-channel-token");
  const channelId = req.headers.get("x-goog-channel-id");
  const tokenPayload = verifyChannelToken(channelToken);
  if (!tokenPayload || !channelId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resolved = await resolveAccountForChannel({
    channelId,
    tokenAccountId: tokenPayload.accountId,
    tokenTenantId: tokenPayload.tenantId,
  });
  if (!resolved) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const result = await processGoogleCalendarInbound({
    tenantId: resolved.tenantId,
    accountId: resolved.accountId,
    calendarId: resolved.calendarId,
    prefs: resolved.prefs,
    syncToken: resolved.syncToken,
  });

  return NextResponse.json(result);
}
