import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { google } from "googleapis";
import {
  verifyState,
  getCalendarOAuthClient,
  encryptToken,
} from "@/lib/google-workspace";

const DEFAULT_PREFS = {
  inviteContacts: true,
  slackReminderPrevDay: true,
  licitacionesAllDay: true,
  digestMonday: true,
};

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const dest = `${origin}/opai/configuracion/integraciones/google-calendar`;
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(`${origin}/opai/login?callbackUrl=${dest}`);
  }

  const code = new URL(request.url).searchParams.get("code");
  const state = new URL(request.url).searchParams.get("state");
  if (!code || !state) return NextResponse.redirect(`${dest}?cal=error`);

  const decoded = verifyState(state);
  if (!decoded || decoded.userId !== session.user.id) {
    return NextResponse.redirect(`${dest}?cal=invalid_state`);
  }

  const client = getCalendarOAuthClient();
  if (!client) return NextResponse.redirect(`${dest}?cal=missing_env`);

  try {
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const me = await oauth2.userinfo.get();
    const googleEmail = me.data.email;
    if (!googleEmail || !tokens.access_token || !tokens.refresh_token) {
      return NextResponse.redirect(`${dest}?cal=missing_tokens`);
    }

    await prisma.googleCalendarAccount.upsert({
      where: {
        tenantId_userId: {
          tenantId: decoded.tenantId,
          userId: session.user.id,
        },
      },
      create: {
        tenantId: decoded.tenantId,
        userId: session.user.id,
        googleEmail,
        accessTokenEnc: encryptToken(tokens.access_token),
        refreshTokenEnc: encryptToken(tokens.refresh_token),
        tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        calendarId: "primary",
        prefs: DEFAULT_PREFS,
        status: "ACTIVE",
      },
      update: {
        googleEmail,
        accessTokenEnc: encryptToken(tokens.access_token),
        refreshTokenEnc: encryptToken(tokens.refresh_token),
        tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        status: "ACTIVE",
      },
    });

    // Registrar push channel (best-effort; cron renueva).
    void fetch(`${origin}/api/cron/calendar-channel-renew`, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
    }).catch(() => undefined);

    return NextResponse.redirect(`${dest}?cal=connected`);
  } catch (err) {
    console.warn("[google-calendar] callback error:", err);
    return NextResponse.redirect(`${dest}?cal=error`);
  }
}
