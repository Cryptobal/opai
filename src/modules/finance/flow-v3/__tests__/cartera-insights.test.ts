import { describe, it, expect } from "vitest";
import { addDaysYmd, DEFAULT_COLLECTION_LAG_DAYS } from "../types";
import { weekLabel, weekStartYmd, ymdToDate } from "../weeks";

/** Réplica pura del armado de ítems de cartera (insights v4.5) para test. */
function buildCarteraItems(
  dtes: Array<{
    id: string;
    folio: number | null;
    receiverName: string | null;
    issueYmd: string;
    dueYmd: string | null;
    pendingClp: number;
    overrideYmd?: string | null;
    excluded?: boolean;
  }>,
  todayYmd: string,
  excludedIds: Set<string>,
) {
  const items = [];
  for (const d of dtes) {
    if (excludedIds.has(d.id) || d.excluded) continue;
    if (d.pendingClp <= 0) continue;
    const dueYmd = d.dueYmd ?? addDaysYmd(d.issueYmd, DEFAULT_COLLECTION_LAG_DAYS);
    const overdueDays = Math.max(
      0,
      Math.round(
        (Date.parse(`${todayYmd}T00:00:00Z`) - Date.parse(`${dueYmd}T00:00:00Z`)) /
          86_400_000,
      ),
    );
    const placement = d.overrideYmd ?? d.issueYmd;
    const anchoredWeek = weekStartYmd(ymdToDate(placement)!);
    items.push({
      dteId: d.id,
      folio: d.folio,
      overdueDays,
      pendingClp: d.pendingClp,
      anchoredWeek,
      anchoredWeekLabel: weekLabel(anchoredWeek),
    });
  }
  items.sort((a, b) => b.overdueDays - a.overdueDays || b.pendingClp - a.pendingClp);
  return items;
}

describe("cartera insights payload (v4.5)", () => {
  const TODAY = "2026-08-04";

  it("ordena por atraso desc y excluye pre-corte/excluidas", () => {
    const items = buildCarteraItems(
      [
        {
          id: "fresh", folio: 10, receiverName: "A",
          issueYmd: "2026-08-01", dueYmd: "2026-09-01", pendingClp: 100_000,
        },
        {
          id: "old", folio: 1582, receiverName: "SCRB",
          issueYmd: "2026-03-10", dueYmd: "2026-04-10", pendingClp: 500_000,
        },
        {
          id: "mid", folio: 20, receiverName: "B",
          issueYmd: "2026-06-01", dueYmd: "2026-07-01", pendingClp: 200_000,
        },
        {
          id: "excluded", folio: 99, receiverName: "X",
          issueYmd: "2026-01-01", dueYmd: "2026-02-01", pendingClp: 999_000,
        },
        {
          id: "paid", folio: 1, receiverName: "Z",
          issueYmd: "2026-01-01", dueYmd: "2026-02-01", pendingClp: 0,
        },
      ],
      TODAY,
      new Set(["excluded"]),
    );
    expect(items.map((i) => i.dteId)).toEqual(["old", "mid", "fresh"]);
    expect(items[0]!.overdueDays).toBeGreaterThan(items[1]!.overdueDays);
    expect(items[0]!.anchoredWeek).toBe("2026-03-09");
    expect(items[0]!.anchoredWeekLabel).toMatch(/^S/);
  });

  it("override mueve la semana anclada", () => {
    const items = buildCarteraItems(
      [{
        id: "d", folio: 1, receiverName: "A",
        issueYmd: "2026-03-10", dueYmd: null, pendingClp: 10,
        overrideYmd: "2026-08-10",
      }],
      TODAY,
      new Set(),
    );
    expect(items[0]!.anchoredWeek).toBe("2026-08-10");
  });
});
