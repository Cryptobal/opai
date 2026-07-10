import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

import { resolveConsumableProjection } from "../assign-projection-resolver";

type Fn = ReturnType<typeof vi.fn>;

function makeDb() {
  return {
    financeCashflowOccurrence: { findMany: vi.fn() },
    financeCashflowItem: { findMany: vi.fn() },
  };
}

const TENANT = "tenant-1";
const CAT = "cat-te";
// Semana viernes-cierre: Sáb 2026-07-04 .. Vie 2026-07-10.
const weekStart = new Date("2026-07-04T00:00:00Z");
const weekEnd = new Date("2026-07-10T23:59:59Z");
const txDate = new Date("2026-07-08T00:00:00Z");

let db: ReturnType<typeof makeDb>;
beforeEach(() => {
  db = makeDb();
});

describe("resolveConsumableProjection", () => {
  it("prefiere una occurrence materializada PROJECTED y toma la más cercana al tx", async () => {
    (db.financeCashflowOccurrence.findMany as Fn).mockResolvedValue([
      { id: "occ-far", itemId: "it-1", scheduledDate: new Date("2026-07-05T00:00:00Z"), amountClp: 5_000_000, amountOverride: null },
      { id: "occ-near", itemId: "it-1", scheduledDate: new Date("2026-07-09T00:00:00Z"), amountClp: 5_000_000, amountOverride: null },
    ]);

    const r = await resolveConsumableProjection(db as never, {
      tenantId: TENANT, categoryId: CAT, isTaxExempt: true, weekStart, weekEnd, txDate,
    });

    expect(r?.kind).toBe("materialized");
    expect(r && r.kind === "materialized" && r.occurrenceId).toBe("occ-near");
    // Exenta de IVA → bruto == amountClp.
    expect(r?.projectedGrossClp).toBe(5_000_000);
    // Nunca consulta items si ya hay materializada.
    expect(db.financeCashflowItem.findMany).not.toHaveBeenCalled();
  });

  it("expande virtuales cuando no hay materializada (caso TURNOS_EXTRA) y aplica IVA a categorías afectas", async () => {
    (db.financeCashflowOccurrence.findMany as Fn)
      .mockResolvedValueOnce([]) // materializadas: ninguna
      .mockResolvedValueOnce([]); // claimed: ninguna
    (db.financeCashflowItem.findMany as Fn).mockResolvedValue([
      {
        id: "it-te", amount: 5_000_000, recurrence: "WEEKLY", startDate: new Date("2026-06-01T00:00:00Z"),
        endDate: null, dayOfMonth: null, dayOfWeek: 5, monthOfYear: null, source: "TURNOS_EXTRA",
        sourceRefId: "inst-1", emiteProforma: false, diaEmisionProforma: null, diasFacturaDesdeProforma: null,
        diaEmisionFactura: null, mesFacturaRelativo: "MISMO_MES", diasCobroDesdeFactura: 0,
      },
    ]);

    const r = await resolveConsumableProjection(db as never, {
      tenantId: TENANT, categoryId: CAT, isTaxExempt: false, weekStart, weekEnd, txDate,
    });

    expect(r?.kind).toBe("virtual");
    // Afecta → 5.000.000 * 1.19
    expect(r?.projectedGrossClp).toBe(5_950_000);
    // Cae en el viernes de la semana (2026-07-10).
    expect(r?.scheduledDate.toISOString().slice(0, 10)).toBe("2026-07-10");
  });

  it("descarta fechas virtuales ya reclamadas por una cuota PAID/conciliada", async () => {
    (db.financeCashflowOccurrence.findMany as Fn)
      .mockResolvedValueOnce([]) // materializadas PROJECTED: ninguna
      .mockResolvedValueOnce([
        // La cuota del viernes ya fue consumida por otro real.
        { itemId: "it-te", scheduledDate: new Date("2026-07-10T00:00:00Z") },
      ]);
    (db.financeCashflowItem.findMany as Fn).mockResolvedValue([
      {
        id: "it-te", amount: 5_000_000, recurrence: "WEEKLY", startDate: new Date("2026-06-01T00:00:00Z"),
        endDate: null, dayOfMonth: null, dayOfWeek: 5, monthOfYear: null, source: "TURNOS_EXTRA",
        sourceRefId: "inst-1", emiteProforma: false, diaEmisionProforma: null, diasFacturaDesdeProforma: null,
        diaEmisionFactura: null, mesFacturaRelativo: "MISMO_MES", diasCobroDesdeFactura: 0,
      },
    ]);

    const r = await resolveConsumableProjection(db as never, {
      tenantId: TENANT, categoryId: CAT, isTaxExempt: false, weekStart, weekEnd, txDate,
    });
    expect(r).toBeNull();
  });

  it("filtra SIEMPRE por tenantId (no cruza tenants)", async () => {
    (db.financeCashflowOccurrence.findMany as Fn).mockResolvedValue([]);
    (db.financeCashflowItem.findMany as Fn).mockResolvedValue([]);

    await resolveConsumableProjection(db as never, {
      tenantId: TENANT, categoryId: CAT, isTaxExempt: true, weekStart, weekEnd, txDate,
    });

    const occWhere = (db.financeCashflowOccurrence.findMany as Fn).mock.calls[0][0].where;
    expect(occWhere.tenantId).toBe(TENANT);
    expect(occWhere.item.tenantId).toBe(TENANT);
    const itemWhere = (db.financeCashflowItem.findMany as Fn).mock.calls[0][0].where;
    expect(itemWhere.tenantId).toBe(TENANT);
  });
});
