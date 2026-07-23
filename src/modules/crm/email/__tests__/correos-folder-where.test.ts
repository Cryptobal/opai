import { describe, expect, it } from "vitest";
import { folderWhere, notSnoozedWhere } from "../correos-list";

/**
 * Regresión "Recibidos vacío": `NOT: { snoozedUntil: { gt: now } }` generaba
 * `NOT (snoozed_until > $1)` y la lógica ternaria de SQL excluía los NULL —
 * casi todos los hilos tienen `snoozedUntil` NULL y la bandeja quedaba vacía
 * aunque "Todos" y "Papelera" sí mostraban correos.
 */
describe("notSnoozedWhere", () => {
  it("acepta NULL y pospuestos ya vencidos vía OR explícito (null-safe)", () => {
    const now = new Date("2026-07-21T12:00:00.000Z");
    expect(notSnoozedWhere(now)).toEqual({
      OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
    });
  });
});

describe("folderWhere", () => {
  it("inbox NUNCA usa NOT sobre snoozedUntil (excluiría los NULL)", () => {
    const where = folderWhere("inbox");
    expect(where).not.toHaveProperty("NOT");
    expect(where).toMatchObject({ trashedAt: null, spamAt: null, archivedAt: null });
    const or = (where as { OR?: Array<Record<string, unknown>> }).OR;
    expect(or).toBeDefined();
    expect(or).toContainEqual({ snoozedUntil: null });
  });

  it("las demás carpetas mantienen su semántica", () => {
    expect(folderWhere("trash")).toEqual({ trashedAt: { not: null } });
    expect(folderWhere("all")).toEqual({ trashedAt: null, spamAt: null });
    expect(folderWhere("archived")).toEqual({
      trashedAt: null,
      spamAt: null,
      archivedAt: { not: null },
    });
    expect(folderWhere("snoozed")).toMatchObject({
      trashedAt: null,
      spamAt: null,
      snoozedUntil: { gt: expect.any(Date) },
    });
  });

  it("carpetas nuevas C10/C11: sent, drafts, spam, starred", () => {
    expect(folderWhere("sent")).toEqual({
      trashedAt: null,
      spamAt: null,
      messages: { some: { direction: "out", isDraft: false } },
    });
    expect(folderWhere("drafts")).toEqual({
      trashedAt: null,
      messages: { some: { isDraft: true } },
    });
    expect(folderWhere("spam")).toEqual({
      trashedAt: null,
      spamAt: { not: null },
    });
    expect(folderWhere("starred")).toEqual({
      trashedAt: null,
      spamAt: null,
      starredAt: { not: null },
    });
  });
});
