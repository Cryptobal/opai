/**
 * Tests del auto-match de turnos extras. Mockea Prisma para validar la
 * lógica pura: descartes (TGR, ingreso, sueldo), match exacto por
 * monto + RUT, ambigüedad cuando hay múltiples candidatos válidos.
 *
 * Los efectos secundarios (cerrar lote, marcar paidAt, crear link) se
 * verifican observando las llamadas a los métodos mockeados de Prisma.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => {
  const $transaction = vi.fn();
  const financeBankTransaction = {
    findFirst: vi.fn(),
    update: vi.fn(),
  };
  const financeBankTransactionLink = {
    create: vi.fn(),
  };
  const opsPagoTeItem = {
    findMany: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  };
  const opsTurnoExtra = {
    findMany: vi.fn(),
    update: vi.fn(),
  };
  const opsPagoTeLote = {
    update: vi.fn(),
  };
  const payrollLiquidacion = {
    findFirst: vi.fn(),
  };
  return {
    prisma: {
      $transaction,
      financeBankTransaction,
      financeBankTransactionLink,
      opsPagoTeItem,
      opsTurnoExtra,
      opsPagoTeLote,
      payrollLiquidacion,
    },
  };
});

import { prisma } from "@/lib/prisma";
import { tryAutoMatchBankTransactionToTurnoExtra } from "../auto-match-turno-extra.service";

const $tx = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;

function dec(n: number) {
  return {
    toNumber: () => n,
    abs: () => dec(Math.abs(n)),
  };
}

function mockTransactionRunsCallback() {
  $tx.mockImplementation(async (cb: (tx: typeof prisma) => unknown) => {
    return await cb(prisma);
  });
}

const RUT_JUAN = "12.345.678-5";
const RUT_PEDRO = "11.111.111-1";

/**
 * Helper para construir un candidato OpsPagoTeItem completo con joins
 * (lote + guardia.persona). Defaults razonables para fechas y status.
 */
