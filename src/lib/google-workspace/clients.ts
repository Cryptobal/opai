import { google, type drive_v3, type calendar_v3 } from "googleapis";
import { prisma } from "@/lib/prisma";
import { googleClientId, googleClientSecret } from "./env";
import { getCalendarOAuthClient, getDriveOAuthClient } from "./oauth";
import { withFreshToken } from "./tokens";

export async function getDriveClientForTenant(
  tenantId: string,
): Promise<drive_v3.Drive | null> {
  if (!googleClientId() || !googleClientSecret()) {
    console.warn("[google-workspace] Drive desactivado: faltan GOOGLE_CLIENT_ID/SECRET");
    return null;
  }

  const ws = await prisma.googleDriveWorkspace.findFirst({
    where: { tenantId, status: "ACTIVE" },
  });
  if (!ws) {
    console.warn(`[google-workspace] Sin Drive workspace ACTIVE para tenant ${tenantId}`);
    return null;
  }

  const tokens = await withFreshToken(ws, "drive");
  if (!tokens) return null;

  const oauth2 = getDriveOAuthClient();
  if (!oauth2) return null;
  oauth2.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  });
  return google.drive({ version: "v3", auth: oauth2 });
}

export async function getCalendarClientForUser(
  tenantId: string,
  userId: string,
): Promise<{ calendar: calendar_v3.Calendar; accountId: string; calendarId: string } | null> {
  if (!googleClientId() || !googleClientSecret()) {
    console.warn("[google-workspace] Calendar desactivado: faltan GOOGLE_CLIENT_ID/SECRET");
    return null;
  }

  const account = await prisma.googleCalendarAccount.findFirst({
    where: { tenantId, userId, status: "ACTIVE" },
  });
  if (!account) {
    console.warn(
      `[google-workspace] Sin Calendar ACTIVE para user ${userId} tenant ${tenantId}`,
    );
    return null;
  }

  const tokens = await withFreshToken(account, "calendar");
  if (!tokens) return null;

  const oauth2 = getCalendarOAuthClient();
  if (!oauth2) return null;
  oauth2.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  });

  return {
    calendar: google.calendar({ version: "v3", auth: oauth2 }),
    accountId: account.id,
    calendarId: account.calendarId || "primary",
  };
}
