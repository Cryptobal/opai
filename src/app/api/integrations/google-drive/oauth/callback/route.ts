import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { google } from "googleapis";
import {
  verifyState,
  getDriveOAuthClient,
  encryptToken,
  grantIncludesScopes,
  DRIVE_SCOPES,
} from "@/lib/google-workspace";
import { DEFAULT_MIRROR_CONFIG } from "@/lib/google-workspace/drive-outbox";

/** Normaliza el `error` de Google a un slug seguro para el query param. */
function googleErrorSlug(raw: string): string {
  return `google_${raw.replace(/[^a-z_]/gi, "").slice(0, 40) || "error"}`;
}

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const dest = `${origin}/opai/configuracion/integraciones/google-drive`;
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(`${origin}/opai/login?callbackUrl=${dest}`);
  }

  const { searchParams } = new URL(request.url);
  // Google adjunta ?error=access_denied cuando el usuario cancela / no acepta.
  // Hay que leerlo ANTES de intentar el exchange, si no cae como error genérico.
  const googleError = searchParams.get("error");
  if (googleError) {
    console.error("[gdrive-oauth]", "google", googleError);
    return NextResponse.redirect(`${dest}?drive=${googleErrorSlug(googleError)}`);
  }
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  if (!code || !state) return NextResponse.redirect(`${dest}?drive=error`);

  const decoded = verifyState(state);
  if (!decoded || decoded.userId !== session.user.id) {
    return NextResponse.redirect(`${dest}?drive=invalid_state`);
  }

  const client = getDriveOAuthClient();
  if (!client) return NextResponse.redirect(`${dest}?drive=missing_env`);

  let step: "exchange" | "scope" | "userinfo" | "db" = "exchange";
  try {
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);
    step = "scope";
    if (!grantIncludesScopes(tokens.scope, DRIVE_SCOPES)) {
      return NextResponse.redirect(`${dest}?drive=missing_scope`);
    }
    step = "userinfo";
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const me = await oauth2.userinfo.get();
    const googleEmail = me.data.email;
    if (!googleEmail || !tokens.access_token || !tokens.refresh_token) {
      return NextResponse.redirect(`${dest}?drive=missing_tokens`);
    }

    const accessTokenEnc = encryptToken(tokens.access_token);
    const refreshTokenEnc = encryptToken(tokens.refresh_token);
    const tokenExpiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : null;

    // La raíz se materializa en la primera escritura / "Crear estructura".
    // No crear carpetas aquí: cada OAuth produciría un Opai duplicado.
    step = "db";
    await prisma.googleDriveWorkspace.upsert({
      where: { tenantId: decoded.tenantId },
      create: {
        tenantId: decoded.tenantId,
        googleEmail,
        accessTokenEnc,
        refreshTokenEnc,
        tokenExpiresAt,
        rootFolderId: null,
        mirrorConfig: DEFAULT_MIRROR_CONFIG,
        status: "ACTIVE",
        connectedBy: session.user.id,
      },
      update: {
        googleEmail,
        accessTokenEnc,
        refreshTokenEnc,
        tokenExpiresAt,
        status: "ACTIVE",
        connectedBy: session.user.id,
        // No tocar rootFolderId: se re-resuelve vía resolveRootFolder.
      },
    });

    return NextResponse.redirect(`${dest}?drive=connected`);
  } catch (err) {
    console.error("[gdrive-oauth]", step, err);
    return NextResponse.redirect(`${dest}?drive=error`);
  }
}
