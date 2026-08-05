/**
 * GET /api/cron/calendar-channel-renew
 *
 * Renueva canales push de Google Calendar y watches Pub/Sub de Gmail (opt-in
 * por `GMAIL_PUSH_ENABLED`). Corre diariamente vía Vercel Cron + CRON_SECRET.
 */
import { NextRequest, NextResponse } from "next/server";
import { createHmac, randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  calendarWebhookUrl,
  getCalendarClientForAccount,
  tokenSecret,
} from "@/lib/google-workspace";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const webhook = calendarWebhookUrl();
  if (!webhook) {
    console.warn("[calendar-channel-renew] GOOGLE_CALENDAR_WEBHOOK_URL ausente");
  }

  let renewed = 0;
  let seeded = 0;
  if (webhook) {
    // Priorizar cuentas próximas a expirar / sin canal (nulls first vía sort).
    const accounts = await prisma.googleCalendarAccount.findMany({
      where: { status: "ACTIVE" },
      take: 120,
    });
    accounts.sort((a, b) => {
      const ea = Number(
        ((a.prefs ?? {}) as { expiration?: number }).expiration ?? 0,
      );
      const eb = Number(
        ((b.prefs ?? {}) as { expiration?: number }).expiration ?? 0,
      );
      return ea - eb; // sin expiration (0) primero
    });

    const horizon = Date.now() + 48 * 3600_000;

    for (const account of accounts) {
      const prefs = (account.prefs ?? {}) as {
        channelId?: string;
        resourceId?: string;
        expiration?: number;
        syncToken?: string;
      };
      if (prefs.expiration && prefs.expiration > horizon) continue;

      const client = await getCalendarClientForAccount(account.tenantId, account.id);
      if (!client) continue;

      try {
        const channelId = randomUUID();
        const payload = Buffer.from(
          JSON.stringify({ accountId: account.id, tenantId: account.tenantId }),
        ).toString("base64url");
        const token = `${payload}.${createHmac("sha256", tokenSecret()).update(payload).digest("hex")}`;

        const calendarId = account.calendarId || "primary";
        const watch = await client.calendar.events.watch({
          calendarId,
          requestBody: {
            id: channelId,
            type: "web_hook",
            address: webhook,
            token,
          },
        });

        const nextPrefs = {
          ...prefs,
          channelId,
          resourceId: watch.data.resourceId ?? prefs.resourceId,
          expiration: watch.data.expiration
            ? Number(watch.data.expiration)
            : Date.now() + 7 * 86400_000,
        };

        await prisma.googleCalendarAccount.update({
          where: { id: account.id },
          data: { prefs: nextPrefs as Prisma.InputJsonValue },
        });

        // Mirror en CalendarSyncCursor (por cuenta+calendario).
        await prisma.calendarSyncCursor.upsert({
          where: {
            provider_providerAccountId_providerCalendarId: {
              provider: "google",
              providerAccountId: account.id,
              providerCalendarId: calendarId,
            },
          },
          create: {
            tenantId: account.tenantId,
            provider: "google",
            providerAccountId: account.id,
            providerCalendarId: calendarId,
            channelId,
            resourceId: watch.data.resourceId ?? null,
            channelExpiresAt: watch.data.expiration
              ? new Date(Number(watch.data.expiration))
              : new Date(Date.now() + 7 * 86400_000),
          },
          update: {
            channelId,
            resourceId: watch.data.resourceId ?? undefined,
            channelExpiresAt: watch.data.expiration
              ? new Date(Number(watch.data.expiration))
              : undefined,
          },
        });
        renewed++;

        // Semilla syncToken si el cursor aún no tiene (pasada acotada).
        try {
          const { seedCalendarSyncToken } = await import(
            "@/modules/calendar/calendar-inbound-sync"
          );
          await seedCalendarSyncToken({
            tenantId: account.tenantId,
            accountId: account.id,
            calendarId,
          });
          seeded++;
        } catch (seedErr) {
          console.warn(
            "[calendar-channel-renew] seed syncToken",
            account.id,
            seedErr instanceof Error ? seedErr.message : seedErr,
          );
        }
      } catch (err) {
        console.warn("[calendar-channel-renew] fail", account.id, err);
      }
    }
  }

  let gmailWatchRenewed = 0;
  if (process.env.GMAIL_PUSH_ENABLED === "true") {
    try {
      const { needsWatchRenewal, registerGmailWatch } = await import(
        "@/modules/crm/email/gmail-watch"
      );
      const gmailAccounts = await prisma.crmEmailAccount.findMany({
        where: { provider: "gmail", status: "active" },
        select: {
          id: true,
          syncState: true,
          accessTokenEncrypted: true,
          refreshTokenEncrypted: true,
        },
      });

      // Filtrar antes de aplicar el límite evita que las mismas primeras 50
      // casillas bloqueen para siempre la renovación de las siguientes.
      const dueGmailAccounts = gmailAccounts
        .filter(needsWatchRenewal)
        .slice(0, 50);
      for (const acc of dueGmailAccounts) {
        const result = await registerGmailWatch(acc);
        if ("ok" in result && result.ok) gmailWatchRenewed++;
      }
    } catch (err) {
      console.warn("[calendar-channel-renew] gmail watch renew falló", err);
    }
  }

  return NextResponse.json({
    ok: true,
    renewed,
    seeded,
    gmailWatchRenewed,
    calendarSkipped: !webhook,
  });
}
