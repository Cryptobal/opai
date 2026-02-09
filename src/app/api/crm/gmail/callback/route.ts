/**
 * API Route: /api/crm/gmail/callback
 * GET - Callback OAuth Gmail
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getGmailOAuthClient } from "@/lib/gmail";
import { encryptText } from "@/lib/crypto";
import { createHmac } from "crypto";

const STATE_SECRET = process.env.GMAIL_TOKEN_SECRET || "dev-secret";

function signState(payload: string) {
  return createHmac("sha256", STATE_SECRET).update(payload).digest("hex");
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect("/opai/login?callbackUrl=/crm/deals");
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect("/crm/deals?gmail=error");
  }

  const [payload, signature] = state.split(".");
  if (!payload || !signature || signState(payload) !== signature) {
    return NextResponse.redirect("/crm/deals?gmail=invalid_state");
  }

  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (decoded.userId !== session.user.id) {
    return NextResponse.redirect("/crm/deals?gmail=invalid_user");
  }

  const oauthClient = getGmailOAuthClient();
  const { tokens } = await oauthClient.getToken(code);
  oauthClient.setCredentials(tokens);

  const gmail = await (await import("googleapis")).google.gmail({
    version: "v1",
    auth: oauthClient,
  });
  const profile = await gmail.users.getProfile({ userId: "me" });
  const emailAddress = profile.data.emailAddress;

  if (!emailAddress) {
    return NextResponse.redirect("/crm/deals?gmail=missing_email");
  }

  const accessToken = tokens.access_token || "";
  const refreshToken = tokens.refresh_token || "";
  const tokenSecret = process.env.GMAIL_TOKEN_SECRET || "dev-secret";

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
  };

  if (existing) {
    await prisma.crmEmailAccount.update({
      where: { id: existing.id },
      data,
    });
  } else {
    await prisma.crmEmailAccount.create({ data });
  }

  return NextResponse.redirect("/crm/deals?gmail=connected");
}
