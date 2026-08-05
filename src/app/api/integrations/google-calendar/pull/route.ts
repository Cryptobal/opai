/**
 * POST /api/integrations/google-calendar/pull
 * Trae cambios de Google → OPAI sin esperar el webhook (validación manual).
 */
import { NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  processGoogleCalendarInbound,
  seedCalendarSyncToken,
} from "@/modules/calendar/calendar-inbound-sync";

export async function POST() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const account = await prisma.googleCalendarAccount.findFirst({
    where: { tenantId: ctx.tenantId, userId: ctx.userId, status: "ACTIVE" },
    orderBy: [{ isDefault: "desc" }, { sortIndex: "asc" }, { createdAt: "asc" }],
  });
  if (!account) {
    return NextResponse.json(
      { success: false, error: "No hay Google Calendar conectado" },
      { status: 400 },
    );
  }

  const calendarId = "primary";
  const cursor = await prisma.calendarSyncCursor.findUnique({
    where: {
      provider_providerAccountId_providerCalendarId: {
        provider: "google",
        providerAccountId: account.id,
        providerCalendarId: calendarId,
      },
    },
  });

  if (!cursor?.syncToken) {
    await seedCalendarSyncToken({
      tenantId: ctx.tenantId,
      accountId: account.id,
      calendarId,
    });
  }

  const refreshed = await prisma.calendarSyncCursor.findUnique({
    where: {
      provider_providerAccountId_providerCalendarId: {
        provider: "google",
        providerAccountId: account.id,
        providerCalendarId: calendarId,
      },
    },
  });

  const prefs =
    account.prefs && typeof account.prefs === "object" && !Array.isArray(account.prefs)
      ? (account.prefs as Record<string, unknown>)
      : {};

  const result = await processGoogleCalendarInbound({
    tenantId: ctx.tenantId,
    accountId: account.id,
    calendarId,
    prefs,
    syncToken: refreshed?.syncToken ?? null,
  });

  const after = await prisma.calendarSyncCursor.findUnique({
    where: {
      provider_providerAccountId_providerCalendarId: {
        provider: "google",
        providerAccountId: account.id,
        providerCalendarId: calendarId,
      },
    },
    select: {
      syncToken: true,
      channelExpiresAt: true,
      lastFullSyncAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    success: true,
    result,
    cursor: after
      ? {
          hasSyncToken: Boolean(after.syncToken),
          channelExpiresAt: after.channelExpiresAt?.toISOString() ?? null,
          lastFullSyncAt: after.lastFullSyncAt?.toISOString() ?? null,
          updatedAt: after.updatedAt.toISOString(),
        }
      : null,
  });
}

export async function GET() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const account = await prisma.googleCalendarAccount.findFirst({
    where: { tenantId: ctx.tenantId, userId: ctx.userId, status: "ACTIVE" },
    orderBy: [{ isDefault: "desc" }, { sortIndex: "asc" }, { createdAt: "asc" }],
    select: { id: true, googleEmail: true },
  });
  if (!account) {
    return NextResponse.json({
      success: true,
      connected: false,
      cursor: null,
    });
  }

  const cursor = await prisma.calendarSyncCursor.findUnique({
    where: {
      provider_providerAccountId_providerCalendarId: {
        provider: "google",
        providerAccountId: account.id,
        providerCalendarId: "primary",
      },
    },
    select: {
      syncToken: true,
      channelExpiresAt: true,
      lastFullSyncAt: true,
      updatedAt: true,
      channelId: true,
    },
  });

  return NextResponse.json({
    success: true,
    connected: true,
    accountEmail: account.googleEmail,
    cursor: cursor
      ? {
          hasSyncToken: Boolean(cursor.syncToken),
          channelExpiresAt: cursor.channelExpiresAt?.toISOString() ?? null,
          lastFullSyncAt: cursor.lastFullSyncAt?.toISOString() ?? null,
          updatedAt: cursor.updatedAt.toISOString(),
          hasChannel: Boolean(cursor.channelId),
        }
      : null,
  });
}
