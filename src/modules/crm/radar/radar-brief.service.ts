import { prisma } from "@/lib/prisma";
import { getCalendarClientForUser } from "@/lib/google-workspace/clients";
import { dispatchPersonalSlackDm } from "@/lib/integrations/slack/personal-dm";
import { matchEventToCrm } from "./radar-brief-match";
import { buildBrief } from "./radar-brief-context";

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CL", {
    hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago",
  });
}

/**
 * Genera briefs pre-reunión para los eventos de la casilla de un usuario en la
 * ventana [ahora+25min, ahora+45min] con asistentes externos matcheados a una
 * cuenta CRM. Idempotente por `brief:{googleEventId}`. Nunca lanza.
 */
export async function processCalendarBriefs(params: {
  tenantId: string;
  userId: string;
  ownEmail: string;
}): Promise<number> {
  const client = await getCalendarClientForUser(params.tenantId, params.userId);
  if (!client) return 0;

  const now = Date.now();
  let events;
  try {
    const res = await client.calendar.events.list({
      calendarId: client.calendarId,
      timeMin: new Date(now + 25 * 60000).toISOString(),
      timeMax: new Date(now + 45 * 60000).toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 20,
    });
    events = res.data.items ?? [];
  } catch (err) {
    console.warn("[radar-briefs] events.list falló", params.userId, err);
    return 0;
  }

  let created = 0;
  for (const ev of events) {
    const startIso = ev.start?.dateTime; // solo eventos con hora (no all-day)
    if (ev.status === "cancelled" || !ev.id || !startIso) continue;
    const attendees = ev.attendees ?? [];
    if (!attendees.some((a) => a.email && !a.self)) continue; // sin asistentes externos

    const dedupeKey = `brief:${ev.id}`;
    const exists = await prisma.crmRadarItem.findUnique({
      where: { tenantId_dedupeKey: { tenantId: params.tenantId, dedupeKey } },
      select: { id: true },
    });
    if (exists) continue;

    const match = await matchEventToCrm(params.tenantId, params.ownEmail, attendees);
    if (!match) continue;

    const hora = hhmm(startIso);
    const ctx = await buildBrief(params.tenantId, match, hora);
    if (!ctx) continue;

    const item = await prisma.crmRadarItem
      .create({
        data: {
          tenantId: params.tenantId, userId: params.userId, kind: "brief", status: "PENDING",
          title: `Reunión ${hora} · ${ctx.accountName}`,
          summary: ctx.brief.split("\n")[0].slice(0, 140),
          dealId: ctx.dealId, accountId: match.accountId, dueAt: new Date(startIso), dedupeKey,
          payload: { brief: ctx.brief, eventHtmlLink: ev.htmlLink ?? null, hora },
        },
        select: { id: true },
      })
      .catch(() => null);
    if (!item) continue;

    const link = ctx.dealId ? `/crm/deals/${ctx.dealId}` : `/crm/accounts/${match.accountId}`;
    await dispatchPersonalSlackDm({
      tenantId: params.tenantId, adminId: params.userId, typeKey: "radar_comercial",
      title: `📋 Tu reunión de las ${hora} con ${ctx.accountName}`,
      body: ctx.brief, category: "Radar Comercial",
      actions: [
        { label: "Abrir negocio", url: link, style: "primary" },
        { label: "Ver correos", url: "/crm/correos" },
      ],
    });
    created++;
  }
  return created;
}
