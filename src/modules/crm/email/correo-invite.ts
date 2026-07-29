/**
 * Resolución de invitaciones de calendario en un mensaje Gmail del hilo.
 */
import { prisma } from "@/lib/prisma";
import {
  decodeBase64Url,
  extractCalendarParts,
  type GmailMessagePart,
} from "@/lib/gmail-message-content";
import { parseIcsInvite, partstatToRsvp, type ParsedIcsInvite } from "@/lib/ics";
import { gmailClientForAccount } from "./gmail-account-client";
import {
  findGoogleEventByIcalUid,
  selfResponseFromAttendees,
} from "@/modules/calendar/calendar-rsvp-google";
import type { CorreoInviteDTO } from "./correos.types";

export type { CorreoInviteDTO };

function fmtWhen(invite: ParsedIcsInvite): string | null {
  if (!invite.startAt) return null;
  const start = new Date(invite.startAt);
  if (Number.isNaN(start.getTime())) return null;
  if (invite.allDay) {
    return start.toLocaleDateString("es-CL", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      timeZone: "UTC",
    });
  }
  const startLabel = start.toLocaleString("es-CL", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  if (!invite.endAt) return startLabel;
  const end = new Date(invite.endAt);
  if (Number.isNaN(end.getTime())) return startLabel;
  const endLabel = end.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  return `${startLabel}–${endLabel}`;
}

async function loadIcsText(params: {
  gmail: NonNullable<ReturnType<typeof gmailClientForAccount>>;
  messageId: string;
  part: { attachmentId?: string | null; icsText: string };
}): Promise<string | null> {
  if (params.part.icsText) return params.part.icsText;
  if (!params.part.attachmentId) return null;
  const att = await params.gmail.users.messages.attachments.get({
    userId: "me",
    messageId: params.messageId,
    id: params.part.attachmentId,
  });
  const data = att.data.data;
  if (!data) return null;
  return decodeBase64Url(data);
}

/**
 * Detecta y parsea la primera invitación ICS del mensaje. Si Calendar está
 * conectado y hay iCalUID, enriquece con el responseStatus real de Google.
 */
export async function resolveCorreoInvite(params: {
  tenantId: string;
  userId: string;
  threadId: string;
  messageId: string;
}): Promise<
  | { ok: true; invite: CorreoInviteDTO }
  | { ok: false; status: number; error: string }
> {
  const { tenantId, userId, threadId, messageId } = params;

  const account = await prisma.crmEmailAccount.findFirst({
    where: { tenantId, userId, provider: "gmail", status: "active" },
    select: { id: true, email: true, accessTokenEncrypted: true, refreshTokenEncrypted: true },
  });
  if (!account) return { ok: false, status: 400, error: "Gmail no conectado" };

  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: threadId, tenantId, emailAccountId: account.id },
    select: { id: true, providerThreadId: true },
  });
  if (!thread) return { ok: false, status: 404, error: "Hilo no encontrado" };
  if (!thread.providerThreadId) return { ok: false, status: 400, error: "Hilo sin Gmail" };

  const gmail = gmailClientForAccount(account);
  if (!gmail) return { ok: false, status: 400, error: "Gmail no conectado" };

  let msg;
  try {
    msg = await gmail.users.messages.get({ userId: "me", id: messageId, format: "full" });
  } catch {
    return { ok: false, status: 404, error: "Mensaje no encontrado" };
  }
  if (msg.data.threadId !== thread.providerThreadId) {
    return { ok: false, status: 404, error: "Mensaje no encontrado" };
  }

  const parts = extractCalendarParts(msg.data.payload as GmailMessagePart | undefined);
  if (parts.length === 0) {
    return { ok: false, status: 404, error: "Sin invitación de calendario" };
  }

  const calAccount = await prisma.googleCalendarAccount.findFirst({
    where: { tenantId, userId, status: "ACTIVE" },
    select: { googleEmail: true },
  });
  const selfEmail = calAccount?.googleEmail || account.email || null;

  let parsed: ParsedIcsInvite | null = null;
  let used = parts[0];
  for (const part of parts) {
    const icsText = await loadIcsText({ gmail, messageId, part });
    if (!icsText) continue;
    const p = parseIcsInvite(icsText, selfEmail);
    if (!p) continue;
    // Preferir REQUEST/CANCEL sobre REPLY.
    if (!parsed || (p.method === "REQUEST" || p.method === "CANCEL")) {
      parsed = p;
      used = part;
      if (p.method === "REQUEST" || p.method === "CANCEL") break;
    }
  }
  if (!parsed) return { ok: false, status: 404, error: "Invitación ilegible" };

  let responseStatus = partstatToRsvp(parsed.selfPartstat);
  let googleEventId: string | null = null;
  let googleHtmlLink: string | null = null;
  const calendarConnected = Boolean(calAccount);

  if (parsed.uid && calendarConnected) {
    try {
      const found = await findGoogleEventByIcalUid(tenantId, userId, parsed.uid);
      if (found) {
        googleEventId = found.event.id;
        googleHtmlLink = found.event.htmlLink ?? null;
        responseStatus = selfResponseFromAttendees(found.event.attendees, found.googleEmail);
      }
    } catch (err) {
      console.warn("[correo-invite] lookup Google falló", err);
    }
  }

  return {
    ok: true,
    invite: {
      messageId,
      attachmentId: used.attachmentId ?? null,
      filename: used.filename,
      uid: parsed.uid,
      method: parsed.method,
      title: parsed.title,
      whenLabel: fmtWhen(parsed),
      startAt: parsed.startAt,
      endAt: parsed.endAt,
      allDay: parsed.allDay,
      location: parsed.location,
      joinUrl: parsed.url,
      organizerName: parsed.organizerName,
      organizerEmail: parsed.organizerEmail,
      attendeeCount: parsed.attendeeCount,
      responseStatus,
      cancelled: parsed.method === "CANCEL",
      calendarConnected,
      googleEventId,
      googleHtmlLink,
      source: "ics",
    },
  };
}
