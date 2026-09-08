import { describe, it, expect, vi } from "vitest";
import {
  nextPaymentRecordCode,
  paymentRecordSeriesForIncome,
} from "../payment-record-code";

function clientWithLast(code: string | null) {
  return {
    financePaymentRecord: {
      findFirst: vi.fn().mockResolvedValue(code ? { code } : null),
    },
  };
}

describe("paymentRecordSeriesForIncome", () => {
  it("mapea signo y auto a la serie correcta", () => {
    expect(paymentRecordSeriesForIncome(true)).toBe("COLLECTION");
    expect(paymentRecordSeriesForIncome(false)).toBe("DISBURSEMENT");
    expect(paymentRecordSeriesForIncome(true, true)).toBe("COLLECTION_AUTO");
    expect(paymentRecordSeriesForIncome(false, true)).toBe("DISBURSEMENT_AUTO");
  });
});

describe("nextPaymentRecordCode", () => {
  it("parte en 000001 si no hay registros de la serie", async () => {
    const tx = clientWithLast(null);
    await expect(
      nextPaymentRecordCode(tx, "tenant-A", "COLLECTION")
    ).resolves.toBe("COB-000001");
  });

  it("usa el máximo de COB-NNNNNN, no el count global (reproduce el error de conciliar)", async () => {
    // Producción Gard: 206 records totales, max COB = 000211.
    // El count+1 generaba COB-000207 y el lote de 9 movs pisaba COB-000210.
    const tx = clientWithLast("COB-000211");
    await expect(
      nextPaymentRecordCode(tx, "tenant-A", "COLLECTION")
    ).resolves.toBe("COB-000212");

    expect(tx.financePaymentRecord.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-A",
          code: { startsWith: "COB-" },
          NOT: { code: { startsWith: "COB-AUTO-" } },
        }),
        orderBy: { code: "desc" },
      })
    );
  });

  it("no toma COB-AUTO-* como último de la serie manual", async () => {
    const tx = clientWithLast("COB-000137");
    await expect(
      nextPaymentRecordCode(tx, "tenant-A", "COLLECTION")
    ).resolves.toBe("COB-000138");
  });

  it("serie PAG independiente de COB", async () => {
    const tx = clientWithLast("PAG-000137");
    await expect(
      nextPaymentRecordCode(tx, "tenant-A", "DISBURSEMENT")
    ).resolves.toBe("PAG-000138");
  });

  it("serie AUTO usa su propio correlativo", async () => {
    const tx = clientWithLast("COB-AUTO-000057");
    await expect(
      nextPaymentRecordCode(tx, "tenant-A", "COLLECTION_AUTO")
    ).resolves.toBe("COB-AUTO-000058");
    expect(tx.financePaymentRecord.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          code: { startsWith: "COB-AUTO-" },
        }),
      })
    );
    const where = tx.financePaymentRecord.findFirst.mock.calls[0][0].where;
    expect(where.NOT).toBeUndefined();
  });
});
