import { describe, expect, it } from "vitest";
import {
  extractCalendarParts,
  extractGmailAttachments,
  type GmailMessagePart,
} from "@/lib/gmail-message-content";

describe("extractGmailAttachments calendar", () => {
  it("incluye text/calendar sin filename", () => {
    const payload: GmailMessagePart = {
      mimeType: "multipart/mixed",
      parts: [
        {
          mimeType: "text/calendar",
          filename: null,
          body: { attachmentId: "att-1", size: 120 },
        },
      ],
    };
    const atts = extractGmailAttachments(payload);
    expect(atts).toHaveLength(1);
    expect(atts[0].filename).toBe("invite.ics");
    expect(atts[0].mimeType).toBe("text/calendar");
  });
});

describe("extractCalendarParts", () => {
  it("lee ICS inline desde body.data", () => {
    const ics = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:1\nSUMMARY:Hi\nEND:VEVENT\nEND:VCALENDAR";
    const data = Buffer.from(ics)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const payload: GmailMessagePart = {
      mimeType: "multipart/alternative",
      parts: [{ mimeType: "text/calendar", body: { data } }],
    };
    const parts = extractCalendarParts(payload);
    expect(parts).toHaveLength(1);
    expect(parts[0].icsText).toContain("BEGIN:VEVENT");
    expect(parts[0].attachmentId).toBeFalsy();
  });
});
