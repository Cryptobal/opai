/**
 * Tests del Sales Aggregator (la fuente única de verdad de los KPIs de
 * facturación). Mockea prisma para controlar agregaciones por dteType
 * y validar la fórmula `Σ(33+34+39+41) + Σ(56) − Σ(61)` exactamente
 * con los mismos números que vería el contador en el F29.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted: mock prisma ANTES de importar el módulo.
vi.mock("@/lib/prisma", () => {
  const aggregate = vi.fn();
  const count = vi.fn();
  return {
    prisma: {
      financeDte: { aggregate, count },
    },
  };
});

import { prisma } from "@/lib/prisma";
import {
  computeNetSales,
  computeNetPurchases,
  buildMonthRange,
  prevRangeOf,
  formatMonthLabel,
  pctChange,
  POSITIVE_TYPES,
  ND_TYPES,
  NC_TYPES,
  DEFAULT_INCLUDED_STATUS,
} from "../sales-aggregator";

const aggregateMock = prisma.financeDte.aggregate as unknown as ReturnType<
  typeof vi.fn
>;
const countMock = prisma.financeDte.count as unknown as ReturnType<typeof vi.fn>;

/**
 * Helper para devolver un Decimal-like que `_sum.totalAmount?.toNumber()`
 * pueda invocar. No usamos Prisma.Decimal real para evitar la dependencia
 * pesada en este test unitario; basta con `{ toNumber: () => n }`.
 */
function sum(totalAmount: number, taxAmount: number) {
  return {
    _sum: {
      totalAmount: { toNumber: () => totalAmount },
      taxAmount: { toNumber: () => taxAmount },
    },
  };
}

beforeEach(() => {
  aggregateMock.mockReset();
  countMock.mockReset();
});

