/**
 * API Route: /api/crm/gmail/connect
 * GET - Inicia OAuth con Gmail
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getGmailOAuthClient, GMAIL_SCOPES } from "@/lib/gmail";
import { createHmac } from "crypto";
import { requireTenantModule } from '@/lib/require-module';

const STATE_SECRET = process.env.GMAIL_TOKEN_SECRET || "dev-secret";

function signState(payload: string) {
  return createHmac("sha256", STATE_SECRET).update(payload).digest("hex");
}

export async function GET(request: NextRequest) {
  const modCheck = await requireTenantModule('crm');
  if (!modCheck.authorized) return modCheck.response;

  const origin = new URL(request.url).origin;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(`${origin}/opai/login?callbackUrl=/crm/deals`);
  }

  const tenantId = session.user.tenantId;
  if (!tenantId) {
    return NextResponse.redirect(`${origin}/opai/login?callbackUrl=/crm/deals`);
  }
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
