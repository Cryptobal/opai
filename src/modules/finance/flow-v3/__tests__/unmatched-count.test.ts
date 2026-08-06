import { describe, it, expect } from "vitest";
import {
  assignPendingCaption,
  bandejaBadgeText,
  bandejaBadgeTitle,
  collectBandejaGroups,
  countAssignPendingInCell,
  countAssignPendingInWindow,
  isFallbackBandejaRow,
  summarizeBandejaRow,
} from "../unmatched-count";
import type { FlowMatrixRowDto } from "../matrix-assemble";

function row(partial: Partial<FlowMatrixRowDto> & { name: string }): FlowMatrixRowDto {
  return {
    id: "r1",
    section: "INGRESOS",
    mapping: "MANUAL",
    orderIndex: 0,
    crmAccountId: null,
    installationId: null,
    categoryId: null,
    supplierId: null,
    isArchived: false,
    archivedWeekCutoff: null,
    isVirtual: false,
    cells: [],
    ...partial,
  };
}

describe("unmatched-count", () => {
  it("detecta filas bandeja", () => {
    expect(isFallbackBandejaRow({ name: "Otros ingresos", isVirtual: true })).toBe(true);
    expect(isFallbackBandejaRow({ name: "Ametel" })).toBe(false);
  });

  it("cuenta DTEs por celda (committed legacy)", () => {
    expect(
      countAssignPendingInCell({
        committed: {
          items: [
            { kind: "dte" },
            { kind: "dte" },
            { kind: "scheduled" },
          ],
        },
      }),
    ).toBe(2);
  });

  it("summarizeBandejaRow agrega real CLP, RUT y grupos", () => {
    const rows = [
      row({
        name: "Otros ingresos",
        isVirtual: true,
        section: "INGRESOS",
        cells: [
          {
            weekStart: "2026-08-03",
            plan: 0,
            committed: null,
            real: {
              total: 150_000,
              items: [
                {
                  bankTransactionId: "tx-1",
                  label: "0799324601 Transf Cliente A",
                  fecha: "2026-08-01",
                  monto: 100_000,
                },
                {
                  bankTransactionId: "tx-2",
                  label: "11.111.111-1 pago",
                  fecha: "2026-08-02",
                  monto: 50_000,
                },
              ],
            },
            effective: 150_000,
            layer: "real",
          },
        ],
      }),
    ];
    const s = summarizeBandejaRow(rows, "INGRESOS");
    expect(s.totalClp).toBe(150_000);
    expect(s.distinctRutCount).toBe(2);
    expect(s.distinctGroupCount).toBe(2);
    expect(s.itemCount).toBe(2);
    expect(bandejaBadgeText(s, "INGRESOS")).toBe("Sin clasificar · 2");
    expect(bandejaBadgeTitle(s, "INGRESOS")).toBe(
      "Sin clasificar · 2 · $150.000",
    );
  });

  it("badge oculto si total y grupos son cero", () => {
    expect(
      bandejaBadgeText(
        { totalClp: 0, distinctRutCount: 0, distinctGroupCount: 0, itemCount: 0 },
        "GAV",
      ),
    ).toBeNull();
    expect(
      bandejaBadgeTitle(
        { totalClp: 0, distinctRutCount: 0, distinctGroupCount: 0, itemCount: 0 },
        "GAV",
      ),
    ).toBeNull();
  });

  it("agrupa sin RUT por comerciante y residual", () => {
    const rows = [
      row({
        name: "Otros egresos",
        isVirtual: true,
        section: "GAV",
        cells: [
          {
            weekStart: "2026-08-03",
            plan: 0,
            committed: null,
            real: {
              total: -200_000,
              items: [
                {
                  bankTransactionId: "tx-v1",
                  label: "Compra VERCEL MKT NEON",
                  fecha: "2026-08-01",
                  monto: -80_000,
                },
                {
                  bankTransactionId: "tx-v2",
                  label: "Compra VERCEL INC.",
                  fecha: "2026-08-02",
                  monto: -40_000,
                },
                {
                  bankTransactionId: "tx-s",
                  label: "Compra SLACK T06FG8K2M",
                  fecha: "2026-08-02",
                  monto: -50_000,
                },
                {
                  bankTransactionId: "tx-x",
                  label: "XX",
                  fecha: "2026-08-03",
                  monto: -30_000,
                },
              ],
            },
            effective: -200_000,
            layer: "real",
          },
        ],
      }),
    ];
    const groups = collectBandejaGroups(rows, "GAV");
    expect(groups.map((g) => g.key)).toEqual([
      "M:VERCEL",
      "M:SLACK",
      "__other__",
    ]);
    expect(groups[0]!.totalClp).toBe(120_000);
    expect(groups[0]!.kind).toBe("MERCHANT");
    expect(groups[2]!.kind).toBe("OTHER");
    const s = summarizeBandejaRow(rows, "GAV");
    expect(s.totalClp).toBe(200_000);
    expect(s.itemCount).toBe(4);
    expect(s.distinctGroupCount).toBe(3);
    expect(s.distinctRutCount).toBe(0);
  });

  it("collectBandejaGroups ordena por monto desc y prioriza RUT", () => {
    const rows = [
      row({
        name: "Otros egresos",
        isVirtual: true,
        section: "GAV",
        cells: [
          {
            weekStart: "2026-08-03",
            plan: 0,
            committed: null,
            real: {
              total: -150_000,
              items: [
                {
                  bankTransactionId: "tx-a",
                  label: "12.345.678-5 cargo",
                  fecha: "2026-08-01",
                  monto: -30_000,
                },
                {
                  bankTransactionId: "tx-b",
                  label: "22.222.222-2 cargo grande",
                  fecha: "2026-08-02",
                  monto: -90_000,
                },
                {
                  bankTransactionId: "tx-c",
                  label: "Compra VERCEL INC.",
                  fecha: "2026-08-02",
                  monto: -30_000,
                },
              ],
            },
            effective: -150_000,
            layer: "real",
          },
        ],
      }),
    ];
    const groups = collectBandejaGroups(rows, "GAV");
    expect(groups[0]!.totalClp).toBeGreaterThanOrEqual(groups[1]?.totalClp ?? 0);
    expect(groups.some((g) => g.kind === "RUT")).toBe(true);
    expect(groups.some((g) => g.kind === "MERCHANT" && g.key === "M:VERCEL")).toBe(true);
    expect(groups.reduce((s, g) => s + g.totalClp, 0)).toBe(150_000);
  });

  it("countAssignPendingInWindow cuenta ítems real (deprecated)", () => {
    const rows = [
      row({
        name: "Otros ingresos",
        isVirtual: true,
        cells: [
          {
            weekStart: "2026-08-03",
            plan: 0,
            committed: null,
            real: { total: 1, items: [{ bankTransactionId: "t1", label: "x", fecha: "2026-08-01", monto: 1 }] },
            effective: 1,
            layer: "real",
          },
        ],
      }),
    ];
    expect(countAssignPendingInWindow(rows, "INGRESOS")).toBe(1);
    expect(assignPendingCaption(1)).toBe("1 por asignar");
    expect(assignPendingCaption(0)).toBeNull();
  });
});
