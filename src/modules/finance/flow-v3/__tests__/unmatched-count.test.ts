import { describe, it, expect } from "vitest";
import {
  assignPendingCaption,
  bandejaBadgeText,
  collectBandejaRutGroups,
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

  it("summarizeBandejaRow agrega real CLP y RUT distintos", () => {
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
    expect(bandejaBadgeText(s, "INGRESOS")).toContain("2 RUT sin regla");
  });

  it("badge oculto si total y RUT son cero", () => {
    expect(bandejaBadgeText({ totalClp: 0, distinctRutCount: 0 }, "GAV")).toBeNull();
  });

  it("badge muestra monto sin RUT", () => {
    const text = bandejaBadgeText({ totalClp: 80_000, distinctRutCount: 0 }, "GAV");
    expect(text).toContain("Otros egresos");
    expect(text).toContain("$80.000");
    expect(text).not.toContain("RUT");
  });

  it("collectBandejaRutGroups ordena por monto desc", () => {
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
              total: -30_000,
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
              ],
            },
            effective: -120_000,
            layer: "real",
          },
        ],
      }),
    ];
    const groups = collectBandejaRutGroups(rows, "GAV");
    expect(groups[0].totalClp).toBeGreaterThan(groups[1]?.totalClp ?? 0);
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
