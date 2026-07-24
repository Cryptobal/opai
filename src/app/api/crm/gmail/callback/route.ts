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
import {
  GMAIL_DEFAULT_RETURN,
  safeGmailReturnPath,
} from "@/lib/google-workspace/gmail-return-path";

export const maxDuration = 60;

// El secreto se resuelve por request (no a nivel de módulo) para que el build
// no dependa de la env y el error fail-closed ocurra en el request.
function signState(payload: string) {
  return createHmac("sha256", getGmailTokenSecret()).update(payload).digest("hex");
}

function redirectWithGmail(
  origin: string,
  returnPath: string,
  result: string,
) {
  return NextResponse.redirect(`${origin}${returnPath}?gmail=${result}`);
}

export async function GET(request: NextRequest) {
  const modCheck = await requireTenantModule('crm');
  if (!modCheck.authorized) return modCheck.response;

  const origin = new URL(request.url).origin;
  let returnPath = GMAIL_DEFAULT_RETURN;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(`${origin}/opai/login?callbackUrl=/crm/correos`);
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    return redirectWithGmail(origin, returnPath, "error");
  }

  const [payload, signature] = state.split(".");
  let stateValid = false;
  try {
    stateValid = Boolean(payload && signature) && signState(payload) === signature;
  } catch (error) {
    // Fail-closed pero sin 500 crudo (ej. GMAIL_TOKEN_SECRET ausente).
    console.error("Gmail OAuth callback: error verificando state:", error);
    return redirectWithGmail(origin, returnPath, "error");
  }
  if (!stateValid) {
    return redirectWithGmail(origin, returnPath, "invalid_state");
  }

  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    userId?: string;
    tenantId?: string;
    returnPath?: string;
  };
  returnPath = safeGmailReturnPath(decoded.returnPath);
  if (decoded.userId !== session.user.id) {
    return redirectWithGmail(origin, returnPath, "invalid_user");
  }
  const tenantId = decoded.tenantId;
  if (!tenantId) {
    return redirectWithGmail(origin, returnPath, "invalid_state");
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
      return redirectWithGmail(origin, returnPath, "missing_email");
    }

    const accessToken = tokens.access_token || "";
    const refreshToken = tokens.refresh_token || "";
    const tokenSecret = getGmailTokenSecret();

    const existing = await prisma.crmEmailAccount.findFirst({
      where: {
        tenantId,
        userId: session.user.id,
        email: emailAddress,
        provider: "gmail",
      },
    });

    const data = {
      tenantId,
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
      tenantId,
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
      // Reconexión / primer connect: forzar fallback 7d + sweep INBOX. Si
      // conservamos lastHistoryId "al día" el incremental no reimporta hilos
      // perdidos y Recibidos queda agujereado aunque el sync responda 200.
      const { writeSyncState } = await import("@/modules/crm/email/gmail-sync-state");
      await writeSyncState(account.id, {
        lastHistoryId: null,
        lastReconcileAt: null,
        lastReconcileComplete: false,
      });
      await enqueueGmailSyncJob({
        tenantId,
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
            forceReconcile: true,
            selfHealBudgetMs: 10_000,
          }),
        ]);
      });
    }

    return redirectWithGmail(origin, returnPath, "connected");
  } catch (error) {
    console.error("Gmail OAuth callback error:", error);
    return redirectWithGmail(origin, returnPath, "error");
  }
}
