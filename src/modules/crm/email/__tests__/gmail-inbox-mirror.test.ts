import { describe, expect, it } from "vitest";
import { computeNegativeArchiveIds } from "../gmail-folder-reconcile";

const now = new Date("2026-07-29T12:00:00.000Z");

function thread(partial: {
  id: string;
  providerThreadId: string | null;
  archivedAt?: Date | null;
  snoozedUntil?: Date | null;
}) {
  return {
    id: partial.id,
    providerThreadId: partial.providerThreadId,
    archivedAt: partial.archivedAt ?? null,
    trashedAt: null,
    spamAt: null,
    snoozedUntil: partial.snoozedUntil ?? null,
  };
}

describe("computeNegativeArchiveIds (pertenencia negativa)", () => {
  it("no archiva nada cuando setsComplete === false", () => {
    const ids = computeNegativeArchiveIds({
      setsComplete: false,
      threads: [thread({ id: "t1", providerThreadId: "g1" })],
      inboxIds: new Set(),
      spamIds: new Set(),
      trashIds: new Set(),
      now,
    });
    expect(ids).toEqual([]);
  });

  it("con setsComplete, un hilo ausente de los 3 sets entra en toArchive", () => {
    const ids = computeNegativeArchiveIds({
      setsComplete: true,
      threads: [
        thread({ id: "t1", providerThreadId: "g-inbox" }),
        thread({ id: "t2", providerThreadId: "g-archived" }),
        thread({ id: "t3", providerThreadId: "g-spam" }),
      ],
      inboxIds: new Set(["g-inbox"]),
      spamIds: new Set(["g-spam"]),
      trashIds: new Set(),
      now,
    });
    expect(ids).toEqual(["t2"]);
  });

  it("no archiva un hilo con snoozedUntil futuro", () => {
    const future = new Date(now.getTime() + 60_000);
    const ids = computeNegativeArchiveIds({
      setsComplete: true,
      threads: [
        thread({
          id: "t-snooze",
          providerThreadId: "g-snooze",
          snoozedUntil: future,
        }),
      ],
      inboxIds: new Set(),
      spamIds: new Set(),
      trashIds: new Set(),
      now,
    });
    expect(ids).toEqual([]);
  });

  it("no archiva un hilo con providerThreadId === null", () => {
    const ids = computeNegativeArchiveIds({
      setsComplete: true,
      threads: [thread({ id: "t-local", providerThreadId: null })],
      inboxIds: new Set(),
      spamIds: new Set(),
      trashIds: new Set(),
      now,
    });
    expect(ids).toEqual([]);
  });

  it("omite hilos ya archivados", () => {
    const ids = computeNegativeArchiveIds({
      setsComplete: true,
      threads: [
        thread({
          id: "t-arch",
          providerThreadId: "g-arch",
          archivedAt: new Date("2026-01-01T00:00:00.000Z"),
        }),
      ],
      inboxIds: new Set(),
      spamIds: new Set(),
      trashIds: new Set(),
      now,
    });
    expect(ids).toEqual([]);
  });
});
