import { NextRequest, NextResponse } from "next/server";
import { createHmac, randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  calendarWebhookUrl,
  getCalendarClientForUser,
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
    return NextResponse.json({ ok: true, skipped: true });
  }

  const accounts = await prisma.googleCalendarAccount.findMany({
    where: { status: "ACTIVE" },
    take: 40,
  });

  const horizon = Date.now() + 48 * 3600_000;
  let renewed = 0;

  for (const account of accounts) {
    const prefs = (account.prefs ?? {}) as {
      channelId?: string;
      resourceId?: string;
      expiration?: number;
      syncToken?: string;
    };
    if (prefs.expiration && prefs.expiration > horizon) continue;

    const client = await getCalendarClientForUser(account.tenantId, account.userId);
    if (!client) continue;

    try {
      const channelId = randomUUID();
      const payload = Buffer.from(
        JSON.stringify({ accountId: account.id, tenantId: account.tenantId }),
      ).toString("base64url");
      const token = `${payload}.${createHmac("sha256", tokenSecret()).update(payload).digest("hex")}`;

      const watch = await client.calendar.events.watch({
        calendarId: account.calendarId || "primary",
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
      renewed++;
    } catch (err) {
      console.warn("[calendar-channel-renew] fail", account.id, err);
    }
  }

  return NextResponse.json({ ok: true, renewed });
}
