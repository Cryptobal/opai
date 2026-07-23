/**
 * API Route: /api/crm/gmail/callback
 * GET - Callback OAuth Gmail
 */

import { after, NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getGmailOAuthClient } from "@/lib/gmail";
import { encryptText, getGmailTokenSecret } from "@/lib/crypto";
import { createHmac } from "crypto";
import { requireTenantModule } from '@/lib/require-module';
import { auditEmailAction } from "@/lib/audit-email";
import { registerGmailWatch } from "@/modules/crm/email/gmail-watch";
import {
  enqueueGmailSyncJob,
  processGmailSyncJob,
} from "@/modules/crm/email/gmail-sync-queue";

export const maxDuration = 60;

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

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(`${origin}/crm/correos?gmail=error`);
  }

  const [payload, signature] = state.split(".");
  let stateValid = false;
  try {
    stateValid = Boolean(payload && signature) && signState(payload) === signature;
  } catch (error) {
    // Fail-closed pero sin 500 crudo (ej. GMAIL_TOKEN_SECRET ausente).
    console.error("Gmail OAuth callback: error verificando state:", error);
    return NextResponse.redirect(`${origin}/crm/correos?gmail=error`);
  }
  if (!stateValid) {
    return NextResponse.redirect(`${origin}/crm/correos?gmail=invalid_state`);
  }

  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (decoded.userId !== session.user.id) {
    return NextResponse.redirect(`${origin}/crm/correos?gmail=invalid_user`);
  }

  try {
    const oauthClient = getGmailOAuthClient();
    const { tokens } = await oauthClient.getToken(code);
    oauthClient.setCredentials(tokens);

    // Import estático (como el resto del módulo email): el dinámico pasaba
    // por los loader hooks de Sentry y explotaba con el Proxy inválido.
    const gmail = google.gmail({
      version: "v1",
      auth: oauthClient,
    });
    const profile = await gmail.users.getProfile({ userId: "me" });
    const emailAddress = profile.data.emailAddress;

    if (!emailAddress) {
      return NextResponse.redirect(`${origin}/crm/correos?gmail=missing_email`);
    }

    const accessToken = tokens.access_token || "";
    const refreshToken = tokens.refresh_token || "";
    const tokenSecret = getGmailTokenSecret();

    const existing = await prisma.crmEmailAccount.findFirst({
      where: {
        tenantId: decoded.tenantId,
        userId: session.user.id,
        email: emailAddress,
        provider: "gmail",
      },
    });

    const data = {
      tenantId: decoded.tenantId,
      userId: session.user.id,
      provider: "gmail",
      email: emailAddress,
      accessTokenEncrypted: accessToken ? encryptText(accessToken, tokenSecret) : null,
      refreshTokenEncrypted: refreshToken ? encryptText(refreshToken, tokenSecret) : null,
      tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      status: "active",
      grantedScopes: tokens.scope ?? null,
    };

    let accountId: string;
    if (existing) {
      // Reconexión: si Google no devolvió un refresh_token nuevo (pasa cuando
      // el consent ya existía), conservar el guardado — pisarlo con null
      // rompería la casilla al expirar el access token (~1 h).
      const { refreshTokenEncrypted, ...rest } = data;
      await prisma.crmEmailAccount.update({
        where: { id: existing.id },
        data: refreshToken ? { ...rest, refreshTokenEncrypted } : rest,
      });
      accountId = existing.id;
    } else {
      const created = await prisma.crmEmailAccount.create({ data, select: { id: true } });
      accountId = created.id;
    }

    void auditEmailAction({
      tenantId: decoded.tenantId,
      userId: session.user.id,
      userEmail: session.user.email,
      action: "connect_account",
      entityType: "email_account",
      entityId: accountId,
      meta: { mailbox: emailAddress, reconnect: Boolean(existing) },
    });

    const account = await prisma.crmEmailAccount.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        accessTokenEncrypted: true,
        refreshTokenEncrypted: true,
        syncState: true,
      },
    });
    if (account) {
      await enqueueGmailSyncJob({
        tenantId: decoded.tenantId,
        emailAccountId: account.id,
        reason: "oauth",
        maintenance: true,
      });
      after(async () => {
        await Promise.allSettled([
          registerGmailWatch(account),
          processGmailSyncJob({
            emailAccountId: account.id,
            profile: "maintenance",
            deadlineMs: Date.now() + 50_000,
          }),
        ]);
      });
    }

    return NextResponse.redirect(`${origin}/crm/correos?gmail=connected`);
  } catch (error) {
    console.error("Gmail OAuth callback error:", error);
    return NextResponse.redirect(`${origin}/crm/correos?gmail=error`);
  }
}
