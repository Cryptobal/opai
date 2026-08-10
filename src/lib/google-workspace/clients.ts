import { google, type drive_v3, type calendar_v3 } from "googleapis";
import { prisma } from "@/lib/prisma";
import { googleClientId, googleClientSecret } from "./env";
import { getCalendarOAuthClient, getDriveOAuthClient } from "./oauth";
import { withFreshToken } from "./tokens";
import { getServiceAccountDriveClient } from "./service-account";

export type DriveMode = "OAUTH" | "SHARED_DRIVE";

export type TenantDriveClient = {
  drive: drive_v3.Drive;
  driveId: string | null;
  mode: DriveMode;
};

export async function getDriveClientForTenant(
  tenantId: string,
): Promise<TenantDriveClient | null> {
  const ws = await prisma.googleDriveWorkspace.findFirst({
    where: { tenantId, status: "ACTIVE" },
  });
  if (!ws) {
    console.warn(`[google-workspace] Sin Drive workspace ACTIVE para tenant ${tenantId}`);
    return null;
  }

  const mode: DriveMode = ws.mode === "SHARED_DRIVE" ? "SHARED_DRIVE" : "OAUTH";

  if (mode === "SHARED_DRIVE") {
    if (!ws.sharedDriveId) {
      console.warn(
        `[google-workspace] SHARED_DRIVE sin sharedDriveId (tenant ${tenantId})`,
      );
      return null;
    }
    const drive = getServiceAccountDriveClient();
    if (!drive) return null;
    return { drive, driveId: ws.sharedDriveId, mode };
  }

  if (!googleClientId() || !googleClientSecret()) {
    console.warn("[google-workspace] Drive OAuth desactivado: faltan GOOGLE_CLIENT_ID/SECRET");
    return null;
  }
  if (!ws.accessTokenEnc || !ws.refreshTokenEnc) {
    console.warn(`[google-workspace] OAUTH sin tokens (tenant ${tenantId})`);
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
  return {
    drive: google.drive({ version: "v3", auth: oauth2 }),
    driveId: null,
    mode: "OAUTH",
  };
}

export type CalendarAccountSummary = {
  id: string;
  googleEmail: string;
  calendarId: string;
  isDefault: boolean;
  color: string | null;
  sortIndex: number;
  status: string;
};

/** Lista cuentas ACTIVE del usuario, default primero y luego por sortIndex. */
export async function listCalendarAccounts(
  tenantId: string,
  userId: string,
): Promise<CalendarAccountSummary[]> {
  const rows = await prisma.googleCalendarAccount.findMany({
    where: { tenantId, userId, status: "ACTIVE" },
    orderBy: [{ isDefault: "desc" }, { sortIndex: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      googleEmail: true,
      calendarId: true,
      isDefault: true,
      color: true,
      sortIndex: true,
      status: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    googleEmail: r.googleEmail,
    calendarId: r.calendarId || "primary",
    isDefault: r.isDefault,
    color: r.color,
    sortIndex: r.sortIndex,
    status: r.status,
  }));
}

export type CalendarClientForAccount = {
  calendar: calendar_v3.Calendar;
  accountId: string;
  calendarId: string;
  googleEmail: string;
};

/**
 * Cliente Google Calendar para una cuenta concreta.
 * Valida tenant + status ACTIVE; refresca token con withFreshToken.
 */
export async function getCalendarClientForAccount(
  tenantId: string,
  accountId: string,
): Promise<CalendarClientForAccount | null> {
  if (!googleClientId() || !googleClientSecret()) {
    console.warn("[google-workspace] Calendar desactivado: faltan GOOGLE_CLIENT_ID/SECRET");
    return null;
  }

  const account = await prisma.googleCalendarAccount.findFirst({
    where: { id: accountId, tenantId, status: "ACTIVE" },
  });
  if (!account) {
    console.warn(
      `[google-workspace] Calendar account ${accountId} no ACTIVE en tenant ${tenantId}`,
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
    googleEmail: account.googleEmail,
  };
}

/**
 * Cuenta destino por defecto del usuario (isDefault, o la más antigua).
 * Firma y comportamiento externo conservados para callers no migrados.
 */
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
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }, { sortIndex: "asc" }],
  });
  if (!account) {
    console.warn(
      `[google-workspace] Sin Calendar ACTIVE para user ${userId} tenant ${tenantId}`,
    );
    return null;
  }

  const client = await getCalendarClientForAccount(tenantId, account.id);
  if (!client) return null;
  return {
    calendar: client.calendar,
    accountId: client.accountId,
    calendarId: client.calendarId,
  };
}

/**
 * Elige la cuenta por defecto de un usuario entre un set ya cargado.
 * Preferencia: isDefault → createdAt más antiguo → sortIndex.
 */
export function pickDefaultAccount<
  T extends { userId: string; isDefault?: boolean; createdAt?: Date; sortIndex?: number; id: string },
>(accounts: T[], userId: string): T | undefined {
  const mine = accounts.filter((a) => a.userId === userId);
  if (!mine.length) return undefined;
  const def = mine.find((a) => a.isDefault);
  if (def) return def;
  return [...mine].sort((a, b) => {
    const ta = a.createdAt?.getTime() ?? 0;
    const tb = b.createdAt?.getTime() ?? 0;
    if (ta !== tb) return ta - tb;
    return (a.sortIndex ?? 0) - (b.sortIndex ?? 0);
  })[0];
}
