import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { getCalendarClientForUser, tokenSecret } from "@/lib/google-workspace";

export const dynamic = "force-dynamic";

function verifyChannelToken(token: string | null): boolean {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  try {
    // tokenSecret() es fail-closed (lanza sin GMAIL_TOKEN_SECRET): tratarlo
    // como token inválido (401) en vez de 500, que Google reintentaría.
    const expected = createHmac("sha256", tokenSecret()).update(payload).digest("hex");
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

/** Push notification Google Calendar → sync inverso a OPAI (nunca borra). */
export async function POST(req: NextRequest) {
  const channelToken = req.headers.get("x-goog-channel-token");
  const channelId = req.headers.get("x-goog-channel-id");
  if (!verifyChannelToken(channelToken) || !channelId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accounts = await prisma.googleCalendarAccount.findMany({
    where: { status: "ACTIVE" },
  });
  const account = accounts.find((a) => {
    const prefs = (a.prefs ?? {}) as { channelId?: string };
    return prefs.channelId === channelId;
  });
  if (!account) return NextResponse.json({ ok: true, skipped: true });

  const client = await getCalendarClientForUser(account.tenantId, account.userId);
  if (!client) return NextResponse.json({ ok: true, skipped: true });

  const prefs = (account.prefs ?? {}) as {
    syncToken?: string;
    channelId?: string;
    resourceId?: string;
  };

  try {
    const list = await client.calendar.events.list({
      calendarId: account.calendarId || "primary",
      syncToken: prefs.syncToken || undefined,
      singleEvents: true,
      showDeleted: true,
    });

    for (const ev of list.data.items ?? []) {
      if (!ev.id) continue;
      const link = await prisma.agendaEventLink.findFirst({
        where: { tenantId: account.tenantId, googleEventId: ev.id },
      });
      if (!link || link.sourceType !== "agenda_visita") continue;

      if (ev.status === "cancelled") {
        await prisma.agendaVisita.updateMany({
          where: { id: link.sourceId, tenantId: account.tenantId },
          data: { status: "cancelada" },
        });
        await prisma.agendaEventLink.update({
          where: { id: link.id },
          data: { syncStatus: "CANCELLED", lastSyncAt: new Date(), lastError: null },
        });
        continue;
      }

      const start = ev.start?.dateTime || ev.start?.date;
      const end = ev.end?.dateTime || ev.end?.date;
      if (!start || !end) continue;

      await prisma.agendaVisita.updateMany({
        where: { id: link.sourceId, tenantId: account.tenantId },
        data: {
          startAt: new Date(start),
          endAt: new Date(end),
          status: "reprogramada",
        },
      });
      await prisma.agendaEventLink.update({
        where: { id: link.id },
        data: { syncStatus: "SYNCED", lastSyncAt: new Date(), lastError: null },
      });
    }

    if (list.data.nextSyncToken) {
      await prisma.googleCalendarAccount.update({
        where: { id: account.id },
        data: {
          prefs: { ...prefs, syncToken: list.data.nextSyncToken },
        },
      });
    }
  } catch (err) {
    console.warn("[google-calendar webhook]", err);
  }

  return NextResponse.json({ ok: true });
}
