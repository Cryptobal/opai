/**
 * GET /api/cron/calendar-sync-retry
 *
 * Reintenta CalendarProviderLink organizer en PENDING (organizador sin Google
 * al crear el evento, o fallo transitorio). Cap por tenant; CRON_SECRET.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncCalendarEventToGoogle } from "@/modules/calendar/calendar-google-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TENANT_CAP = 10;
const LINKS_PER_TENANT = 15;

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenants = await prisma.calendarProviderLink.findMany({
    where: {
      provider: "google",
      role: "organizer",
      syncStatus: "PENDING",
    },
    select: { tenantId: true },
    distinct: ["tenantId"],
    take: TENANT_CAP,
  });

  let retried = 0;
  let synced = 0;
  for (const t of tenants) {
    const links = await prisma.calendarProviderLink.findMany({
      where: {
        tenantId: t.tenantId,
        provider: "google",
        role: "organizer",
        syncStatus: "PENDING",
      },
      select: { eventId: true },
      orderBy: { id: "asc" },
      take: LINKS_PER_TENANT,
    });
    for (const link of links) {
      try {
        const res = await syncCalendarEventToGoogle(t.tenantId, link.eventId);
        retried += 1;
        if (res.syncStatus === "SYNCED") synced += 1;
      } catch (err) {
        console.warn(
          "[calendar-sync-retry]",
          link.eventId.slice(0, 8),
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  return NextResponse.json({ ok: true, retried, synced, tenants: tenants.length });
}
