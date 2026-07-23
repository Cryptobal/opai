import { describe, expect, it } from "vitest";
import { deriveThreadState, flagsFromLabelIds } from "../gmail-thread-labels";

describe("flagsFromLabelIds", () => {
  it("detecta INBOX / SPAM / TRASH / UNREAD / STARRED", () => {
    expect(flagsFromLabelIds(["INBOX", "UNREAD"])).toEqual({
      inInbox: true,
      inSpam: false,
      inTrash: false,
      isUnread: true,
      isStarred: false,
    });
    expect(flagsFromLabelIds(["SPAM"])).toMatchObject({ inSpam: true, inInbox: false });
    expect(flagsFromLabelIds(["TRASH"])).toMatchObject({ inTrash: true });
    expect(flagsFromLabelIds(["INBOX", "STARRED"])).toMatchObject({ isStarred: true });
    expect(flagsFromLabelIds([])).toEqual({
      inInbox: false,
      inSpam: false,
      inTrash: false,
      isUnread: false,
      isStarred: false,
    });
  });
});

describe("deriveThreadState", () => {
  const now = new Date("2026-07-21T12:00:00.000Z");
  const empty = { archivedAt: null, trashedAt: null, spamAt: null };
  const archived = {
    archivedAt: new Date("2026-01-01T00:00:00.000Z"),
    trashedAt: null,
    spamAt: null,
  };

  it("INBOX limpia archived/trash/spam (prioridad máxima)", () => {
    const flags = flagsFromLabelIds(["INBOX", "TRASH"]);
    expect(deriveThreadState(flags, archived, now)).toEqual({
      archivedAt: null,
      trashedAt: null,
      spamAt: null,
    });
  });

  it("sin INBOX archiva conservando timestamp previo", () => {
    const flags = flagsFromLabelIds(["SENT", "CATEGORY_PERSONAL"]);
    const next = deriveThreadState(flags, archived, now);
    expect(next.archivedAt).toEqual(archived.archivedAt);
    expect(next.trashedAt).toBeNull();
  });

  it("sin INBOX y sin archivedAt previo setea now", () => {
    const flags = flagsFromLabelIds(["SENT"]);
    const next = deriveThreadState(flags, empty, now);
    expect(next.archivedAt).toEqual(now);
  });
});
