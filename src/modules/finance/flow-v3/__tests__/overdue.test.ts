import { describe, expect, it } from "vitest";
import {
  cessionFromPaymentStatus,
  computeOverdueDays,
  isCededRetentionName,
  resolveCession,
  type CessionInfo,
} from "../overdue";

const TODAY = "2026-08-06";

function base(over: Partial<Parameters<typeof computeOverdueDays>[0]> = {}) {
  return {
    dueYmd: "2026-05-20",
    todayYmd: TODAY,
    pendingClp: 1_000_000,
    paymentStatus: "UNPAID",
    cession: null as CessionInfo | null,
    reconciled: false,
    voided: false,
    isCededRetention: false,
    ...over,
  };
}

describe("computeOverdueDays", () => {
  it("vencida cobrable", () => {
    expect(computeOverdueDays(base({ dueYmd: "2026-05-20" }))).toBe(78);
  });

  it("vence hoy → 0", () => {
    expect(computeOverdueDays(base({ dueYmd: "2026-08-06" }))).toBe(0);
  });

  it("vence mañana → 0", () => {
    expect(computeOverdueDays(base({ dueYmd: "2026-08-07" }))).toBe(0);
  });

  it("cedida 100% vencida", () => {
    expect(
      computeOverdueDays(
        base({
          dueYmd: "2026-07-30",
          paymentStatus: "CEDED",
          cession: {
            active: true,
            pct: 100,
            factorName: "Amifactor",
            funded: false,
            dueYmd: "2026-10-01",
          },
        }),
      ),
    ).toBe(0);
  });

  it("cedida 80% vencida con paymentStatus UNPAID", () => {
    expect(
      computeOverdueDays(
        base({
          dueYmd: "2026-08-04",
          paymentStatus: "UNPAID",
          cession: {
            active: true,
            pct: 80,
            factorName: "Amifactor",
            funded: false,
            dueYmd: "2026-10-01",
          },
        }),
      ),
    ).toBe(0);
  });

  it("cedida fondeada", () => {
    expect(
      computeOverdueDays(
        base({
          dueYmd: "2026-07-30",
          paymentStatus: "UNPAID",
          cession: {
            active: true,
            pct: 100,
            factorName: "Amifactor",
            funded: true,
            dueYmd: "2026-10-01",
          },
        }),
      ),
    ).toBe(0);
  });

  it("cesión cancelada vuelve al circuito", () => {
    expect(
      computeOverdueDays(
        base({
          dueYmd: "2026-07-30",
          paymentStatus: "UNPAID",
          cession: null,
        }),
      ),
    ).toBe(7);
  });

  it("retención de cesión parcial", () => {
    expect(
      computeOverdueDays(
        base({
          dueYmd: "2026-08-04",
          paymentStatus: "UNPAID",
          cession: {
            active: true,
            pct: 80,
            factorName: "Amifactor",
            funded: false,
            dueYmd: "2026-10-01",
          },
          isCededRetention: true,
        }),
      ),
    ).toBe(0);
  });

  it("conciliada", () => {
    expect(
      computeOverdueDays(
        base({
          dueYmd: "2026-05-20",
          paymentStatus: "PARTIAL",
          reconciled: true,
        }),
      ),
    ).toBe(0);
  });

  it("pagada", () => {
    expect(
      computeOverdueDays(base({ dueYmd: "2026-05-20", paymentStatus: "PAID" })),
    ).toBe(0);
  });

  it("anulada por NC", () => {
    expect(
      computeOverdueDays(base({ dueYmd: "2026-05-20", voided: true })),
    ).toBe(0);
  });

  it("sin dueYmd", () => {
    expect(computeOverdueDays(base({ dueYmd: null }))).toBe(0);
  });

  it("saldo 0", () => {
    expect(
      computeOverdueDays(
        base({ dueYmd: "2026-05-20", paymentStatus: "PARTIAL", pendingClp: 0 }),
      ),
    ).toBe(0);
  });
});

describe("resolveCession", () => {
  it("null si no hay ops activas", () => {
    expect(
      resolveCession([
        {
          status: "CANCELLED",
          advanceRate: 100,
          factoringCompany: "X",
          fechaVencimiento: null,
        },
      ]),
    ).toBeNull();
  });

  it("toma la de mayor advanceRate entre activas", () => {
    const info = resolveCession([
      {
        status: "APPROVED",
        advanceRate: 80,
        factoringCompany: "A",
        fechaVencimiento: new Date("2026-10-01T00:00:00Z"),
      },
      {
        status: "FUNDED",
        advanceRate: 100,
        factoringCompany: "B",
        fechaVencimiento: new Date("2026-11-01T00:00:00Z"),
      },
    ]);
    expect(info).toMatchObject({
      active: true,
      pct: 100,
      factorName: "B",
      funded: true,
      dueYmd: "2026-11-01",
    });
  });

  it("SUBMITTED cuenta como activa y no funded", () => {
    const info = resolveCession([
      {
        status: "SUBMITTED",
        advanceRate: 100,
        factoringCompany: "Amifactor",
        fechaVencimiento: new Date("2026-10-03T00:00:00Z"),
      },
    ]);
    expect(info).toMatchObject({ active: true, funded: false, pct: 100 });
  });
});

describe("cessionFromPaymentStatus / isCededRetentionName", () => {
  it("fallback CEDED externo", () => {
    expect(cessionFromPaymentStatus("CEDED")).toMatchObject({
      active: true,
      pct: 100,
    });
    expect(cessionFromPaymentStatus("UNPAID")).toBeNull();
  });

  it("detecta retención por nombre de fila/template", () => {
    expect(isCededRetentionName("Transmat 20%")).toBe(true);
    expect(isCededRetentionName("Transmat 80%")).toBe(false);
    expect(isCededRetentionName("Retención factoring")).toBe(true);
    expect(isCededRetentionName(null)).toBe(false);
  });
});
