/**
 * Parser mínimo de iCalendar para invitaciones entrantes (METHOD:REQUEST).
 * Sin dependencia externa: solo campos necesarios para RSVP en Correo.
 */

export type IcsMethod = "REQUEST" | "CANCEL" | "REPLY" | "PUBLISH" | "ADD" | "COUNTER" | string;

export type ParsedIcsInvite = {
  uid: string | null;
  method: IcsMethod | null;
  title: string;
  description: string | null;
  location: string | null;
  url: string | null;
  startAt: string | null;
  endAt: string | null;
  allDay: boolean;
  organizerEmail: string | null;
  organizerName: string | null;
  /** PARTSTAT del ATTENDEE cuyo email coincide con `selfEmail` (si se pasó). */
  selfPartstat: string | null;
  attendeeCount: number;
};

const TEAMS_URL_RE = /https?:\/\/teams\.microsoft\.com\/[^\s<>"']+/i;
const MEET_URL_RE = /https?:\/\/meet\.google\.com\/[^\s<>"']+/i;
const ZOOM_URL_RE = /https?:\/\/[\w.-]*zoom\.us\/[^\s<>"']+/i;

/** Despliega líneas continuadas (RFC 5545 §3.1). */
export function unfoldIcs(raw: string): string {
  return raw.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
}

function stripMailto(value: string): string {
  return value.replace(/^mailto:/i, "").trim().toLowerCase();
}

function parseParams(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of raw.split(";").slice(1)) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim().toUpperCase();
    let val = part.slice(eq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    out[key] = val;
  }
  return out;
}

/** Convierte DATE / DATE-TIME ICS a ISO UTC (best-effort). */
export function icsDateToIso(
  value: string,
  params: Record<string, string>,
): { iso: string | null; allDay: boolean } {
  const v = value.trim();
  if (!v) return { iso: null, allDay: false };

  if (params.VALUE === "DATE" || /^\d{8}$/.test(v)) {
    const y = v.slice(0, 4);
    const m = v.slice(4, 6);
    const d = v.slice(6, 8);
    return { iso: `${y}-${m}-${d}T00:00:00.000Z`, allDay: true };
  }

  // 20250730T150000Z or 20250730T110000
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/i);
  if (!m) return { iso: null, allDay: false };
  const [, yy, mo, dd, hh, mi, ss, z] = m;
  if (z) {
    return { iso: `${yy}-${mo}-${dd}T${hh}:${mi}:${ss}.000Z`, allDay: false };
  }
  // Sin Z: interpretamos como hora local del TZID si es Chile, si no como local del runtime.
  const tz = params.TZID || "";
  if (/santiago|chile/i.test(tz)) {
    // Construir como si fuera America/Santiago es complejo sin lib; usamos Date local
    // con offset -03/-04 aproximado vía toISOString del Date construido en UTC-label.
    // Preferimos devolver un ISO "naive" marcado como local: el UI formatea con es-CL.
    const local = new Date(`${yy}-${mo}-${dd}T${hh}:${mi}:${ss}`);
    if (!Number.isNaN(local.getTime())) return { iso: local.toISOString(), allDay: false };
  }
  const local = new Date(`${yy}-${mo}-${dd}T${hh}:${mi}:${ss}`);
  if (Number.isNaN(local.getTime())) return { iso: null, allDay: false };
  return { iso: local.toISOString(), allDay: false };
}

function decodeIcsText(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function extractJoinUrl(...blobs: Array<string | null | undefined>): string | null {
  for (const blob of blobs) {
    if (!blob) continue;
    const hit = blob.match(TEAMS_URL_RE) || blob.match(MEET_URL_RE) || blob.match(ZOOM_URL_RE);
    if (hit?.[0]) return hit[0].replace(/[.,;]+$/, "");
  }
  return null;
}

/**
 * Parsea el primer VEVENT de un ICS. `selfEmail` opcional para PARTSTAT propio.
 */
export function parseIcsInvite(raw: string, selfEmail?: string | null): ParsedIcsInvite | null {
  const text = unfoldIcs(raw);
  if (!/BEGIN:VEVENT/i.test(text)) return null;

  const lines = text.split(/\r?\n/);
  let method: string | null = null;
  let inEvent = false;
  let uid: string | null = null;
  let title = "";
  let description: string | null = null;
  let location: string | null = null;
  let url: string | null = null;
  let startAt: string | null = null;
  let endAt: string | null = null;
  let allDay = false;
  let organizerEmail: string | null = null;
  let organizerName: string | null = null;
  let selfPartstat: string | null = null;
  let attendeeCount = 0;
  const self = selfEmail?.trim().toLowerCase() || null;

  for (const line of lines) {
    if (!line || line.startsWith(" ")) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const left = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const name = left.split(";")[0].toUpperCase();
    const params = parseParams(left);

    if (name === "METHOD") {
      method = value.trim().toUpperCase();
      continue;
    }
    if (name === "BEGIN" && value.trim().toUpperCase() === "VEVENT") {
      inEvent = true;
      continue;
    }
    if (name === "END" && value.trim().toUpperCase() === "VEVENT") {
      break;
    }
    if (!inEvent) continue;

    if (name === "UID") uid = value.trim() || null;
    else if (name === "SUMMARY") title = decodeIcsText(value).trim();
    else if (name === "DESCRIPTION") description = decodeIcsText(value).trim() || null;
    else if (name === "LOCATION") location = decodeIcsText(value).trim() || null;
    else if (name === "URL") url = value.trim() || null;
    else if (name === "DTSTART") {
      const parsed = icsDateToIso(value, params);
      startAt = parsed.iso;
      allDay = parsed.allDay;
    } else if (name === "DTEND") {
      const parsed = icsDateToIso(value, params);
      endAt = parsed.iso;
    } else if (name === "ORGANIZER") {
      organizerEmail = stripMailto(params.EMAIL || value);
      organizerName = params.CN ? decodeIcsText(params.CN) : null;
    } else if (name === "ATTENDEE") {
      attendeeCount += 1;
      const email = stripMailto(params.EMAIL || value);
      if (self && email === self) {
        selfPartstat = (params.PARTSTAT || "NEEDS-ACTION").toUpperCase();
      }
    } else if (name === "X-MICROSOFT-SKYPETEAMSMEETINGURL" && !url) {
      url = value.trim() || null;
    }
  }

  if (!uid && !title && !startAt) return null;

  const joinUrl = url || extractJoinUrl(location, description);

  return {
    uid,
    method,
    title: title || "Invitación de calendario",
    description,
    location,
    url: joinUrl,
    startAt,
    endAt,
    allDay,
    organizerEmail,
    organizerName,
    selfPartstat,
    attendeeCount,
  };
}

export function isCalendarMime(mimeType: string | null | undefined, filename?: string | null): boolean {
  const mt = (mimeType || "").toLowerCase();
  const fn = (filename || "").toLowerCase();
  if (mt.includes("text/calendar") || mt.includes("application/ics")) return true;
  if (fn.endsWith(".ics") || fn.endsWith(".ical")) return true;
  return false;
}

export function partstatToRsvp(
  partstat: string | null | undefined,
): "needs_action" | "accepted" | "declined" | "tentative" {
  switch ((partstat || "").toUpperCase().replace(/_/g, "-")) {
    case "ACCEPTED":
      return "accepted";
    case "DECLINED":
      return "declined";
    case "TENTATIVE":
      return "tentative";
    default:
      return "needs_action";
  }
}

export function rsvpToGoogleStatus(
  response: "accepted" | "declined" | "tentative",
): "accepted" | "declined" | "tentative" {
  return response;
}