function buildCandidate(opts: {
  id: string;
  turnoExtraId?: string;
  guardiaId?: string;
  loteId?: string;
  amountClp: number;
  rut: string;
  weekStart?: Date;
  weekEnd?: Date;
}) {
  return {
    id: opts.id,
    loteId: opts.loteId ?? "lote-1",
    turnoExtraId: opts.turnoExtraId ?? `te-${opts.id}`,
    guardiaId: opts.guardiaId ?? `g-${opts.id}`,
    amountClp: dec(opts.amountClp),
    lote: {
      id: opts.loteId ?? "lote-1",
      status: "paid",
      weekStart: opts.weekStart ?? new Date("2026-05-05"),
      weekEnd: opts.weekEnd ?? new Date("2026-05-11"),
    },
    guardia: {
      id: opts.guardiaId ?? `g-${opts.id}`,
      persona: { rut: opts.rut },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.opsTurnoExtra.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
});

describe("tryAutoMatchBankTransactionToTurnoExtra", () => {
  it("retorna already_matched si la bank tx ya está MATCHED", async () => {
    mockTransactionRunsCallback();
    (prisma.financeBankTransaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "tx-1",
      bankAccountId: "ba-1",
      transactionDate: new Date("2026-05-15"),
      description: `TRANSF ${RUT_JUAN}`,
      reference: null,
      amount: dec(-35_000),
      reconciliationStatus: "MATCHED",
    });

    const r = await tryAutoMatchBankTransactionToTurnoExtra("tenant-A", "tx-1", "u-1");

    expect(r.matched).toBe(false);
    expect(r.reason).toBe("already_matched");
    expect(prisma.opsPagoTeItem.findMany).not.toHaveBeenCalled();
  });

  it("retorna not_egress si la bank tx es ingreso", async () => {
    mockTransactionRunsCallback();
    (prisma.financeBankTransaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "tx-1",
      bankAccountId: "ba-1",
      transactionDate: new Date("2026-05-15"),
      description: "ABONO CLIENTE",
      reference: null,
      amount: dec(35_000),
      reconciliationStatus: "UNMATCHED",
    });

    const r = await tryAutoMatchBankTransactionToTurnoExtra("tenant-A", "tx-1", "u-1");

    expect(r.matched).toBe(false);
    expect(r.reason).toBe("not_egress");
  });

  it("retorna skipped_test_amount para monto 0", async () => {
    mockTransactionRunsCallback();
    (prisma.financeBankTransaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "tx-1",
      bankAccountId: "ba-1",
      transactionDate: new Date("2026-05-15"),
      description: "TEST",
      reference: null,
      amount: dec(0),
      reconciliationStatus: "UNMATCHED",
    });

    const r = await tryAutoMatchBankTransactionToTurnoExtra("tenant-A", "tx-1", "u-1");

    expect(r.matched).toBe(false);
    expect(r.reason).toBe("skipped_test_amount");
  });

  it("descarta como tgr_payment cuando la glosa menciona TGR", async () => {
    mockTransactionRunsCallback();
    (prisma.financeBankTransaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "tx-1",
      bankAccountId: "ba-1",
      transactionDate: new Date("2026-05-15"),
      description: `PAGO TGR FINIQUITO ${RUT_JUAN}`,
      reference: null,
      amount: dec(-150_000),
      reconciliationStatus: "UNMATCHED",
    });

    const r = await tryAutoMatchBankTransactionToTurnoExtra("tenant-A", "tx-1", "u-1");

    expect(r.matched).toBe(false);
    expect(r.reason).toBe("tgr_payment");
    expect(prisma.opsPagoTeItem.findMany).not.toHaveBeenCalled();
  });

  it("descarta también con la variante TESORERÍA (con tilde)", async () => {
    mockTransactionRunsCallback();
    (prisma.financeBankTransaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "tx-1",
      bankAccountId: "ba-1",
      transactionDate: new Date("2026-05-15"),
      description: "PAGO A TESORERÍA GENERAL DE LA REPÚBLICA",
      reference: null,
      amount: dec(-200_000),
      reconciliationStatus: "UNMATCHED",
    });

    const r = await tryAutoMatchBankTransactionToTurnoExtra("tenant-A", "tx-1", "u-1");

    expect(r.reason).toBe("tgr_payment");
  });

  it("retorna no_candidate si no hay items pendientes ni TE huérfano", async () => {
    mockTransactionRunsCallback();
    (prisma.financeBankTransaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "tx-1",
      bankAccountId: "ba-1",
      transactionDate: new Date("2026-05-15"),
      description: `TRANSF ${RUT_JUAN}`,
      reference: null,
      amount: dec(-35_000),
      reconciliationStatus: "UNMATCHED",
    });
    (prisma.opsPagoTeItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const r = await tryAutoMatchBankTransactionToTurnoExtra("tenant-A", "tx-1", "u-1");

    expect(r.matched).toBe(false);
    expect(r.reason).toBe("no_candidate");
    expect(prisma.opsTurnoExtra.findMany).toHaveBeenCalled();
  });

  it("retorna no_candidate si hay items pero ninguno con el RUT en glosa", async () => {
    mockTransactionRunsCallback();
    (prisma.financeBankTransaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "tx-1",
      bankAccountId: "ba-1",
      transactionDate: new Date("2026-05-15"),
      description: "TRANSFERENCIA SIN RUT", // ningún RUT
      reference: null,
      amount: dec(-35_000),
      reconciliationStatus: "UNMATCHED",
    });
    (prisma.opsPagoTeItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      buildCandidate({ id: "item-1", amountClp: 35_000, rut: RUT_JUAN }),
    ]);

    const r = await tryAutoMatchBankTransactionToTurnoExtra("tenant-A", "tx-1", "u-1");

    expect(r.matched).toBe(false);
    expect(r.reason).toBe("no_candidate");
  });

  it("retorna no_candidate si la fecha cae fuera de la ventana del lote", async () => {
    mockTransactionRunsCallback();
    (prisma.financeBankTransaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "tx-1",
      bankAccountId: "ba-1",
      transactionDate: new Date("2027-01-01"), // 8 meses después del lote
      description: `TRANSF ${RUT_JUAN}`,
      reference: null,
      amount: dec(-35_000),
      reconciliationStatus: "UNMATCHED",
    });
    (prisma.opsPagoTeItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      buildCandidate({
        id: "item-1",
        amountClp: 35_000,
        rut: RUT_JUAN,
        weekStart: new Date("2026-05-05"),
        weekEnd: new Date("2026-05-11"),
      }),
    ]);

    const r = await tryAutoMatchBankTransactionToTurnoExtra("tenant-A", "tx-1", "u-1");

    expect(r.reason).toBe("no_candidate");
  });

  it("descarta como looks_like_salary si hay liquidación con netSalary similar en ±7d", async () => {
    mockTransactionRunsCallback();
    (prisma.financeBankTransaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "tx-1",
      bankAccountId: "ba-1",
      transactionDate: new Date("2026-05-08"), // dentro de la ventana
      description: `TRANSF SUELDO ${RUT_JUAN}`,
      reference: null,
      amount: dec(-450_000), // sueldo, no turno extra
      reconciliationStatus: "UNMATCHED",
    });
    (prisma.opsPagoTeItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      buildCandidate({
        id: "item-1",
        amountClp: 450_000,
        rut: RUT_JUAN,
      }),
    ]);
    (prisma.payrollLiquidacion.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      netSalary: dec(450_000),
    });

    const r = await tryAutoMatchBankTransactionToTurnoExtra("tenant-A", "tx-1", "u-1");

    expect(r.matched).toBe(false);
    expect(r.reason).toBe("looks_like_salary");
    expect(prisma.financeBankTransactionLink.create).not.toHaveBeenCalled();
  });

  it("NO descarta cuando la liquidación cercana tiene netSalary distinto al monto", async () => {
    mockTransactionRunsCallback();
    (prisma.financeBankTransaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "tx-1",
      bankAccountId: "ba-1",
      transactionDate: new Date("2026-05-08"),
      description: `TRANSF ${RUT_JUAN}`,
      reference: null,
      amount: dec(-35_000),
      reconciliationStatus: "UNMATCHED",
    });
    (prisma.opsPagoTeItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      buildCandidate({ id: "item-1", amountClp: 35_000, rut: RUT_JUAN }),
    ]);
    // Hay un sueldo cercano pero por $450k, no por $35k → no descarta.
    (prisma.payrollLiquidacion.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      netSalary: dec(450_000),
    });
    (prisma.opsPagoTeItem.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const r = await tryAutoMatchBankTransactionToTurnoExtra("tenant-A", "tx-1", "u-1");

    expect(r.matched).toBe(true);
    expect(r.pagoTeItemId).toBe("item-1");
  });

  it("matchea cuando hay 1 candidato con RUT en glosa y fecha en ventana", async () => {
    mockTransactionRunsCallback();
    (prisma.financeBankTransaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "tx-1",
      bankAccountId: "ba-1",
      transactionDate: new Date("2026-05-15"),
      description: `TRANSF ${RUT_JUAN} TURNO`,
      reference: null,
      amount: dec(-35_000),
      reconciliationStatus: "UNMATCHED",
    });
    (prisma.opsPagoTeItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      buildCandidate({
        id: "item-1",
        turnoExtraId: "te-1",
        guardiaId: "g-juan",
        loteId: "lote-1",
        amountClp: 35_000,
        rut: RUT_JUAN,
      }),
    ]);
    (prisma.payrollLiquidacion.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.opsPagoTeItem.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const r = await tryAutoMatchBankTransactionToTurnoExtra("tenant-A", "tx-1", "u-1");

    expect(r.matched).toBe(true);
    expect(r.pagoTeItemId).toBe("item-1");
    expect(r.turnoExtraId).toBe("te-1");
    expect(r.guardiaId).toBe("g-juan");
    expect(r.loteId).toBe("lote-1");
    expect(r.matchedOrphanTurno).toBe(false);

    // Side effects esperados.
    expect(prisma.financeBankTransactionLink.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        targetType: "TE_ITEM",
        targetId: "item-1",
      }),
    });
    expect(prisma.opsPagoTeItem.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: expect.objectContaining({ status: "paid" }),
    });
    expect(prisma.opsTurnoExtra.update).toHaveBeenCalledWith({
      where: { id: "te-1" },
      data: expect.objectContaining({ paidAt: new Date("2026-05-15") }),
    });
    // Como no quedan items pendientes en el lote, debe cerrarlo.
    expect(prisma.opsPagoTeLote.update).toHaveBeenCalledWith({
      where: { id: "lote-1" },
      data: expect.objectContaining({ status: "paid" }),
    });
    expect(prisma.financeBankTransaction.update).toHaveBeenCalledWith({
      where: { id: "tx-1" },
      data: { reconciliationStatus: "MATCHED" },
    });
  });

  it("NO cierra el lote si quedan items pendientes", async () => {
    mockTransactionRunsCallback();
    (prisma.financeBankTransaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "tx-1",
      bankAccountId: "ba-1",
      transactionDate: new Date("2026-05-15"),
      description: `TRANSF ${RUT_JUAN}`,
      reference: null,
      amount: dec(-35_000),
      reconciliationStatus: "UNMATCHED",
    });
    (prisma.opsPagoTeItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      buildCandidate({ id: "item-1", amountClp: 35_000, rut: RUT_JUAN }),
    ]);
    (prisma.payrollLiquidacion.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    // Aún quedan 3 items pendientes en el lote.
    (prisma.opsPagoTeItem.count as ReturnType<typeof vi.fn>).mockResolvedValue(3);

    const r = await tryAutoMatchBankTransactionToTurnoExtra("tenant-A", "tx-1", "u-1");

    expect(r.matched).toBe(true);
    expect(prisma.opsPagoTeLote.update).not.toHaveBeenCalled();
  });

  it("retorna ambiguous si hay 2 candidatos con el mismo RUT/monto en ventana", async () => {
    // Caso real: el guardia tiene 2 turnos del mismo monto en planilla y
    // el banco solo refleja 1 pago. No es seguro elegir cuál → revisar.
    mockTransactionRunsCallback();
    (prisma.financeBankTransaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "tx-1",
      bankAccountId: "ba-1",
      transactionDate: new Date("2026-05-15"),
      description: `TRANSF ${RUT_JUAN}`,
      reference: null,
      amount: dec(-35_000),
      reconciliationStatus: "UNMATCHED",
    });
    (prisma.opsPagoTeItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      buildCandidate({ id: "item-1", amountClp: 35_000, rut: RUT_JUAN }),
      buildCandidate({ id: "item-2", amountClp: 35_000, rut: RUT_JUAN }),
    ]);
    (prisma.payrollLiquidacion.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const r = await tryAutoMatchBankTransactionToTurnoExtra("tenant-A", "tx-1", "u-1");

    expect(r.matched).toBe(false);
    expect(r.reason).toBe("ambiguous");
    expect(r.candidateIds).toEqual(["item-1", "item-2"]);
    expect(prisma.financeBankTransactionLink.create).not.toHaveBeenCalled();
  });

  it("filtra correctamente entre guardias distintos con el mismo monto", async () => {
    // El banco tiene RUT de Juan, hay candidatos para Juan y Pedro con
    // mismo monto. Debe quedarse solo con el de Juan.
    mockTransactionRunsCallback();
    (prisma.financeBankTransaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "tx-1",
      bankAccountId: "ba-1",
      transactionDate: new Date("2026-05-15"),
      description: `TRANSF ${RUT_JUAN}`,
      reference: null,
      amount: dec(-35_000),
      reconciliationStatus: "UNMATCHED",
    });
    (prisma.opsPagoTeItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      buildCandidate({ id: "item-juan", guardiaId: "g-juan", amountClp: 35_000, rut: RUT_JUAN }),
      buildCandidate({ id: "item-pedro", guardiaId: "g-pedro", amountClp: 35_000, rut: RUT_PEDRO }),
    ]);
    (prisma.payrollLiquidacion.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.opsPagoTeItem.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const r = await tryAutoMatchBankTransactionToTurnoExtra("tenant-A", "tx-1", "u-1");

    expect(r.matched).toBe(true);
    expect(r.pagoTeItemId).toBe("item-juan");
  });

  it("con ítems de planilla pendientes pero sin RUT en glosa no evalúa TE huérfano", async () => {
    mockTransactionRunsCallback();
    (prisma.financeBankTransaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "tx-1",
      bankAccountId: "ba-1",
      transactionDate: new Date("2026-05-15"),
      description: "TRANSFERENCIA SIN RUT",
      reference: null,
      amount: dec(-35_000),
      reconciliationStatus: "UNMATCHED",
    });
    (prisma.opsPagoTeItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      buildCandidate({ id: "item-1", amountClp: 35_000, rut: RUT_JUAN }),
    ]);

    const r = await tryAutoMatchBankTransactionToTurnoExtra("tenant-A", "tx-1", "u-1");

    expect(r.matched).toBe(false);
    expect(r.reason).toBe("no_candidate");
    expect(prisma.opsTurnoExtra.findMany).not.toHaveBeenCalled();
  });

  it("sin planilla con ese monto, matchea TE aprobado pendiente (TE_TURNO) si monto < 300k", async () => {
    mockTransactionRunsCallback();
    (prisma.financeBankTransaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "tx-1",
      bankAccountId: "ba-1",
      transactionDate: new Date("2026-05-15"),
      description: `TRANSF ${RUT_JUAN}`,
      reference: null,
      amount: dec(-35_000),
      reconciliationStatus: "UNMATCHED",
    });
    (prisma.opsPagoTeItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.opsTurnoExtra.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "te-orphan",
        guardiaId: "g-juan",
        date: new Date("2026-05-10"),
        installationId: "inst-1",
        guardia: { id: "g-juan", persona: { rut: RUT_JUAN } },
      },
    ]);
    (prisma.payrollLiquidacion.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const r = await tryAutoMatchBankTransactionToTurnoExtra("tenant-A", "tx-1", "u-1");

    expect(r.matched).toBe(true);
    expect(r.matchedOrphanTurno).toBe(true);
    expect(r.turnoExtraId).toBe("te-orphan");
    expect(r.guardiaId).toBe("g-juan");
    expect(r.pagoTeItemId).toBeUndefined();
    expect(prisma.financeBankTransactionLink.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        targetType: "TE_TURNO",
        targetId: "te-orphan",
      }),
    });
    expect(prisma.opsTurnoExtra.update).toHaveBeenCalledWith({
      where: { id: "te-orphan" },
      data: expect.objectContaining({ paidAt: new Date("2026-05-15") }),
    });
    expect(prisma.opsPagoTeItem.update).not.toHaveBeenCalled();
  });

  it("sin planilla: monto ≥ $300.000 no autoconcilia TE huérfano", async () => {
    mockTransactionRunsCallback();
    (prisma.financeBankTransaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "tx-1",
      bankAccountId: "ba-1",
      transactionDate: new Date("2026-05-15"),
      description: `TRANSF ${RUT_JUAN}`,
      reference: null,
      amount: dec(-350_000),
      reconciliationStatus: "UNMATCHED",
    });
    (prisma.opsPagoTeItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const r = await tryAutoMatchBankTransactionToTurnoExtra("tenant-A", "tx-1", "u-1");

    expect(r.matched).toBe(false);
    expect(r.reason).toBe("no_candidate");
    expect(prisma.opsTurnoExtra.findMany).not.toHaveBeenCalled();
  });

  it("sin planilla: dos TE huérfanos mismo monto y RUT → ambiguous", async () => {
    mockTransactionRunsCallback();
    (prisma.financeBankTransaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "tx-1",
      bankAccountId: "ba-1",
      transactionDate: new Date("2026-05-15"),
      description: `TRANSF ${RUT_JUAN}`,
      reference: null,
      amount: dec(-35_000),
      reconciliationStatus: "UNMATCHED",
    });
    (prisma.opsPagoTeItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.opsTurnoExtra.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "te-a",
        guardiaId: "g-juan",
        date: new Date("2026-05-08"),
        installationId: "inst-1",
        guardia: { id: "g-juan", persona: { rut: RUT_JUAN } },
      },
      {
        id: "te-b",
        guardiaId: "g-juan",
        date: new Date("2026-05-09"),
        installationId: "inst-2",
        guardia: { id: "g-juan", persona: { rut: RUT_JUAN } },
      },
    ]);
    (prisma.payrollLiquidacion.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const r = await tryAutoMatchBankTransactionToTurnoExtra("tenant-A", "tx-1", "u-1");

    expect(r.matched).toBe(false);
    expect(r.reason).toBe("ambiguous");
    expect(r.candidateIds?.sort()).toEqual(["te-a", "te-b"].sort());
  });
});
