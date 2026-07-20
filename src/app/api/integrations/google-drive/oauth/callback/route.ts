import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { google } from "googleapis";
import {
  verifyState,
  getDriveOAuthClient,
  encryptToken,
} from "@/lib/google-workspace";
import { DEFAULT_MIRROR_CONFIG } from "@/lib/google-workspace/drive-outbox";

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const dest = `${origin}/opai/configuracion/integraciones/google-drive`;
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(`${origin}/opai/login?callbackUrl=${dest}`);
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  if (!code || !state) return NextResponse.redirect(`${dest}?drive=error`);

  const decoded = verifyState(state);
  if (!decoded || decoded.userId !== session.user.id) {
    return NextResponse.redirect(`${dest}?drive=invalid_state`);
  }

  const client = getDriveOAuthClient();
  if (!client) return NextResponse.redirect(`${dest}?drive=missing_env`);

  try {
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const me = await oauth2.userinfo.get();
    const googleEmail = me.data.email;
    if (!googleEmail || !tokens.access_token || !tokens.refresh_token) {
      return NextResponse.redirect(`${dest}?drive=missing_tokens`);
    }

    const accessTokenEnc = encryptToken(tokens.access_token);
    const refreshTokenEnc = encryptToken(tokens.refresh_token);
    const tokenExpiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : null;

    let rootFolderId: string | null = null;
    try {
      const drive = google.drive({ version: "v3", auth: client });
      const folder = await drive.files.create({
        requestBody: {
          name: "Opai",
          mimeType: "application/vnd.google-apps.folder",
        },
        fields: "id",
      });
      rootFolderId = folder.data.id ?? null;
    } catch (err) {
      console.warn("[google-drive] no se pudo crear carpeta Opai:", err);
    }

    await prisma.googleDriveWorkspace.upsert({
      where: { tenantId: decoded.tenantId },
      create: {
        tenantId: decoded.tenantId,
        googleEmail,
        accessTokenEnc,
        refreshTokenEnc,
        tokenExpiresAt,
        rootFolderId,
        mirrorConfig: DEFAULT_MIRROR_CONFIG,
        status: "ACTIVE",
        connectedBy: session.user.id,
      },
      update: {
        googleEmail,
        accessTokenEnc,
        refreshTokenEnc,
        tokenExpiresAt,
        rootFolderId: rootFolderId ?? undefined,
        status: "ACTIVE",
        connectedBy: session.user.id,
      },
    });

    return NextResponse.redirect(`${dest}?drive=connected`);
  } catch (err) {
    console.warn("[google-drive] callback error:", err);
    return NextResponse.redirect(`${dest}?drive=error`);
  }
}
