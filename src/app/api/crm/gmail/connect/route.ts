/**
 * API Route: /api/crm/gmail/connect
 * GET - Inicia OAuth con Gmail
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDefaultTenantId } from "@/lib/tenant";
import { getGmailOAuthClient, GMAIL_SCOPES } from "@/lib/gmail";
import { createHmac } from "crypto";

const STATE_SECRET = process.env.GMAIL_TOKEN_SECRET || "dev-secret";

function signState(payload: string) {
  return createHmac("sha256", STATE_SECRET).update(payload).digest("hex");
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect("/opai/login?callbackUrl=/crm/deals");
  }

  const tenantId = session.user?.tenantId ?? (await getDefaultTenantId());
  const payload = JSON.stringify({
    userId: session.user.id,
    tenantId,
    ts: Date.now(),
  });
  const state = Buffer.from(payload).toString("base64url");
  const signature = signState(state);

  const client = getGmailOAuthClient();
  const url = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GMAIL_SCOPES,
    state: `${state}.${signature}`,
  });

  return NextResponse.redirect(url);
}
