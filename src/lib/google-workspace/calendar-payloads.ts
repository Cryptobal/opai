/** Payloads de eventos Google Calendar (visitas y licitaciones). */

export type VisitaEventCtx = {
  typeLabel: string;
  accountName: string;
  installationName?: string | null;
  address?: string | null;
  notes?: string | null;
  contacts?: Array<{
    name: string;
    role?: string | null;
    phone?: string | null;
    email?: string | null;
  }>;
  opaiUrl: string;
  inviteContacts: boolean;
};

export type CalendarEventPayload = {
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  attendees?: Array<{ email: string }>;
  reminders: {
    useDefault: false;
    overrides: Array<{ method: "popup" | "email"; minutes: number }>;
  };
};

export function buildVisitaEventPayload(
  visita: { startAt: Date; endAt: Date },
  ctx: VisitaEventCtx,
): CalendarEventPayload {
  const install = ctx.installationName ? ` — ${ctx.installationName}` : "";
  const summary = `[${ctx.typeLabel}] ${ctx.accountName}${install}`;

  const contactLines = (ctx.contacts ?? [])
    .map((c) => `- ${c.name}${c.role ? ` (${c.role})` : ""}${c.phone ? ` · ${c.phone}` : ""}`)
    .join("\n");

  const description = [
    ctx.notes?.trim() || null,
    contactLines ? `Contactos:\n${contactLines}` : null,
    `Ver en OPAI: ${ctx.opaiUrl}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const attendees = ctx.inviteContacts
    ? (ctx.contacts ?? [])
        .map((c) => c.email?.trim())
        .filter((e): e is string => Boolean(e))
        .map((email) => ({ email }))
    : undefined;

  return {
    summary,
    description,
    location: ctx.address || undefined,
    start: { dateTime: visita.startAt.toISOString() },
    end: { dateTime: visita.endAt.toISOString() },
    attendees: attendees?.length ? attendees : undefined,
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 60 },
        { method: "email", minutes: 1440 },
      ],
    },
  };
}

/**
 * Evento all-day multi-día: banda continua desde que se marca la licitación
 * (`rangeStartYmd`) hasta el día de entrega inclusive (end exclusivo +1).
 */
export function buildLicitacionEventPayload(deal: {
  title: string;
  fechaEntrega: Date;
  rangeStartYmd: string;
  opaiUrl: string;
}): CalendarEventPayload {
  const entregaYmd = deal.fechaEntrega.toISOString().slice(0, 10);
  const start = deal.rangeStartYmd <= entregaYmd ? deal.rangeStartYmd : entregaYmd;
  const endDate = new Date(deal.fechaEntrega);
  endDate.setUTCDate(endDate.getUTCDate() + 1);
  const end = endDate.toISOString().slice(0, 10);
  const [, mm, dd] = entregaYmd.split("-");

  return {
    summary: `LICITACIÓN · ${deal.title} · entrega ${dd}-${mm}`,
    description: `Licitación en OPAI: ${deal.opaiUrl}`,
    start: { date: start },
    end: { date: end },
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 60 },
        { method: "email", minutes: 1440 },
      ],
    },
  };
}
