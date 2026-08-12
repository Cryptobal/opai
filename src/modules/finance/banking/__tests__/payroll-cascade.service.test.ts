import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => {
  const financeBankTransaction = {
    findMany: vi.fn(),
    update: vi.fn(),
  };
  const financeBankTransactionLink = { create: vi.fn() };
  const financeCashflowConfig = { findUnique: vi.fn() };
  const financeFlowRow = { findFirst: vi.fn() };
  const payrollLiquidacion = { update: vi.fn() };
  const payrollAnticipoItem = { update: vi.fn() };
  const $transaction = vi.fn(async (ops: unknown) => {
    if (Array.isArray(ops)) return Promise.all(ops);
    return ops;
  });
  return {
    prisma: {
      financeBankTransaction,
      financeBankTransactionLink,
      financeCashflowConfig,
      financeFlowRow,
      payrollLiquidacion,
      payrollAnticipoItem,
      $transaction,
    },
  };
});

vi.mock("../rut-recognition.service", () => ({
  recognizeRutsForTransactions: vi.fn(),
}));
vi.mock("../payroll-candidates.service", () => ({
  loadPayrollCandidates: vi.fn(),
}));
vi.mock("../classify-flow-rows", () => ({
  resolvePayrollFlowRows: vi.fn(),
}));
vi.mock("../flow-row-account-plan.service", () => ({
  resolveAccountPlanIdForFlowRow: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { recognizeRutsForTransactions } from "../rut-recognition.service";
import { loadPayrollCandidates } from "../payroll-candidates.service";
import { resolvePayrollFlowRows } from "../classify-flow-rows";
import { resolveAccountPlanIdForFlowRow } from "../flow-row-account-plan.service";
import { tryPayrollCascade } from "../payroll-cascade.service";

const TENANT = "t1";
const USER = "u1";
const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  asMock(prisma.financeCashflowConfig.findUnique).mockResolvedValue({
    matchAmountToleranceClp: 1000,
  });
  asMock(resolvePayrollFlowRows).mockResolvedValue({
    liquidacionRow: { flowRowId: "row-sueldo", label: "Sueldos" },
    anticipoRow: { flowRowId: "row-ant", label: "Quincena" },
    finiquitoRow: { flowRowId: "row-fin", label: "Finiquitos" },
    teRow: { flowRowId: "row-te", label: "Turnos extra" },
    retiroSocioRow: { flowRowId: "row-retiro", label: "Retiro socios" },
    devolPrestamoSocioRow: {
      flowRowId: "row-devol",
      label: "Devolución a socios",
    },
  });
  asMock(prisma.financeFlowRow.findFirst).mockImplementation(
    async ({ where }: { where: { id: string } }) => ({
      id: where.id,
      categoryId: `cat-${where.id}`,
    }),
  );
  asMock(resolveAccountPlanIdForFlowRow).mockResolvedValue("ap-1");
  asMock(prisma.financeBankTransactionLink.create).mockResolvedValue({});
  asMock(prisma.financeBankTransaction.update).mockResolvedValue({});
  asMock(prisma.payrollLiquidacion.update).mockResolvedValue({});
  asMock(prisma.payrollAnticipoItem.update).mockResolvedValue({});
});

function decimal(n: number) {
  return { toNumber: () => n };
}

describe("tryPayrollCascade", () => {
  it("concilia liquidación que calza (PAYROLL)", async () => {
    asMock(prisma.financeBankTransaction.findMany).mockResolvedValue([
      {
        id: "tx1",
        amount: decimal(-590000),
        description: "0055294666 Transf",
        reference: null,
      },
    ]);
    asMock(recognizeRutsForTransactions).mockResolvedValue(
      new Map([
        [
          "tx1",
          {
            rut: "55294666",
            kind: "guardia",
            entityId: "g1",
            entityName: "Carlos",
            guardiaState: null,
            alsoRegisteredAs: [],
          },
        ],
      ]),
    );
    asMock(loadPayrollCandidates).mockResolvedValue(
      new Map([
        [
          "g1",
          [
            {
              kind: "LIQUIDACION",
              guardiaId: "g1",
              amount: 590000,
              label: "Liquidación jul-26",
              refId: "liq1",
            },
          ],
        ],
      ]),
    );

    const r = await tryPayrollCascade(TENANT, ["tx1"], USER);
    expect(r.payrollMatched).toBe(1);
    expect(r.finiquitoMatched).toBe(0);
    expect(r.inferredSuggested).toBe(0);
    expect(prisma.financeBankTransactionLink.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        targetType: "PAYROLL_LIQUIDACION",
        targetId: "liq1",
        matchSource: "PAYROLL",
      }),
    });
  });

  it("concilia anticipo que calza (PAYROLL)", async () => {
    asMock(prisma.financeBankTransaction.findMany).mockResolvedValue([
      {
        id: "tx2",
        amount: decimal(-200000),
        description: "Pago",
        reference: null,
      },
    ]);
    asMock(recognizeRutsForTransactions).mockResolvedValue(
      new Map([
        [
          "tx2",
          {
            rut: "x",
            kind: "guardia",
            entityId: "g1",
            entityName: "A",
            guardiaState: null,
            alsoRegisteredAs: [],
          },
        ],
      ]),
    );
    asMock(loadPayrollCandidates).mockResolvedValue(
      new Map([
        [
          "g1",
          [
            {
              kind: "ANTICIPO",
              guardiaId: "g1",
              amount: 200000,
              label: "Anticipo jul-26",
              refId: "ant1",
            },
          ],
        ],
      ]),
    );

    const r = await tryPayrollCascade(TENANT, ["tx2"], USER);
    expect(r.payrollMatched).toBe(1);
    expect(prisma.payrollAnticipoItem.update).toHaveBeenCalledWith({
      where: { id: "ant1" },
      data: expect.objectContaining({ status: "PAID" }),
    });
  });

  it("concilia finiquito que calza (FINIQUITO)", async () => {
    asMock(prisma.financeBankTransaction.findMany).mockResolvedValue([
      {
        id: "tx3",
        amount: decimal(-1_500_000),
        description: "Fin",
        reference: null,
      },
    ]);
    asMock(recognizeRutsForTransactions).mockResolvedValue(
      new Map([
        [
          "tx3",
          {
            rut: "x",
            kind: "guardia",
            entityId: "g1",
            entityName: "A",
            guardiaState: null,
            alsoRegisteredAs: [],
          },
        ],
      ]),
    );
    asMock(loadPayrollCandidates).mockResolvedValue(
      new Map([
        [
          "g1",
          [
            {
              kind: "FINIQUITO",
              guardiaId: "g1",
              amount: 1_500_000,
              label: "Finiquito 01/07/26",
              refId: "fin1",
            },
          ],
        ],
      ]),
    );

    const r = await tryPayrollCascade(TENANT, ["tx3"], USER);
    expect(r.finiquitoMatched).toBe(1);
    expect(prisma.financeBankTransactionLink.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ matchSource: "FINIQUITO" }),
    });
  });

  it("guardia habilitado TE sin calce queda por autorizar con cuenta TE", async () => {
    asMock(prisma.financeBankTransaction.findMany).mockResolvedValue([
      {
        id: "tx4",
        amount: decimal(-50000),
        description: "Extra",
        reference: null,
      },
    ]);
    asMock(recognizeRutsForTransactions).mockResolvedValue(
      new Map([
        [
          "tx4",
          {
            rut: "x",
            kind: "guardia",
            entityId: "g1",
            entityName: "A",
            guardiaState: {
              status: "active",
              lifecycleStatus: "contratado",
              terminatedAt: null,
              installationName: "Site A",
              availableExtraShifts: true,
            },
            alsoRegisteredAs: [],
          },
        ],
      ]),
    );
    asMock(loadPayrollCandidates).mockResolvedValue(new Map([["g1", []]]));

    const r = await tryPayrollCascade(TENANT, ["tx4"], USER);
    expect(r.inferredSuggested).toBe(1);
    expect(r.payrollMatched).toBe(0);
    expect(prisma.financeBankTransactionLink.create).not.toHaveBeenCalled();
    expect(prisma.financeBankTransaction.update).toHaveBeenCalledWith({
      where: { id: "tx4" },
      data: { suggestedAccountPlanId: "ap-1" },
    });
  });

  it("guardia TE deshabilitado no infiere cuenta (sin TE ni retiro)", async () => {
    asMock(prisma.financeBankTransaction.findMany).mockResolvedValue([
      {
        id: "tx6",
        amount: decimal(-2_000_000),
        description: "Retiro",
        reference: null,
      },
    ]);
    asMock(recognizeRutsForTransactions).mockResolvedValue(
      new Map([
        [
          "tx6",
          {
            rut: "55294666",
            kind: "guardia",
            entityId: "g-socio",
            entityName: "Socio",
            guardiaState: {
              status: "active",
              lifecycleStatus: "contratado",
              terminatedAt: null,
              installationName: null,
              availableExtraShifts: false,
            },
            alsoRegisteredAs: [],
          },
        ],
      ]),
    );
    asMock(loadPayrollCandidates).mockResolvedValue(new Map([["g-socio", []]]));

    const r = await tryPayrollCascade(TENANT, ["tx6"], USER);
    expect(r.inferredSuggested).toBe(0);
    expect(prisma.financeBankTransaction.update).not.toHaveBeenCalled();
  });

  it("RUT sin identidad de guardia: sin cambio", async () => {
    asMock(prisma.financeBankTransaction.findMany).mockResolvedValue([
      {
        id: "tx5",
        amount: decimal(-100000),
        description: "Empresa",
        reference: null,
      },
    ]);
    asMock(recognizeRutsForTransactions).mockResolvedValue(
      new Map([
        [
          "tx5",
          {
            rut: "760835072",
            kind: "supplier",
            entityId: "s1",
            entityName: "Prov",
            guardiaState: null,
            alsoRegisteredAs: [],
          },
        ],
      ]),
    );
    asMock(loadPayrollCandidates).mockResolvedValue(new Map());

    const r = await tryPayrollCascade(TENANT, ["tx5"], USER);
    expect(r).toEqual({
      payrollMatched: 0,
      finiquitoMatched: 0,
      inferredSuggested: 0,
      errors: [],
    });
    expect(prisma.financeBankTransaction.update).not.toHaveBeenCalled();
    expect(prisma.financeBankTransactionLink.create).not.toHaveBeenCalled();
  });
});
