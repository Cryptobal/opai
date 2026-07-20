import { prisma } from "@/lib/prisma";
import { getCalendarClientForUser } from "@/lib/google-workspace/clients";
import type { AgendaListItem } from "./agenda.types";

export type GoogleAgendaStatus = "ok" | "no_account" | "error";
export type GoogleAgendaResult = { items: AgendaListItem[]; status: GoogleAgendaStatus };

// Cache en memoria por instancia: usuario + rango, TTL 5 min (sólo resultados ok).
const TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; items: AgendaListItem[] }>();

function isoFromEventDate(dt?: { dateTime?: string | null; date?: string | null } | null): {
  iso: string;
  allDay: boolean;
} | null {
  if (dt?.dateTime) return { iso: dt.dateTime, allDay: false };
  if (dt?.date) return { iso: `${dt.date}T00:00:00`, allDay: true }; // medianoche local → día correcto
  return null;
}

/**
 * Eventos del Google Calendar (primary) del usuario en el rango. Deduplica los
 * que ya son visitas/licitaciones OPAI (por AgendaEventLink.googleEventId).
 * Degradación silenciosa: nunca lanza — devuelve status para el hint de UI.
 */
export async function listGoogleCalendarEvents(
  tenantId: string,
  userId: string,
  from: Date,
  to: Date,
): Promise<GoogleAgendaResult> {
  const key = `${tenantId}:${userId}:${from.toISOString()}:${to.toISOString()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return { items: hit.items, status: "ok" };

  const account = await prisma.googleCalendarAccount.findFirst({
    where: { tenantId, userId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!account) return { items: [], status: "no_account" };

  const client = await getCalendarClientForUser(tenantId, userId);
  if (!client) return { items: [], status: "error" }; // cuenta existe pero token revocado

  try {
    const [res, links] = await Promise.all([
      client.calendar.events.list({
        calendarId: "primary",
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 50,
      }),
      prisma.agendaEventLink.findMany({
        where: { tenantId, googleEventId: { not: null } },
        select: { googleEventId: true },
      }),
    ]);

    const opaiEventIds = new Set(links.map((l) => l.googleEventId));
    const items: AgendaListItem[] = [];
    for (const ev of res.data.items ?? []) {
      if (!ev.id || (ev.id && opaiEventIds.has(ev.id))) continue;
      if (ev.status === "cancelled") continue;
      const start = isoFromEventDate(ev.start);
      const end = isoFromEventDate(ev.end);
      if (!start) continue;
      items.push({
        id: ev.id,
        source: "google",
        type: "google",
        title: ev.summary?.trim() || "(sin título)",
        start: start.iso,
        end: end?.iso ?? start.iso,
        allDay: start.allDay,
        assignedUserId: userId,
        assignedName: null,
        accountName: null,
        installationName: null,
        address: ev.location ?? null,
        syncStatus: null,
        dealId: null,
        status: "google",
        htmlLink: ev.htmlLink ?? null,
      });
    }
    cache.set(key, { at: Date.now(), items });
    return { items, status: "ok" };
  } catch (err) {
    console.error("[agenda] listGoogleCalendarEvents falló:", err);
    return { items: [], status: "error" };
  }
}
