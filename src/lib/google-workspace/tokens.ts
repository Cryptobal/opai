import { google } from "googleapis";
import { encryptText, decryptText } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { googleClientId, googleClientSecret, tokenSecret } from "./env";

export type TokenAccount = {
  id: string;
  accessTokenEnc: string;
  refreshTokenEnc: string;
  tokenExpiresAt: Date | null;
};

export type TokenKind = "drive" | "calendar";

export function encryptToken(plain: string): string {
  return encryptText(plain, tokenSecret());
}

export function decryptToken(payload: string): string {
  return decryptText(payload, tokenSecret());
}

const SKEW_MS = 60_000;

export async function withFreshToken(
  account: TokenAccount,
  kind: TokenKind,
): Promise<{ accessToken: string; refreshToken: string } | null> {
  const refreshToken = decryptToken(account.refreshTokenEnc);
  const accessToken = decryptToken(account.accessTokenEnc);
  const expiresAt = account.tokenExpiresAt?.getTime() ?? 0;

  if (expiresAt > Date.now() + SKEW_MS) {
    return { accessToken, refreshToken };
  }

  const clientId = googleClientId();
  const clientSecret = googleClientSecret();
  if (!clientId || !clientSecret) {
    console.warn("[google-workspace] No se puede refrescar token: faltan GOOGLE_CLIENT_ID/SECRET");
    return null;
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });

  try {
    const { credentials } = await oauth2.refreshAccessToken();
    const nextAccess = credentials.access_token;
    if (!nextAccess) {
      console.warn("[google-workspace] refreshAccessToken sin access_token");
      return null;
    }
    const tokenExpiresAt = credentials.expiry_date
      ? new Date(credentials.expiry_date)
      : null;
    const accessTokenEnc = encryptToken(nextAccess);

    if (kind === "drive") {
      await prisma.googleDriveWorkspace.update({
        where: { id: account.id },
        data: { accessTokenEnc, tokenExpiresAt },
      });
    } else {
      await prisma.googleCalendarAccount.update({
        where: { id: account.id },
        data: { accessTokenEnc, tokenExpiresAt },
      });
    }

    return { accessToken: nextAccess, refreshToken };
  } catch (err) {
    console.warn("[google-workspace] Error refrescando token:", err);
    return null;
  }
}
