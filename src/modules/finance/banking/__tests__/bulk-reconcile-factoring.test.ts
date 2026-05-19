/**
 * Tests del refactor de `bulkReconcileToDtes` que admite allocations
 * factoring además de DTE.
 *
 * Foco: validación de inputs y comportamiento de allocations factoring
 * (link FACTORING_OPERATION + update FactoringOperation; sin
 * PaymentAllocation). Los paths de DTE puros no se re-testean acá —
 * quedan cubiertos por el path real cuando el lote es 100% DTE.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => {
  const $transaction = vi.fn();
  const financeBankTransaction = {
    findMany: vi.fn(),
    update: vi.fn(),
  };
  const financeDte = {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  };
  const financeAccountPlan = { findFirst: vi.fn() };
  const financeDteLine = { findMany: vi.fn() };
  const financeFactoringOperation = {
    findMany: vi.fn(),
    update: vi.fn(),
  };
  const financePaymentRecord = { count: vi.fn(), create: vi.fn() };
  const financePaymentAllocation = {
    create: vi.fn(),
    aggregate: vi.fn(),
  };
  const financeBankTransactionLink = {
    create: vi.fn(),
    findFirst: vi.fn(),
  };
  const financeBankAccount = { findFirst: vi.fn(), findUnique: vi.fn() };
  const financeCashflowOccurrence = {
    findFirst: vi.fn(),
    update: vi.fn(),
  };
  return {
    prisma: {
      $transaction,
      financeBankTransaction,
      financeDte,
      financeAccountPlan,
      financeDteLine,
      financeFactoringOperation,
      financePaymentRecord,
      financePaymentAllocation,
      financeBankTransactionLink,
      financeBankAccount,
      financeCashflowOccurrence,
    },
  };
});

import { prisma } from "@/lib/prisma";
import { bulkReconcileToDtes } from "../bank-tx-link.service";

const $tx = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;

function dec(n: number) {
  return {
    toNumber: () => n,
    abs: () => dec(Math.abs(n)),
  };
}

function mockTransactionRunsCallback() {
  $tx.mockImplementation(
    async (cb: (txClient: typeof prisma) => unknown) => cb(prisma),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("bulkReconcileToDtes — validación XOR de allocations", () => {
  it("rechaza allocation con dteId y factoringOperationId presentes", async () => {
    await expect(
      bulkReconcileToDtes("tenant-A", "user-A", {
        bankTransactionIds: ["00000000-0000-0000-0000-000000000001"],
        allocations: [
          {
            dteId: "00000000-0000-0000-0000-00000000000a",
            factoringOperationId: "00000000-0000-0000-0000-00000000000b",
            amount: 1000,
          },
        ],
      }),
    ).rejects.toThrow(/dteId o factoringOperationId/);
  });

  it("rechaza allocation sin dteId ni factoringOperationId", async () => {
    // El servicio valida XOR antes de hacer findMany — primero levanta tx,
    // así que mockeamos al menos eso para que llegue a la validación XOR.
    (prisma.financeBankTransaction.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValue([
        {
          id: "00000000-0000-0000-0000-000000000001",
          amount: dec(1000),
          bankAccountId: "ba-1",
          transactionDate: new Date(),
          description: "TRANSF",
          reference: null,
          reconciliationStatus: "UNMATCHED",
        },
      ]);
    await expect(
      bulkReconcileToDtes("tenant-A", "user-A", {
        bankTransactionIds: ["00000000-0000-0000-0000-000000000001"],
        allocations: [{ amount: 1000 }],
      }),
    ).rejects.toThrow(/dteId o factoringOperationId/);
  });

  it("rechaza factoring allocations contra egresos bancarios", async () => {
    (prisma.financeBankTransaction.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValue([
        {
          id: "00000000-0000-0000-0000-000000000001",
          amount: dec(-1000),
          bankAccountId: "ba-1",
          transactionDate: new Date(),
          description: "PAGO PROV",
          reference: null,
          reconciliationStatus: "UNMATCHED",
        },
      ]);
    await expect(
      bulkReconcileToDtes("tenant-A", "user-A", {
        bankTransactionIds: ["00000000-0000-0000-0000-000000000001"],
        allocations: [
          {
            factoringOperationId: "00000000-0000-0000-0000-00000000000b",
            amount: 1000,
          },
        ],
      }),
    ).rejects.toThrow(/factoring sólo se concilian contra ingresos/i);
  });

  it("rechaza cesiones CANCELLED o CLOSED", async () => {
    (prisma.financeBankTransaction.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValue([
        {
          id: "00000000-0000-0000-0000-000000000001",
          amount: dec(1000),
          bankAccountId: "ba-1",
          transactionDate: new Date(),
          description: "TRANSF FACTORING",
          reference: null,
          reconciliationStatus: "UNMATCHED",
        },
      ]);
    (prisma.financeFactoringOperation.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValue([
        {
          id: "00000000-0000-0000-0000-00000000000b",
          status: "CANCELLED",
          dteId: "00000000-0000-0000-0000-00000000000c",
          invoiceAmount: dec(1200),
        },
      ]);
    await expect(
      bulkReconcileToDtes("tenant-A", "user-A", {
        bankTransactionIds: ["00000000-0000-0000-0000-000000000001"],
        allocations: [
          {
            factoringOperationId: "00000000-0000-0000-0000-00000000000b",
            amount: 1000,
          },
        ],
      }),
    ).rejects.toThrow(/CANCELLED/);
  });
});

describe("bulkReconcileToDtes — happy path factoring", () => {
  /**
   * Verifica el invariante crítico: cuando hay allocations factoring,
   *   1. NO se crea `FinancePaymentAllocation` (el módulo factoring no
   *      trackea pagos por suma de allocations).
   *   2. SÍ se crea `FinanceBankTransactionLink` con
   *      `targetType: FACTORING_OPERATION` y el id de la cesión.
   *   3. `FinanceFactoringOperation` se actualiza con `fundedAt` y, si
   *      estaba en APPROVED, transiciona a FUNDED.
   */
  it("crea Link FACTORING_OPERATION + actualiza fundedAt + status APPROVED→FUNDED", async () => {
    mockTransactionRunsCallback();
    (prisma.financeBankTransaction.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValue([
        {
          id: "00000000-0000-0000-0000-000000000001",
          amount: dec(5_130_669),
          bankAccountId: "ba-1",
          transactionDate: new Date("2026-05-12"),
          description: "TRANSF CAPITAL EXPRESS",
          reference: "001600139",
          reconciliationStatus: "UNMATCHED",
        },
      ]);
    (prisma.financeFactoringOperation.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValue([
        {
          id: "00000000-0000-0000-0000-00000000000b",
          status: "APPROVED",
          dteId: "00000000-0000-0000-0000-00000000000c",
          invoiceAmount: dec(6_000_000),
        },
      ]);
    (prisma.financePaymentRecord.count as ReturnType<typeof vi.fn>)
      .mockResolvedValue(0);
    (prisma.financePaymentRecord.create as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ id: "pr-1", code: "COB-000001" });

    await bulkReconcileToDtes("tenant-A", "user-A", {
      bankTransactionIds: ["00000000-0000-0000-0000-000000000001"],
      allocations: [
        {
          factoringOperationId: "00000000-0000-0000-0000-00000000000b",
          amount: 5_130_669,
        },
      ],
    });

    // 1) No se crea PaymentAllocation para factoring.
    expect(prisma.financePaymentAllocation.create).not.toHaveBeenCalled();

    // 2) Sí se crea Link FACTORING_OPERATION contra la cesión.
    expect(prisma.financeBankTransactionLink.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetType: "FACTORING_OPERATION",
          targetId: "00000000-0000-0000-0000-00000000000b",
        }),
      }),
    );

    // 3) FactoringOperation: fundedAt + status = FUNDED (venía APPROVED).
    expect(prisma.financeFactoringOperation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "00000000-0000-0000-0000-00000000000b" },
        data: expect.objectContaining({
          fundedAt: expect.any(Date),
          status: "FUNDED",
        }),
      }),
    );
  });

  it("setea fundedAt sin tocar status cuando la cesión NO está en APPROVED", async () => {
    mockTransactionRunsCallback();
    (prisma.financeBankTransaction.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValue([
        {
          id: "00000000-0000-0000-0000-000000000001",
          amount: dec(5_130_669),
          bankAccountId: "ba-1",
          transactionDate: new Date("2026-05-12"),
          description: "TRANSF FACTORING",
          reference: null,
          reconciliationStatus: "UNMATCHED",
        },
      ]);
    (prisma.financeFactoringOperation.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValue([
        {
          id: "00000000-0000-0000-0000-00000000000b",
          status: "SIMULATED",
          dteId: "00000000-0000-0000-0000-00000000000c",
          invoiceAmount: dec(6_000_000),
        },
      ]);
    (prisma.financePaymentRecord.count as ReturnType<typeof vi.fn>)
      .mockResolvedValue(0);
    (prisma.financePaymentRecord.create as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ id: "pr-1", code: "COB-000001" });

    await bulkReconcileToDtes("tenant-A", "user-A", {
      bankTransactionIds: ["00000000-0000-0000-0000-000000000001"],
      allocations: [
        {
          factoringOperationId: "00000000-0000-0000-0000-00000000000b",
          amount: 5_130_669,
        },
      ],
    });

    const updateCall = (
      prisma.financeFactoringOperation.update as ReturnType<typeof vi.fn>
    ).mock.calls[0]?.[0];
    expect(updateCall.data.fundedAt).toBeInstanceOf(Date);
    // No incluye `status` cuando no era APPROVED — mantiene SIMULATED.
    expect(updateCall.data.status).toBeUndefined();
  });
});
