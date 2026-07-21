import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { google } from "googleapis";
import {
  verifyState,
  getCalendarOAuthClient,
  encryptToken,
  grantIncludesScopes,
  CALENDAR_SCOPES,
} from "@/lib/google-workspace";

const DEFAULT_PREFS = {
  inviteContacts: true,
  slackReminderPrevDay: true,
  licitacionesAllDay: true,
  digestMonday: true,
};

/** Normaliza el `error` de Google a un slug seguro para el query param. */
function googleErrorSlug(raw: string): string {
  return `google_${raw.replace(/[^a-z_]/gi, "").slice(0, 40) || "error"}`;
}

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const dest = `${origin}/opai/configuracion/integraciones/google-calendar`;
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(`${origin}/opai/login?callbackUrl=${dest}`);
  }

  const { searchParams } = new URL(request.url);
  // Google adjunta ?error=access_denied cuando el usuario cancela / no acepta.
  // Hay que leerlo ANTES de intentar el exchange, si no cae como error genérico.
  const googleError = searchParams.get("error");
  if (googleError) {
    console.error("[gcal-oauth]", "google", googleError);
    return NextResponse.redirect(`${dest}?cal=${googleErrorSlug(googleError)}`);
  }
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  if (!code || !state) return NextResponse.redirect(`${dest}?cal=error`);

  const decoded = verifyState(state);
  if (!decoded || decoded.userId !== session.user.id) {
    return NextResponse.redirect(`${dest}?cal=invalid_state`);
  }

  const client = getCalendarOAuthClient();
  if (!client) return NextResponse.redirect(`${dest}?cal=missing_env`);

  let step: "exchange" | "scope" | "userinfo" | "db" = "exchange";
  try {
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);
    step = "scope";
    // Diagnóstico permanente: dejar rastro en logs de qué concedió Google.
    console.log("[gcal-oauth] scopes recibidos:", tokens.scope ?? "(vacío)");
    if (!grantIncludesScopes(tokens.scope, CALENDAR_SCOPES)) {
      console.error("[gcal-oauth] missing_scope — grant sin calendar.events");
      return NextResponse.redirect(`${dest}?cal=missing_scope`);
    }
    step = "userinfo";
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const me = await oauth2.userinfo.get();
    const googleEmail = me.data.email;
    if (!googleEmail || !tokens.access_token || !tokens.refresh_token) {
      return NextResponse.redirect(`${dest}?cal=missing_tokens`);
    }

    step = "db";
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
    }).catch((err) => console.warn("[gcal-oauth]", "channel-renew", err));

    return NextResponse.redirect(`${dest}?cal=connected`);
  } catch (err) {
    console.error("[gcal-oauth]", step, err);
    return NextResponse.redirect(`${dest}?cal=error`);
  }
}
