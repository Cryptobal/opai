/**
 * Tests del servicio de auto-match de pagos. Mockea Prisma para validar
 * la lógica pura: detección de RUT en texto, reglas de match único,
 * desambiguación por RUT cuando hay múltiples candidatos por monto.
 *
 * Los tests del flujo completo (transacción + side effects) corren con
 * un Prisma real en el entorno de integración; acá solo verificamos
 * las decisiones del algoritmo.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks ANTES de importar el módulo.
vi.mock("@/lib/prisma", () => {
  const $transaction = vi.fn();
  const financeBankTransaction = {
    findFirst: vi.fn(),
    update: vi.fn(),
  };
  const financeDte = {
    findMany: vi.fn(),
    update: vi.fn(),
  };
  const financePaymentRecord = {
    count: vi.fn(),
    create: vi.fn(),
  };
  const financePaymentAllocation = {
    create: vi.fn(),
  };
  const financeReconciliation = {
    findFirst: vi.fn(),
  };
  const financeReconciliationMatch = {
    create: vi.fn(),
  };
  return {
    prisma: {
      $transaction,
      financeBankTransaction,
      financeDte,
      financePaymentRecord,
      financePaymentAllocation,
      financeReconciliation,
      financeReconciliationMatch,
    },
  };
});

import { prisma } from "@/lib/prisma";
import {
  normalizeRutForMatch,
  rutAppearsInText,
  tryAutoMatchBankTransactionToDte,
} from "../auto-match-payment.service";

const $tx = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;

/** Helper Decimal-like que mimetiza Prisma.Decimal sin importar la lib. */
function dec(n: number) {
  return {
    toNumber: () => n,
    abs: () => dec(Math.abs(n)),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("normalizeRutForMatch", () => {
  it("limpia puntos y guion, lowercase para K", () => {
    expect(normalizeRutForMatch("12.345.678-5")).toBe("123456785");
    // Para test de K, usamos un placeholder allowlisted con K final.
    expect(normalizeRutForMatch("12.345.678-K")).toBe("12345678k");
    expect(normalizeRutForMatch("12345678k")).toBe("12345678k");
  });
  it("retorna vacío para null/undefined", () => {
    expect(normalizeRutForMatch(null)).toBe("");
    expect(normalizeRutForMatch(undefined)).toBe("");
    expect(normalizeRutForMatch("")).toBe("");
  });
});

describe("rutAppearsInText", () => {
  it("matchea con o sin formato dentro de un texto", () => {
    expect(
      rutAppearsInText(
        "12.345.678-5",
        "TRANSF. 12.345.678-5 EMPRESA XYZ",
      ),
    ).toBe(true);
    expect(
      rutAppearsInText(
        "12.345.678-5",
        "TRANSF. 12.345.678-5 EMPRESA XYZ",
      ),
    ).toBe(true);
    expect(
      rutAppearsInText(
        "12.345.678-5",
        "TRANSF. 12.345.678-5 EMPRESA XYZ",
      ),
    ).toBe(true);
  });

  it("acepta múltiples textos (description + reference)", () => {
    expect(
      rutAppearsInText("12.345.678-5", "TRANSFER", "REF: 12.345.678-5"),
    ).toBe(true);
  });

  it("retorna false si el RUT no aparece", () => {
    expect(
      rutAppearsInText("12.345.678-5", "PAGO PROVEEDOR XYZ", "REF: 999"),
    ).toBe(false);
  });

  it("retorna false para RUTs muy cortos (< 7 chars)", () => {
    expect(rutAppearsInText("12-3", "TRANSFER 123 EMPRESA")).toBe(false);
  });

  it("matchea aunque otro RUT también esté en el texto", () => {
    // Caso real: el banco a veces incluye el RUT del beneficiario Y
    // del pagador. Acá nos basta con que el del DTE esté presente.
    expect(
      rutAppearsInText(
        "12.345.678-5",
        "TRANSF DE 11.111.111-1 A 12.345.678-5",
      ),
    ).toBe(true);
  });
});

/**
 * Helper para configurar el mock de $transaction. La función real
 * recibe un callback que opera sobre `tx`. Como mockeamos los métodos
 * directos de prisma, le pasamos el mismo objeto prisma como `tx` al
 * callback (los tests no distinguen entre tx-scoped y prisma-scoped).
 */
function mockTransactionRunsCallback() {
  $tx.mockImplementation(async (cb: (tx: typeof prisma) => unknown) => {
    return await cb(prisma);
  });
}

describe("tryAutoMatchBankTransactionToDte", () => {
  it("retorna already_matched si la bank tx ya está MATCHED", async () => {
    mockTransactionRunsCallback();
    (prisma.financeBankTransaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "tx-1",
      bankAccountId: "ba-1",
      transactionDate: new Date("2026-05-15"),
      description: "TRANSFER",
      reference: null,
      amount: dec(1_190_000),
      reconciliationStatus: "MATCHED",
    });

    const r = await tryAutoMatchBankTransactionToDte("tenant-A", "tx-1", "user-A");

    expect(r.matched).toBe(false);
    expect(r.reason).toBe("already_matched");
    expect(prisma.financeDte.findMany).not.toHaveBeenCalled();
  });

  it("retorna no_candidate si la bank tx es egreso y no hay DTE RECEIVED", async () => {
    // Antes el matcher salía temprano con "negative_amount" para egresos.
    // Ahora también busca DTEs RECEIVED (pagos a proveedor). Si no hay
    // candidato, devuelve "no_candidate" — sigue cubriendo la intención
    // original ("egreso sin DTE candidato no se matchea").
    mockTransactionRunsCallback();
    (prisma.financeBankTransaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "tx-1",
      bankAccountId: "ba-1",
      transactionDate: new Date("2026-05-15"),
      description: "PAGO PROVEEDOR",
      reference: null,
      amount: dec(-500_000),
      reconciliationStatus: "UNMATCHED",
    });
    (prisma.financeDte.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const r = await tryAutoMatchBankTransactionToDte("tenant-A", "tx-1", "user-A");

    expect(r.matched).toBe(false);
    expect(r.reason).toBe("no_candidate");
  });

  it("retorna no_candidate si no hay DTE con monto exacto", async () => {
    mockTransactionRunsCallback();
    (prisma.financeBankTransaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "tx-1",
      bankAccountId: "ba-1",
      transactionDate: new Date("2026-05-15"),
      description: "TRANSFER",
      reference: null,
      amount: dec(1_190_000),
      reconciliationStatus: "UNMATCHED",
    });
    (prisma.financeDte.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const r = await tryAutoMatchBankTransactionToDte("tenant-A", "tx-1", "user-A");

    expect(r.matched).toBe(false);
    expect(r.reason).toBe("no_candidate");
  });

  it("matchea con AMOUNT_ONLY cuando hay 1 solo candidato sin RUT en texto", async () => {
    mockTransactionRunsCallback();
    (prisma.financeBankTransaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "tx-1",
      bankAccountId: "ba-1",
      transactionDate: new Date("2026-05-15"),
      description: "TRANSFER",
      reference: null,
      amount: dec(1_190_000),
      reconciliationStatus: "UNMATCHED",
    });
    (prisma.financeDte.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "dte-1",
        receiverRut: "12.345.678-5",
        receiverName: "Empresa XYZ",
        folio: 100,
        date: new Date("2026-05-01"),
        totalAmount: dec(1_190_000),
        amountPaid: dec(0),
      },
    ]);
    (prisma.financePaymentRecord.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (prisma.financePaymentRecord.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "pay-1",
    });
    (prisma.financeReconciliation.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const r = await tryAutoMatchBankTransactionToDte("tenant-A", "tx-1", "user-A");

    expect(r.matched).toBe(true);
    expect(r.dteId).toBe("dte-1");
    expect(r.paymentRecordId).toBe("pay-1");
    expect(r.matchType).toBe("AMOUNT_ONLY");
    expect(prisma.financePaymentAllocation.create).toHaveBeenCalled();
    expect(prisma.financeDte.update).toHaveBeenCalledWith({
      where: { id: "dte-1" },
      data: expect.objectContaining({
        paymentStatus: "PAID",
      }),
    });
  });

  it("matchea con STRICT cuando el RUT está en la descripción", async () => {
    mockTransactionRunsCallback();
    (prisma.financeBankTransaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "tx-1",
      bankAccountId: "ba-1",
      transactionDate: new Date("2026-05-15"),
      description: "TRANSF. 12.345.678-5 EMPRESA XYZ",
      reference: null,
      amount: dec(1_190_000),
      reconciliationStatus: "UNMATCHED",
    });
    (prisma.financeDte.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "dte-1",
        receiverRut: "12.345.678-5",
        receiverName: "Empresa XYZ",
        folio: 100,
        date: new Date("2026-05-01"),
        totalAmount: dec(1_190_000),
        amountPaid: dec(0),
      },
    ]);
    (prisma.financePaymentRecord.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (prisma.financePaymentRecord.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "pay-1",
    });
    (prisma.financeReconciliation.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const r = await tryAutoMatchBankTransactionToDte("tenant-A", "tx-1", "user-A");

    expect(r.matched).toBe(true);
    expect(r.matchType).toBe("STRICT");
  });

  it("desambigua por RUT cuando hay múltiples candidatos con mismo monto", async () => {
    mockTransactionRunsCallback();
    (prisma.financeBankTransaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "tx-1",
      bankAccountId: "ba-1",
      transactionDate: new Date("2026-05-15"),
      description: "PAGO 11.111.111-1 SERVICIO MAYO",
      reference: null,
      amount: dec(1_190_000),
      reconciliationStatus: "UNMATCHED",
    });
    (prisma.financeDte.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "dte-A",
        receiverRut: "11.111.111-1",
        receiverName: "Cliente A",
        folio: 100,
        date: new Date("2026-05-01"),
        totalAmount: dec(1_190_000),
        amountPaid: dec(0),
      },
      {
        id: "dte-B",
        receiverRut: "22.222.222-2",
        receiverName: "Cliente B",
        folio: 200,
        date: new Date("2026-05-10"),
        totalAmount: dec(1_190_000),
        amountPaid: dec(0),
      },
    ]);
    (prisma.financePaymentRecord.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (prisma.financePaymentRecord.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "pay-1",
    });
    (prisma.financeReconciliation.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const r = await tryAutoMatchBankTransactionToDte("tenant-A", "tx-1", "user-A");

    expect(r.matched).toBe(true);
    expect(r.dteId).toBe("dte-A"); // El RUT en la descripción es de A
    expect(r.matchType).toBe("STRICT");
  });

  it("retorna ambiguous cuando 2+ candidatos por monto y ningún RUT detectado", async () => {
    mockTransactionRunsCallback();
    (prisma.financeBankTransaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "tx-1",
      bankAccountId: "ba-1",
      transactionDate: new Date("2026-05-15"),
      description: "TRANSFER GENÉRICA",
      reference: null,
      amount: dec(1_190_000),
      reconciliationStatus: "UNMATCHED",
    });
    (prisma.financeDte.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "dte-A",
        receiverRut: "11.111.111-1",
        receiverName: "Cliente A",
        folio: 100,
        date: new Date("2026-05-01"),
        totalAmount: dec(1_190_000),
        amountPaid: dec(0),
      },
      {
        id: "dte-B",
        receiverRut: "22.222.222-2",
        receiverName: "Cliente B",
        folio: 200,
        date: new Date("2026-05-10"),
        totalAmount: dec(1_190_000),
        amountPaid: dec(0),
      },
    ]);

    const r = await tryAutoMatchBankTransactionToDte("tenant-A", "tx-1", "user-A");

    expect(r.matched).toBe(false);
    expect(r.reason).toBe("ambiguous");
    expect(r.candidateIds).toEqual(["dte-A", "dte-B"]);
    expect(prisma.financePaymentRecord.create).not.toHaveBeenCalled();
  });

  it("ignora bank tx con monto $0 (skipped_test_amount)", async () => {
    mockTransactionRunsCallback();
    (prisma.financeBankTransaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "tx-1",
      bankAccountId: "ba-1",
      transactionDate: new Date("2026-05-15"),
      description: "AJUSTE",
      reference: null,
      amount: dec(0),
      reconciliationStatus: "UNMATCHED",
    });

    const r = await tryAutoMatchBankTransactionToDte("tenant-A", "tx-1", "user-A");

    expect(r.matched).toBe(false);
    expect(r.reason).toBe("skipped_test_amount");
  });

  it("crea match formal en FinanceReconciliation cuando hay período activo", async () => {
    mockTransactionRunsCallback();
    (prisma.financeBankTransaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "tx-1",
      bankAccountId: "ba-1",
      transactionDate: new Date(Date.UTC(2026, 4, 15)),
      description: "TRANSFER",
      reference: null,
      amount: dec(1_190_000),
      reconciliationStatus: "UNMATCHED",
    });
    (prisma.financeDte.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "dte-1",
        receiverRut: "12.345.678-5",
        receiverName: "Empresa",
        folio: 100,
        date: new Date("2026-05-01"),
        totalAmount: dec(1_190_000),
        amountPaid: dec(0),
      },
    ]);
    (prisma.financePaymentRecord.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (prisma.financePaymentRecord.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "pay-1",
    });
    (prisma.financeReconciliation.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "reconc-1",
    });

    await tryAutoMatchBankTransactionToDte("tenant-A", "tx-1", "user-A");

    expect(prisma.financeReconciliationMatch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reconciliationId: "reconc-1",
        bankTransactionId: "tx-1",
        paymentRecordId: "pay-1",
        matchType: "AUTO",
      }),
    });
  });
});
