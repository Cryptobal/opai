import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../sales-matrix.service", () => ({ getSalesMatrix: vi.fn() }));
vi.mock("../purchases-matrix.service", () => ({ getPurchasesMatrix: vi.fn() }));
vi.mock("../income-statement.service", () => ({ getIncomeStatement: vi.fn() }));

import { getSalesMatrix } from "../sales-matrix.service";
import { getPurchasesMatrix } from "../purchases-matrix.service";
import { getIncomeStatement } from "../income-statement.service";
import { getProfitability } from "../profitability.service";
import { buildPeriod } from "../shared/period.helper";

const salesMock = getSalesMatrix as unknown as ReturnType<typeof vi.fn>;
const purchasesMock = getPurchasesMatrix as unknown as ReturnType<typeof vi.fn>;
const eerrMock = getIncomeStatement as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getProfitability", () => {
  it("indexa compras por crmAccountId y deja directCost > 0", async () => {
    const period = buildPeriod("month", new Date(2026, 7, 1));
    const clientId = "00000000-0000-0000-0000-000000000001";

    salesMock.mockResolvedValue({
      period,
      rows: [
        {
          id: clientId,
          label: "Cliente Uno",
          monthly: [1_000_000],
          total: 1_000_000,
          meta: { sector: null, installationsCount: 1 },
        },
      ],
      totalsByMonth: [1_000_000],
      grandTotal: 1_000_000,
      documentsCount: 1,
    });
    purchasesMock.mockResolvedValue({
      period,
      rows: [
        {
          id: clientId,
          label: "Cliente Uno",
          monthly: [400_000],
          total: 400_000,
        },
      ],
      totalsByMonth: [400_000],
      grandTotal: 400_000,
      documentsCount: 2,
    });
    eerrMock.mockResolvedValue({ opex: { total: 0 } });

    const result = await getProfitability("t1", period);
    expect(purchasesMock).toHaveBeenCalledWith(
      "t1",
      period,
      {},
      { groupBy: "client" },
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.directCost).toBe(400_000);
    expect(result.rows[0]!.directCost).toBeGreaterThan(0);
    expect(result.totals.directCost).toBe(400_000);
  });
});
