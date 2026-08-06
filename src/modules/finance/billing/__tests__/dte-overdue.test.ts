import { describe, it, expect, vi, beforeEach } from "vitest";

const updateMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeDte: {
      updateMany: (...a: unknown[]) => updateMany(...a),
    },
  },
}));

import {
  isDueDatePast,
  markOverdueDtes,
  resolveUnpaidPaymentStatus,
  startOfTodayChile,
} from "../dte-overdue.service";

/** Fecha tal como Postgres devuelve una columna `@db.Date`: medianoche UTC. */
function dbDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

describe("startOfTodayChile — corte de día", () => {
  it("ancla el día calendario a medianoche UTC", () => {
    expect(startOfTodayChile("2026-08-06").toISOString()).toBe(
      "2026-08-06T00:00:00.000Z",
    );
  });

  it("una fecha @db.Date de hoy NO queda bajo el corte", () => {
    const cutoff = startOfTodayChile("2026-08-06");
    expect(dbDate("2026-08-06").getTime() < cutoff.getTime()).toBe(false);
  });

  it("una fecha @db.Date de ayer sí queda bajo el corte", () => {
    const cutoff = startOfTodayChile("2026-08-06");
    expect(dbDate("2026-08-05").getTime() < cutoff.getTime()).toBe(true);
  });
});

describe("isDueDatePast", () => {
  it("vencimiento de ayer está vencido", () => {
    expect(isDueDatePast(dbDate("2026-08-05"), "2026-08-06")).toBe(true);
  });

  it("vencimiento de HOY no está vencido (vence al cierre del día)", () => {
    expect(isDueDatePast(dbDate("2026-08-06"), "2026-08-06")).toBe(false);
  });

  it("vencimiento futuro no está vencido", () => {
    expect(isDueDatePast(dbDate("2026-09-05"), "2026-08-06")).toBe(false);
  });

  it("sin vencimiento no hay evidencia de mora", () => {
    expect(isDueDatePast(null, "2026-08-06")).toBe(false);
    expect(isDueDatePast(undefined, "2026-08-06")).toBe(false);
  });

  it("es indiferente al ancla horaria del Date (mediodía vs medianoche UTC)", () => {
    // `parseYmdToDbDate` construye mediodía UTC; Postgres devuelve medianoche.
    // Ambos representan el mismo día y deben dar el mismo resultado.
    expect(isDueDatePast(new Date("2026-08-06T12:00:00.000Z"), "2026-08-06")).toBe(
      false,
    );
    expect(isDueDatePast(new Date("2026-08-05T12:00:00.000Z"), "2026-08-06")).toBe(
      true,
    );
  });
});

describe("resolveUnpaidPaymentStatus", () => {
  it("vencida pasa a OVERDUE", () => {
    expect(
      resolveUnpaidPaymentStatus(dbDate("2026-08-05"), "UNPAID", "2026-08-06"),
    ).toBe("OVERDUE");
  });

  it("al día queda UNPAID", () => {
    expect(
      resolveUnpaidPaymentStatus(dbDate("2026-09-05"), "UNPAID", "2026-08-06"),
    ).toBe("UNPAID");
  });

  it("vence hoy: todavía UNPAID", () => {
    expect(
      resolveUnpaidPaymentStatus(dbDate("2026-08-06"), "UNPAID", "2026-08-06"),
    ).toBe("UNPAID");
  });

  it("sin dueDate preserva un OVERDUE previo (no lo degrada)", () => {
    expect(resolveUnpaidPaymentStatus(null, "OVERDUE", "2026-08-06")).toBe(
      "OVERDUE",
    );
  });

  it("sin dueDate y sin estado previo de mora queda UNPAID", () => {
    expect(resolveUnpaidPaymentStatus(null, "UNPAID", "2026-08-06")).toBe(
      "UNPAID",
    );
    expect(resolveUnpaidPaymentStatus(null, "PARTIAL", "2026-08-06")).toBe(
      "UNPAID",
    );
  });

  it("con dueDate al día NO preserva el OVERDUE previo: se corrige a UNPAID", () => {
    // Caso real: alguien corrige el vencimiento hacia el futuro después de que
    // el cron marcó la factura. El recompute debe devolverla a UNPAID.
    expect(
      resolveUnpaidPaymentStatus(dbDate("2026-09-30"), "OVERDUE", "2026-08-06"),
    ).toBe("UNPAID");
  });
});

describe("markOverdueDtes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateMany.mockResolvedValue({ count: 0 });
  });

  it("solo toca ISSUED + UNPAID vencidos y cobrables", async () => {
    updateMany.mockResolvedValue({ count: 7 });
    const out = await markOverdueDtes({ todayYmd: "2026-08-06" });

    expect(out).toEqual({ todayYmd: "2026-08-06", updated: 7 });
    expect(updateMany).toHaveBeenCalledTimes(1);

    const arg = updateMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(arg.data).toEqual({ paymentStatus: "OVERDUE" });
    expect(arg.where.direction).toBe("ISSUED");
    expect(arg.where.paymentStatus).toBe("UNPAID");
    expect(arg.where.dueDate).toEqual({
      lt: new Date("2026-08-06T00:00:00.000Z"),
    });
    expect(arg.where.voidedByCreditNoteId).toBeNull();
    expect(arg.where.dteType).toEqual({ notIn: [61] });
    // Sin tenant explícito el barrido es global (cron de sistema).
    expect(arg.where.tenantId).toBeUndefined();
  });

  it("incluye PENDING: una factura recién emitida también vence", async () => {
    await markOverdueDtes({ todayYmd: "2026-08-06" });
    const where = (updateMany.mock.calls[0][0] as { where: { siiStatus: { in: string[] } } })
      .where;
    expect(where.siiStatus.in).toContain("PENDING");
    expect(where.siiStatus.in).toContain("ACCEPTED");
    expect(where.siiStatus.in).toContain("SENT");
    expect(where.siiStatus.in).toContain("WITH_OBJECTIONS");
  });

  it("excluye borradores, rechazadas y anuladas del SII", async () => {
    await markOverdueDtes({ todayYmd: "2026-08-06" });
    const where = (updateMany.mock.calls[0][0] as { where: { siiStatus: { in: string[] } } })
      .where;
    expect(where.siiStatus.in).not.toContain("DRAFT");
    expect(where.siiStatus.in).not.toContain("REJECTED");
    expect(where.siiStatus.in).not.toContain("ANNULLED");
  });

  it("no toca PARTIAL: perder el abono escondería el pago", async () => {
    await markOverdueDtes({ todayYmd: "2026-08-06" });
    const where = (updateMany.mock.calls[0][0] as { where: { paymentStatus: string } })
      .where;
    expect(where.paymentStatus).toBe("UNPAID");
  });

  it("acota por tenant cuando se pide", async () => {
    await markOverdueDtes({ tenantId: "t1", todayYmd: "2026-08-06" });
    const where = (updateMany.mock.calls[0][0] as { where: { tenantId: string } }).where;
    expect(where.tenantId).toBe("t1");
  });
});
