/**
 * API Route: /api/crm/gmail/connect
 * GET - Inicia OAuth con Gmail
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getGmailOAuthClient, GMAIL_SCOPES } from "@/lib/gmail";
import { getGmailTokenSecret } from "@/lib/crypto";
import { createHmac } from "crypto";
import { requireTenantModule } from '@/lib/require-module';

// El secreto se resuelve por request (no a nivel de módulo) para que el build
// no dependa de la env y el error fail-closed ocurra en el request.
function signState(payload: string) {
  return createHmac("sha256", getGmailTokenSecret()).update(payload).digest("hex");
}

export async function GET(request: NextRequest) {
  const modCheck = await requireTenantModule('crm');
  if (!modCheck.authorized) return modCheck.response;

  const origin = new URL(request.url).origin;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(`${origin}/opai/login?callbackUrl=/crm/correos`);
  }

  const tenantId = session.user.tenantId;
  if (!tenantId) {
    return NextResponse.redirect(`${origin}/opai/login?callbackUrl=/crm/correos`);
  }
  try {
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
  } catch (error) {
    // Fail-closed pero sin 500 crudo: env ausente (GMAIL_TOKEN_SECRET, OAuth)
    // redirige con error visible en la UI de correos.
    console.error("Gmail connect error:", error);
    return NextResponse.redirect(`${origin}/crm/correos?gmail=error`);
  }
}
