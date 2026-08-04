import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  groupUnmatchedByClient,
  type UnmatchedDteDto,
} from "../unmatched-income.service";

function item(over: Partial<UnmatchedDteDto> & { dteId: string }): UnmatchedDteDto {
  return {
    folio: null,
    receiverName: null,
    receiverRut: null,
    amountClp: 100_000,
    issueDate: "2026-07-01",
    crmAccountId: null,
    templates: [],
    ...over,
  };
}

describe("groupUnmatchedByClient", () => {
  it("agrupa por cuenta con subtotal", () => {
    const groups = groupUnmatchedByClient([
      item({
        dteId: "d1", folio: 1, crmAccountId: "acc-T",
        receiverName: "Transmat", amountClp: 200_000,
        templates: [{
          id: "tpl-80", name: "Transmat 80%", installationId: null,
          isActive: true, suggestedBillingPeriod: "2026-07", periodHasOtherDte: false,
        }],
      }),
      item({
        dteId: "d2", folio: 2, crmAccountId: "acc-T",
        receiverName: "Transmat", amountClp: 800_000,
      }),
      item({
        dteId: "d3", folio: 3, crmAccountId: "acc-X",
        receiverName: "Otro", amountClp: 50_000,
      }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.key).toBe("acc:acc-T");
    expect(groups[0]!.items).toHaveLength(2);
    expect(groups[0]!.subtotalClp).toBe(1_000_000);
    expect(groups[0]!.templates[0]?.name).toBe("Transmat 80%");
    expect(groups[1]!.key).toBe("acc:acc-X");
  });

  it("sin cuenta agrupa por RUT normalizado", () => {
    const groups = groupUnmatchedByClient([
      item({
        dteId: "d1", receiverRut: "76.123.456-7", receiverName: "A",
        amountClp: 10,
      }),
      item({
        dteId: "d2", receiverRut: "761234567", receiverName: "A",
        amountClp: 20,
      }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.items).toHaveLength(2);
    expect(groups[0]!.subtotalClp).toBe(30);
  });
});
