import { describe, expect, it } from "vitest";
import {
  isCalendarMime,
  parseIcsInvite,
  partstatToRsvp,
  unfoldIcs,
} from "@/lib/ics";

const SAMPLE = `BEGIN:VCALENDAR
METHOD:REQUEST
PRODID:-//Microsoft Corporation//Outlook 16.0 MIMEDIR//EN
VERSION:2.0
BEGIN:VEVENT
UID:040000008200E00074C5B7101A82E008000000001234567890ABCDEF
DTSTART;TZID=America/Santiago:20250730T110000
DTEND;TZID=America/Santiago:20250730T113000
SUMMARY:Revisión Proceso de Acreditación - Gard Security
LOCATION:Microsoft Teams Meeting
DESCRIPTION:Unirse a la reunión:\\nhttps://teams.microsoft.com/l/meetup-join/19%3ameeting_abc\\n\\nId. de reunión: 123
ORGANIZER;CN=Rojas Veliz\\, Rodrigo Ignacio:mailto:rodrigo.rojas@cliente.cl
ATTENDEE;CN=Usuario OPAI;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=
 TRUE:mailto:yo@gard.cl
ATTENDEE;CN=Otro;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED:mailto:otro@x.cl
END:VEVENT
END:VCALENDAR`;

describe("unfoldIcs", () => {
  it("une líneas continuadas", () => {
    expect(unfoldIcs("ATTENDEE;PARTSTAT=NEEDS-ACTION;RSVP=\r\n TRUE:mailto:a@b.cl")).toContain(
      "RSVP=TRUE:mailto:a@b.cl",
    );
  });
});

describe("parseIcsInvite", () => {
  it("parsea METHOD REQUEST de Outlook/Teams", () => {
    const inv = parseIcsInvite(SAMPLE, "yo@gard.cl");
    expect(inv).not.toBeNull();
    expect(inv!.method).toBe("REQUEST");
    expect(inv!.title).toContain("Acreditación");
    expect(inv!.organizerEmail).toBe("rodrigo.rojas@cliente.cl");
    expect(inv!.organizerName).toContain("Rojas");
    expect(inv!.location).toContain("Teams");
    expect(inv!.url).toContain("teams.microsoft.com");
    expect(inv!.selfPartstat).toBe("NEEDS-ACTION");
    expect(inv!.attendeeCount).toBe(2);
    expect(inv!.startAt).toBeTruthy();
    expect(inv!.endAt).toBeTruthy();
  });

  it("detecta CANCEL", () => {
    const inv = parseIcsInvite(SAMPLE.replace("METHOD:REQUEST", "METHOD:CANCEL"));
    expect(inv!.method).toBe("CANCEL");
  });

  it("devuelve null sin VEVENT", () => {
    expect(parseIcsInvite("BEGIN:VCALENDAR\nEND:VCALENDAR")).toBeNull();
  });
});

describe("partstatToRsvp / isCalendarMime", () => {
  it("mapea PARTSTAT", () => {
    expect(partstatToRsvp("ACCEPTED")).toBe("accepted");
    expect(partstatToRsvp("TENTATIVE")).toBe("tentative");
    expect(partstatToRsvp("DECLINED")).toBe("declined");
    expect(partstatToRsvp(null)).toBe("needs_action");
  });

  it("detecta mime/filename de calendario", () => {
    expect(isCalendarMime("text/calendar", null)).toBe(true);
    expect(isCalendarMime("application/octet-stream", "invite.ics")).toBe(true);
    expect(isCalendarMime("application/pdf", "doc.pdf")).toBe(false);
  });
});
