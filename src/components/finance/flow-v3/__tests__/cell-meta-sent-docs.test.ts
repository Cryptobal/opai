import { describe, expect, it } from "vitest";
import {
  committedItemMeta,
  draftGroupLabel,
  draftTag,
  primaryCellTag,
  terminoStatusLine,
} from "../cell-meta";
import type { FlowMatrixCellDto } from "@/modules/finance/flow-v3/matrix-types";

function cell(items: FlowMatrixCellDto["committed"]): FlowMatrixCellDto {
  return {
    weekStart: "2026-08-03",
    plan: 0,
    committed: items,
    real: null,
    effective: items?.total ?? 0,
    layer: "committed",
  };
}

describe("sentDocs — etiquetas EP vs Proforma", () => {
  it("distingue EP, Proforma, ambos y borrador", () => {
    expect(draftTag({ proforma: false, estadoPago: true })).toEqual({
      tag: "EP",
      title: "EP enviado",
    });
    expect(draftTag({ proforma: true, estadoPago: false })).toEqual({
      tag: "Proforma",
      title: "Proforma enviada",
    });
    expect(draftTag({ proforma: true, estadoPago: true }).tag).toBe("EP+Prof.");
    expect(draftTag({ proforma: false, estadoPago: false }).tag).toBe("B");
    expect(draftGroupLabel({ proforma: false, estadoPago: true }, "Transmat")).toBe(
      "EP Transmat",
    );
    expect(draftGroupLabel({ proforma: true, estadoPago: false }, "Brasil")).toBe(
      "Proforma Brasil",
    );
  });

  it("primaryCellTag y committedItemMeta usan sentDocs", () => {
    const ep = cell({
      total: 100,
      items: [{
        kind: "draft",
        label: "T",
        fecha: "2026-08-04",
        monto: 100,
        sentDocs: { proforma: false, estadoPago: true },
      }],
    });
    expect(primaryCellTag(ep)?.tag).toBe("EP");
    expect(committedItemMeta(ep.committed!.items[0]!).tag).toBe("EP");

    const pf = cell({
      total: 100,
      items: [{
        kind: "draft",
        label: "P",
        fecha: "2026-08-04",
        monto: 100,
        sentDocs: { proforma: true, estadoPago: false },
      }],
    });
    expect(primaryCellTag(pf)?.tag).toBe("Proforma");
  });

  it("terminoStatusLine solo con término > 0", () => {
    expect(
      terminoStatusLine(
        { issueYmd: "2026-08-20", fecha: "2026-08-20", terminoDias: null, cobroEstYmd: null },
        (d) => d.slice(8),
      ),
    ).toBe("Emite 20");
    expect(
      terminoStatusLine(
        {
          issueYmd: "2026-08-20",
          fecha: "2026-08-20",
          terminoDias: 3,
          cobroEstYmd: "2026-08-23",
        },
        (d) => d.slice(8),
      ),
    ).toContain("término 3 d");
    expect(
      terminoStatusLine(
        { issueYmd: "2026-08-20", fecha: "2026-08-20", terminoDias: 0, cobroEstYmd: null },
        (d) => d.slice(8),
      ),
    ).toBe("Emite 20");
  });
});
