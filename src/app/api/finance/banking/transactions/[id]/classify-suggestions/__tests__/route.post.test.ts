/**
 * POST /api/finance/banking/transactions/[id]/classify-suggestions
 *
 * Caso repro tesorería (04-ago, −$2M, egreso a socio): usuario elige
 * «Devolución a socios» pero antes persistía/mostraba «Aporte socios»
 * porque solo se guardaba accountPlanId (2.1.01.003 compartido).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  requireAuthMock,
  resolveApiPermsMock,
  hasCapabilityMock,
  reclassifyTransactionToFlowRowMock,
  bankTxFindMany,
  bankTxLinkFindMany,
  flowRowFindFirst,
} = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  resolveApiPermsMock: vi.fn(),
  hasCapabilityMock: vi.fn(),
  reclassifyTransactionToFlowRowMock: vi.fn(),
  bankTxFindMany: vi.fn(),
  bankTxLinkFindMany: vi.fn(),
  flowRowFindFirst: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/api-auth", () => ({
  requireAuth: requireAuthMock,
  resolveApiPerms: resolveApiPermsMock,
  unauthorized: () =>
    new Response(JSON.stringify({ success: false, error: "No autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    }),
}));

vi.mock("@/lib/permissions", () => ({
  hasCapability: hasCapabilityMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeBankTransaction: { findMany: bankTxFindMany },
    financeBankTransactionLink: { findMany: bankTxLinkFindMany },
    financeFlowRow: { findFirst: flowRowFindFirst },
  },
}));

vi.mock("@/modules/finance/banking/flow-row-account-plan.service", () => ({
  resolveAccountPlanIdForFlowRow: vi.fn(async () => "plan-acreedores-003"),
}));

vi.mock("@/modules/finance/banking/bank-tx-link.service", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/modules/finance/banking/bank-tx-link.service")
    >();
  return {
    ...actual,
    reclassifyTransactionToFlowRow: reclassifyTransactionToFlowRowMock,
  };
});

vi.mock("@/modules/finance/banking/automatch-rule.service", () => ({
  findMatchingRule: vi.fn(),
  flowRowSuggestionFromEvaluation: vi.fn(),
  isFlowRowAction: vi.fn(),
  upsertFlowRowRuleForDescription: vi.fn(),
  upsertFlowRowRuleForRut: vi.fn(),
}));

vi.mock("@/modules/finance/banking/flow-classify.service", () => ({
  normalizeClassifyRut: vi.fn(),
  rankClassifySuggestions: vi.fn(),
  isTgrRut: vi.fn(),
}));

vi.mock("@/modules/finance/banking/rut-extract", () => ({
  extractCanonicalRutFromBankText: vi.fn(),
}));

vi.mock("@/modules/finance/banking/rut-recognition.service", () => ({
  recognizeRutsForTransactions: vi.fn(),
}));

vi.mock("@/modules/finance/banking/payroll-candidates.service", () => ({
  loadPayrollCandidates: vi.fn(),
}));

vi.mock("@/modules/finance/banking/cost-allocation.service", () => ({
  inferCostCenterFromClassifySource: vi.fn(async () => null),
}));

vi.mock("@/modules/finance/banking/classify-flow-rows", () => ({
  resolvePayrollFlowRows: vi.fn(),
  resolveSupplierCategoryRow: vi.fn(),
}));

import { POST } from "../route";

const TX_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ROW_APORTE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ROW_DEVOL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TENANT = "tenant-gard";
const USER = "user-1";

function makePost(body: unknown) {
  return POST(
    new Request("http://x/api/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: TX_ID }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthMock.mockResolvedValue({
    tenantId: TENANT,
    userId: USER,
  });
  resolveApiPermsMock.mockResolvedValue({});
  hasCapabilityMock.mockReturnValue(true);
  bankTxFindMany.mockResolvedValue([
    {
      id: TX_ID,
      amount: -2_000_000,
      description: "12.345.678-9 CARLOS IRIGOYEN EJEMPLO",
      reference: null,
    },
  ]);
  bankTxLinkFindMany.mockResolvedValue([]);
  flowRowFindFirst.mockImplementation(async (args: {
    where: { id: string };
  }) => {
    if (args.where.id === ROW_DEVOL) {
      return {
        id: ROW_DEVOL,
        name: "Devolución a socios",
        section: "FINANCIAMIENTO",
        categoryId: "cat-devol",
      };
    }
    if (args.where.id === ROW_APORTE) {
      return {
        id: ROW_APORTE,
        name: "Aporte socios",
        section: "FINANCIAMIENTO",
        categoryId: "cat-aporte",
      };
    }
    return null;
  });
  reclassifyTransactionToFlowRowMock.mockResolvedValue({
    linkIds: ["link-created"],
    mode: "created",
  });
});

describe("POST classify-suggestions — flowRowId estable (repro Carlos Irigoyen)", () => {
  it("persiste flowRowId de Devolución aunque accountPlanId sea Acreedores Varios compartido", async () => {
    const res = await makePost({
      kind: "FLOW_ROW",
      flowRowId: ROW_DEVOL,
      learnRule: "NONE",
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.flowRowId).toBe(ROW_DEVOL);

    expect(reclassifyTransactionToFlowRowMock).toHaveBeenCalledTimes(1);
    const [, txId, userId, input] = reclassifyTransactionToFlowRowMock.mock
      .calls[0] as [
      string,
      string,
      string,
      {
        flowRowId?: string;
        accountPlanId?: string;
        note?: string;
        targetType?: string;
      },
    ];
    expect(txId).toBe(TX_ID);
    expect(userId).toBe(USER);
    expect(input.flowRowId).toBe(ROW_DEVOL);
    expect(input.flowRowId).not.toBe(ROW_APORTE);
    expect(input.accountPlanId).toBe("plan-acreedores-003");
    expect(input.note).toContain("Devolución a socios");
    expect(input.targetType).toBe("EXPENSE");
  });

  it("re-clasifica MATCHED con link EXPENSE previo (update in-place, flowRowId Devolución)", async () => {
    const EXISTING_LINK_ID = "0aa1bdd8-2fa0-4dcb-80b6-0005faa4c33c";
    bankTxLinkFindMany.mockResolvedValue([
      {
        bankTransactionId: TX_ID,
        targetType: "EXPENSE",
      },
    ]);
    reclassifyTransactionToFlowRowMock.mockResolvedValueOnce({
      linkIds: [EXISTING_LINK_ID],
      mode: "updated",
    });

    const res = await makePost({
      kind: "FLOW_ROW",
      flowRowId: ROW_DEVOL,
      learnRule: "NONE",
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.classified).toBe(1);

    expect(reclassifyTransactionToFlowRowMock).toHaveBeenCalledWith(
      TENANT,
      TX_ID,
      USER,
      expect.objectContaining({
        flowRowId: ROW_DEVOL,
        accountPlanId: "plan-acreedores-003",
        targetType: "EXPENSE",
      }),
    );
    const result = await reclassifyTransactionToFlowRowMock.mock.results[0]?.value;
    expect(result.linkIds).toEqual([EXISTING_LINK_ID]);
    expect(result.mode).toBe("updated");
  });

  it("rechaza re-clasificar si el vínculo previo es DTE (no desconciliar)", async () => {
    bankTxLinkFindMany.mockResolvedValue([
      {
        bankTransactionId: TX_ID,
        targetType: "DTE_RECEIVED",
      },
    ]);

    const res = await makePost({
      kind: "FLOW_ROW",
      flowRowId: ROW_DEVOL,
      learnRule: "NONE",
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.classified).toBe(0);
    expect(json.data.failed).toBe(1);
    expect(json.data.errors[0]?.message).toMatch(/no se sobrescribe/i);
    expect(reclassifyTransactionToFlowRowMock).not.toHaveBeenCalled();
  });

  it("rechaza flowRowId inválido (no UUID) antes de persistir", async () => {
    const res = await makePost({
      kind: "FLOW_ROW",
      flowRowId: "devolucion-a-socios-label",
      learnRule: "NONE",
    });
    expect(res.status).toBe(400);
    expect(reclassifyTransactionToFlowRowMock).not.toHaveBeenCalled();
  });

  it("acepta clasificar sin costCenter (retrocompatibilidad)", async () => {
    const res = await makePost({
      kind: "FLOW_ROW",
      flowRowId: ROW_DEVOL,
      learnRule: "NONE",
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.classified).toBe(1);
    expect(reclassifyTransactionToFlowRowMock).toHaveBeenCalledWith(
      TENANT,
      TX_ID,
      USER,
      expect.objectContaining({
        flowRowId: ROW_DEVOL,
        costCenter: undefined,
      }),
    );
  });

  it("rechaza SPLIT MANUAL que no cuadra con el monto", async () => {
    const res = await makePost({
      kind: "FLOW_ROW",
      flowRowId: ROW_DEVOL,
      learnRule: "NONE",
      costCenter: {
        mode: "SPLIT",
        driver: "MANUAL",
        installations: [
          {
            installationId: "11111111-1111-4111-8111-111111111111",
            amount: 100,
          },
        ],
      },
    });
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.classified).toBe(0);
    expect(json.data.failed).toBe(1);
    expect(json.data.errors[0]?.message).toMatch(/no cuadra/i);
    expect(reclassifyTransactionToFlowRowMock).not.toHaveBeenCalled();
  });

  it("rechaza cuando el servicio detecta instalación de otro tenant", async () => {
    reclassifyTransactionToFlowRowMock.mockRejectedValueOnce(
      new Error(
        "Una o más instalaciones no existen o no pertenecen a la empresa",
      ),
    );
    const res = await makePost({
      kind: "FLOW_ROW",
      flowRowId: ROW_DEVOL,
      learnRule: "NONE",
      costCenter: {
        mode: "SINGLE",
        installationId: "11111111-1111-4111-8111-111111111111",
      },
    });
    const json = await res.json();
    expect(json.data.classified).toBe(0);
    expect(json.data.failed).toBe(1);
    expect(json.data.errors[0]?.message).toMatch(/no pertenecen/i);
  });
});