describe("sales-aggregator — buildMonthRange", () => {
  it("ALL devuelve los últimos 12 meses incluyendo el actual", () => {
    const now = new Date(Date.UTC(2026, 4, 15)); // Mayo 2026
    const r = buildMonthRange("ALL", now);
    expect(r.from.toISOString()).toBe("2025-06-01T00:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(r.label).toBe("Últimos 12 meses");
  });

  it("YYYY-MM válido devuelve ese mes específico", () => {
    const r = buildMonthRange("2026-05");
    expect(r.from.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(r.label).toBe("Mayo 2026");
  });

  it("null/undefined/'' devuelve el mes en curso", () => {
    const now = new Date(Date.UTC(2026, 4, 15));
    expect(buildMonthRange(null, now).label).toBe("Mayo 2026");
    expect(buildMonthRange(undefined, now).label).toBe("Mayo 2026");
    expect(buildMonthRange("", now).label).toBe("Mayo 2026");
  });

  it("formato inválido cae al default (mes actual)", () => {
    const now = new Date(Date.UTC(2026, 4, 15));
    expect(buildMonthRange("invalid", now).label).toBe("Mayo 2026");
    expect(buildMonthRange("2026-13", now).label).toBe("Mayo 2026");
  });

  it("YTD devuelve año en curso (enero a fin del mes en curso)", () => {
    const now = new Date(Date.UTC(2026, 4, 15)); // mayo 2026
    const r = buildMonthRange("YTD", now);
    expect(r.from.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(r.label).toBe("Año 2026");
  });

  it("PREV devuelve mes anterior completo", () => {
    const now = new Date(Date.UTC(2026, 4, 15)); // mayo 2026
    const r = buildMonthRange("PREV", now);
    expect(r.from.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(r.label).toBe("Abril 2026");
  });

  it("PREV en enero devuelve diciembre del año anterior", () => {
    const now = new Date(Date.UTC(2026, 0, 15)); // enero 2026
    const r = buildMonthRange("PREV", now);
    expect(r.from.toISOString()).toBe("2025-12-01T00:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(r.label).toBe("Diciembre 2025");
  });
});

describe("sales-aggregator — prevRangeOf", () => {
  it("para un mes simple devuelve el mes inmediatamente anterior", () => {
    const r = buildMonthRange("2026-05");
    const prev = prevRangeOf(r);
    expect(prev.from.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(prev.to.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(prev.label).toBe("vs mes anterior");
  });

  it("para 12 meses devuelve los 12 meses previos", () => {
    const now = new Date(Date.UTC(2026, 4, 15));
    const r = buildMonthRange("ALL", now);
    const prev = prevRangeOf(r);
    expect(prev.from.toISOString()).toBe("2024-06-01T00:00:00.000Z");
    expect(prev.to.toISOString()).toBe("2025-06-01T00:00:00.000Z");
    expect(prev.label).toBe("vs 12 meses previos");
  });
});

describe("sales-aggregator — computeNetSales", () => {
  it("filtra por date (NO createdAt) y excluye dteType=61 del bruto", async () => {
    aggregateMock.mockResolvedValue(sum(0, 0));
    countMock.mockResolvedValue(0);
    const range = buildMonthRange("2026-05");

    await computeNetSales("tenant-A", range);

    // Hubo 6 calls: 3 aggregate + 3 count.
    expect(aggregateMock).toHaveBeenCalledTimes(3);
    expect(countMock).toHaveBeenCalledTimes(3);

    const firstAggCall = aggregateMock.mock.calls[0][0];
    expect(firstAggCall.where.tenantId).toBe("tenant-A");
    expect(firstAggCall.where.direction).toBe("ISSUED");
    expect(firstAggCall.where.date).toEqual({
      gte: range.from,
      lt: range.to,
    });
    expect(firstAggCall.where.dteType).toEqual({
      in: [...POSITIVE_TYPES],
    });
    // No debe haber filtro createdAt.
    expect(firstAggCall.where).not.toHaveProperty("createdAt");
  });

  it("aplica fórmula: ventasNetas = (33+34+39+41) + (56) − (61)", async () => {
    // 1.000.000 brutos (positives) + 200.000 ND - 300.000 NC = 900.000 netas
    aggregateMock
      .mockResolvedValueOnce(sum(1_000_000, 190_000)) // POSITIVE
      .mockResolvedValueOnce(sum(200_000, 38_000)) // ND
      .mockResolvedValueOnce(sum(300_000, 57_000)); // NC
    countMock
      .mockResolvedValueOnce(5) // POS count
      .mockResolvedValueOnce(1) // ND count
      .mockResolvedValueOnce(2); // NC count

    const range = buildMonthRange("2026-05");
    const r = await computeNetSales("tenant-A", range);

    expect(r.ventasBrutas).toBe(1_000_000);
    expect(r.ndMonto).toBe(200_000);
    expect(r.ncMonto).toBe(300_000);
    expect(r.ventasNetas).toBe(900_000);
    expect(r.ivaBruto).toBe(190_000);
    expect(r.ivaNd).toBe(38_000);
    expect(r.ivaNc).toBe(57_000);
    expect(r.ivaDebito).toBe(171_000);
    expect(r.facturasMes).toBe(6); // POS + ND
    expect(r.ncCount).toBe(2);
    expect(r.ndCount).toBe(1);
    expect(r.range.label).toBe("Mayo 2026");
  });

  it("usa default ACCEPTED+PENDING+SENT cuando no se pasa statusInclude", async () => {
    aggregateMock.mockResolvedValue(sum(0, 0));
    countMock.mockResolvedValue(0);

    await computeNetSales("tenant-A", buildMonthRange("2026-05"));

    const where = aggregateMock.mock.calls[0][0].where;
    expect(where.siiStatus).toEqual({ in: DEFAULT_INCLUDED_STATUS });
  });

  it("respeta statusInclude custom (ej: solo ACCEPTED para reconciliar F29)", async () => {
    aggregateMock.mockResolvedValue(sum(0, 0));
    countMock.mockResolvedValue(0);

    await computeNetSales("tenant-A", buildMonthRange("2026-05"), {
      statusInclude: ["ACCEPTED"],
    });

    const where = aggregateMock.mock.calls[0][0].where;
    expect(where.siiStatus).toEqual({ in: ["ACCEPTED"] });
  });

  it("sin DTEs en el período devuelve ceros, no null", async () => {
    aggregateMock.mockResolvedValue({
      _sum: { totalAmount: null, taxAmount: null },
    });
    countMock.mockResolvedValue(0);

    const r = await computeNetSales("tenant-A", buildMonthRange("2026-05"));

    expect(r.ventasNetas).toBe(0);
    expect(r.ivaDebito).toBe(0);
    expect(r.facturasMes).toBe(0);
    expect(r.ncCount).toBe(0);
  });

  it("NC mayor que ventas brutas devuelve neto negativo (mes con devoluciones)", async () => {
    aggregateMock
      .mockResolvedValueOnce(sum(500_000, 95_000)) // POS
      .mockResolvedValueOnce(sum(0, 0)) // ND
      .mockResolvedValueOnce(sum(800_000, 152_000)); // NC
    countMock
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(3);

    const r = await computeNetSales("tenant-A", buildMonthRange("2026-05"));

    expect(r.ventasNetas).toBe(-300_000);
    expect(r.ivaDebito).toBe(-57_000);
  });
});

describe("sales-aggregator — computeNetPurchases", () => {
  it("usa direction=RECEIVED y NO filtra por siiStatus (no aplica a recibidos)", async () => {
    aggregateMock.mockResolvedValue(sum(0, 0));
    countMock.mockResolvedValue(0);
    const range = buildMonthRange("2026-05");

    await computeNetPurchases("tenant-A", range);

    const where = aggregateMock.mock.calls[0][0].where;
    expect(where.direction).toBe("RECEIVED");
    expect(where).not.toHaveProperty("siiStatus");
  });

  it("aplica la misma fórmula NC/ND para compras netas", async () => {
    aggregateMock
      .mockResolvedValueOnce(sum(2_000_000, 380_000)) // POS
      .mockResolvedValueOnce(sum(100_000, 19_000)) // ND
      .mockResolvedValueOnce(sum(50_000, 9_500)); // NC
    countMock
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);

    const r = await computeNetPurchases(
      "tenant-A",
      buildMonthRange("2026-05"),
    );

    expect(r.comprasBrutas).toBe(2_000_000);
    expect(r.comprasNetas).toBe(2_050_000);
    expect(r.ivaCredito).toBe(389_500);
    expect(r.facturasMes).toBe(11);
  });
});

describe("sales-aggregator — pctChange", () => {
  it("retorna 0 cuando prev es 0 (evita división por cero)", () => {
    expect(pctChange(100, 0)).toBe(0);
    expect(pctChange(0, 0)).toBe(0);
  });

  it("calcula crecimiento positivo correcto", () => {
    expect(pctChange(150, 100)).toBe(50);
  });

  it("calcula caída negativa correcta", () => {
    expect(pctChange(50, 100)).toBe(-50);
  });

  it("retorna 0 si prev es negativo (caso defensivo)", () => {
    expect(pctChange(100, -50)).toBe(0);
  });
});

describe("sales-aggregator — formatMonthLabel", () => {
  it("formatea correctamente el mes en español", () => {
    expect(formatMonthLabel(2026, 1)).toBe("Enero 2026");
    expect(formatMonthLabel(2026, 5)).toBe("Mayo 2026");
    expect(formatMonthLabel(2025, 12)).toBe("Diciembre 2025");
  });

  it("clampa valores fuera de rango", () => {
    expect(formatMonthLabel(2026, 0)).toBe("Enero 2026");
    expect(formatMonthLabel(2026, 13)).toBe("Diciembre 2026");
  });
});

describe("sales-aggregator — constantes exportadas (sanity check)", () => {
  it("POSITIVE_TYPES son los 4 tipos sumadores estándar SII", () => {
    expect(POSITIVE_TYPES).toEqual([33, 34, 39, 41]);
  });

  it("ND_TYPES = [56], NC_TYPES = [61]", () => {
    expect(ND_TYPES).toEqual([56]);
    expect(NC_TYPES).toEqual([61]);
  });

  it("DEFAULT_INCLUDED_STATUS incluye ACCEPTED+PENDING+SENT", () => {
    expect(DEFAULT_INCLUDED_STATUS).toEqual(["ACCEPTED", "PENDING", "SENT"]);
  });
});
