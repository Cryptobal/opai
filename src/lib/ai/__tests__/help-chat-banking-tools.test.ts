import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  mapBankStatusToTab,
  mapDirection,
  resolveBankAccountId,
  resolveFlowRow,
  bankingReadToolDefinitions,
  bankingWriteToolDefinitions,
  BANKING_PREVIEW_TO_CONFIRM,
  toolPreviewClassifyBankToFlowRow,
  toolClassifyBankToFlowRow,
  toolPreviewAuthorizeBankMovements,
} from "@/lib/ai/help-chat-banking-tools";
import {
  getToolDefinitionsV2,
  PREVIEW_TO_CONFIRM,
  WRITE_TOOL_NAMES,
} from "@/lib/ai/help-chat-tools-v2";
import type { RolePermissions } from "@/lib/permissions";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeBankAccount: { findMany: vi.fn() },
    financeFlowRow: { findFirst: vi.fn(), findMany: vi.fn() },
    financeBankTransaction: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    financeBankTransactionLink: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    financeAccountPlan: { findFirst: vi.fn(), findMany: vi.fn() },
    financeAutoMatchRule: { findMany: vi.fn(), findFirst: vi.fn() },
    financePaymentRecord: { findFirst: vi.fn() },
    aiActionLog: { create: vi.fn() },
  },
}));

vi.mock("@/modules/finance/banking/bank-account.service", () => ({
  listBankAccounts: vi.fn(),
}));

vi.mock("@/modules/finance/banking/bank-transaction.service", () => ({
  listBankTransactions: vi.fn(),
}));

vi.mock("@/modules/finance/banking/bank-tx-link.service", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/modules/finance/banking/bank-tx-link.service")
    >();
  return {
    ...actual,
    listTransactionLinks: vi.fn(),
    confirmAllSuggestions: vi.fn(),
    setTransactionLinks: vi.fn(),
  };
});

vi.mock("@/modules/finance/banking/flow-row-account-plan.service", () => ({
  resolveAccountPlanIdForFlowRow: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { listBankAccounts } from "@/modules/finance/banking/bank-account.service";
import { setTransactionLinks } from "@/modules/finance/banking/bank-tx-link.service";
import { resolveAccountPlanIdForFlowRow } from "@/modules/finance/banking/flow-row-account-plan.service";

const permsFull = {
  modules: {},
  capabilities: {
    banking_view: true,
    banking_manage: true,
    cashflow_view: true,
  },
} as unknown as RolePermissions;

const permsViewOnly = {
  modules: {},
  capabilities: { banking_view: true },
} as unknown as RolePermissions;

describe("mapBankStatusToTab / mapDirection", () => {
  it("mapea status MCP → tabs de cartola", () => {
    expect(mapBankStatusToTab("unmatched")).toBe("unrecognized");
    expect(mapBankStatusToTab("pending_authorize")).toBe("recognized");
    expect(mapBankStatusToTab("reconciled")).toBe("matched");
    expect(mapBankStatusToTab("all")).toBe("all");
    expect(mapBankStatusToTab(undefined)).toBe("all");
  });

  it("mapea dirección ES/EN", () => {
    expect(mapDirection("ingreso")).toBe("inflow");
    expect(mapDirection("egreso")).toBe("outflow");
    expect(mapDirection("inflow")).toBe("inflow");
    expect(mapDirection(undefined)).toBe("all");
  });
});

describe("tool wiring", () => {
  it("expone tools de banca en getToolDefinitionsV2", () => {
    const defs = getToolDefinitionsV2(true, true);
    const names = new Set(defs.map((d) => d.function.name));
    expect(names.has("list_bank_movements")).toBe(true);
    expect(names.has("get_bank_movement")).toBe(true);
    expect(names.has("get_bank_triage_summary")).toBe(true);
    expect(names.has("list_flow_rows")).toBe(true);
    expect(names.has("preview_classify_bank_to_flow_row")).toBe(true);
    expect(names.has("classify_bank_to_flow_row")).toBe(true);
    expect(names.has("preview_authorize_bank_movements")).toBe(true);
    expect(names.has("authorize_bank_movements")).toBe(true);
  });

  it("mapea preview → confirm y marca writes", () => {
    expect(PREVIEW_TO_CONFIRM.preview_classify_bank_to_flow_row?.confirmToolName).toBe(
      "classify_bank_to_flow_row",
    );
    expect(PREVIEW_TO_CONFIRM.preview_authorize_bank_movements?.confirmToolName).toBe(
      "authorize_bank_movements",
    );
    expect(BANKING_PREVIEW_TO_CONFIRM.preview_classify_bank_to_flow_row.confirmToolName).toBe(
      "classify_bank_to_flow_row",
    );
    expect(WRITE_TOOL_NAMES.has("classify_bank_to_flow_row")).toBe(true);
    expect(WRITE_TOOL_NAMES.has("authorize_bank_movements")).toBe(true);
    expect(WRITE_TOOL_NAMES.has("preview_classify_bank_to_flow_row")).toBe(false);
    expect(WRITE_TOOL_NAMES.has("list_bank_movements")).toBe(false);
  });

  it("definiciones locales tienen nombres esperados", () => {
    expect(bankingReadToolDefinitions().map((d) => d.function.name)).toEqual([
      "list_bank_movements",
      "get_bank_movement",
      "get_bank_triage_summary",
      "list_flow_rows",
    ]);
    expect(bankingWriteToolDefinitions().map((d) => d.function.name)).toEqual([
      "preview_classify_bank_to_flow_row",
      "classify_bank_to_flow_row",
      "preview_authorize_bank_movements",
      "authorize_bank_movements",
    ]);
  });

  it("descriptions están en español", () => {
    for (const d of [
      ...bankingReadToolDefinitions(),
      ...bankingWriteToolDefinitions(),
    ]) {
      expect(d.function.description.length).toBeGreaterThan(20);
      expect(d.function.description).toMatch(/[áéíóúñÁÉÍÓÚÑ]|movimiento|fila|autoriz|cartola|flujo/i);
    }
  });
});

describe("resolveBankAccountId", () => {
  beforeEach(() => {
    vi.mocked(listBankAccounts).mockReset();
  });

  it("resuelve por nombre parcial único", async () => {
    vi.mocked(listBankAccounts).mockResolvedValue([
      {
        id: "acc-1",
        bankName: "Banco Santander",
        accountNumber: "123",
      },
      {
        id: "acc-2",
        bankName: "Banco de Chile",
        accountNumber: "456",
      },
    ] as never);

    const r = await resolveBankAccountId("t1", null, "Santander");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.account.id).toBe("acc-1");
  });

  it("pide accountId si hay ambigüedad", async () => {
    vi.mocked(listBankAccounts).mockResolvedValue([
      { id: "a", bankName: "Banco A", accountNumber: "1" },
      { id: "b", bankName: "Banco B", accountNumber: "2" },
    ] as never);
    const r = await resolveBankAccountId("t1", null, null);
    expect(r.ok).toBe(false);
  });
});

describe("resolveFlowRow", () => {
  beforeEach(() => {
    vi.mocked(prisma.financeFlowRow.findFirst).mockReset();
    vi.mocked(prisma.financeFlowRow.findMany).mockReset();
  });

  it("resuelve por etiqueta SECCIÓN · Nombre", async () => {
    vi.mocked(prisma.financeFlowRow.findMany).mockResolvedValue([
      {
        id: "row-retiro",
        name: "Retiro socios",
        section: "FINANCIAMIENTO",
        categoryId: "cat-1",
      },
      {
        id: "row-devol",
        name: "Devolución a socios",
        section: "FINANCIAMIENTO",
        categoryId: "cat-1",
      },
    ] as never);

    const r = await resolveFlowRow("t1", null, "FINANCIAMIENTO · Retiro socios");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.row.id).toBe("row-retiro");
      expect(r.row.label).toContain("Retiro socios");
    }
  });

  it("no confunde filas que comparten cuenta solo por nombre parcial ambiguo", async () => {
    vi.mocked(prisma.financeFlowRow.findMany).mockResolvedValue([
      {
        id: "row-retiro",
        name: "Retiro socios",
        section: "FINANCIAMIENTO",
        categoryId: "cat-1",
      },
      {
        id: "row-devol",
        name: "Devolución a socios",
        section: "FINANCIAMIENTO",
        categoryId: "cat-1",
      },
    ] as never);

    const r = await resolveFlowRow("t1", null, "socios");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.candidates?.length).toBeGreaterThan(1);
  });
});

describe("preview + classify flow row", () => {
  beforeEach(() => {
    vi.mocked(prisma.financeFlowRow.findFirst).mockReset();
    vi.mocked(prisma.financeFlowRow.findMany).mockReset();
    vi.mocked(prisma.financeBankTransaction.findFirst).mockReset();
    vi.mocked(prisma.financeBankTransactionLink.count).mockReset();
    vi.mocked(prisma.financeBankTransactionLink.findMany).mockReset();
    vi.mocked(prisma.financeBankTransactionLink.findFirst).mockReset();
    vi.mocked(prisma.financeAccountPlan.findFirst).mockReset();
    vi.mocked(prisma.aiActionLog.create).mockResolvedValue({} as never);
    vi.mocked(resolveAccountPlanIdForFlowRow).mockReset();
    vi.mocked(setTransactionLinks).mockReset();
  });

  it("deniega sin banking_manage", async () => {
    const r = await toolPreviewClassifyBankToFlowRow(
      "t1",
      "u1",
      permsViewOnly,
      { transactionId: "tx-1", flowRowId: "row-1" },
    );
    expect(r).toMatchObject({ ok: false });
  });

  it("preview + apply persiste flowRowId (repro Aporte/Devolución socios)", async () => {
    vi.mocked(prisma.financeFlowRow.findFirst).mockResolvedValue({
      id: "row-retiro",
      name: "Retiro socios",
      section: "FINANCIAMIENTO",
      categoryId: "cat-shared",
    } as never);
    vi.mocked(prisma.financeBankTransaction.findFirst).mockResolvedValue({
      id: "tx-1",
      amount: -500000,
      description: "TRF CARLOS IRIGOYEN",
      reconciliationStatus: "UNMATCHED",
      bankAccountId: "acc-1",
    } as never);
    vi.mocked(prisma.financeBankTransactionLink.findMany).mockResolvedValue([]);
    vi.mocked(resolveAccountPlanIdForFlowRow).mockResolvedValue("plan-shared");
    vi.mocked(prisma.financeAccountPlan.findFirst).mockResolvedValue({
      code: "2.1.01.003",
      name: "Acreedores Varios",
    } as never);
    vi.mocked(setTransactionLinks).mockResolvedValue(undefined as never);
    vi.mocked(prisma.financeBankTransactionLink.findFirst).mockResolvedValue({
      id: "link-1",
      flowRowId: "row-retiro",
      accountPlanId: "plan-shared",
    } as never);

    const preview = (await toolPreviewClassifyBankToFlowRow("t1", "u1", permsFull, {
      transactionId: "tx-1",
      flowRowId: "row-retiro",
      learnRule: "NONE",
    })) as { ok: true; data: { previewToken: string; summary: { willPersistFlowRowId: boolean; flowRowId: string } } };

    expect(preview.ok).toBe(true);
    expect(preview.data.summary.willPersistFlowRowId).toBe(true);
    expect(preview.data.summary.flowRowId).toBe("row-retiro");
    expect(preview.data.previewToken).toBeTruthy();

    const applied = (await toolClassifyBankToFlowRow("t1", "u1", permsFull, {
      previewToken: preview.data.previewToken,
    })) as {
      ok: true;
      data: { persistedFlowRowId: string; flowRowId: string };
    };

    expect(applied.ok).toBe(true);
    expect(applied.data.persistedFlowRowId).toBe("row-retiro");
    expect(setTransactionLinks).toHaveBeenCalledWith(
      "t1",
      "tx-1",
      "u1",
      expect.arrayContaining([
        expect.objectContaining({
          flowRowId: "row-retiro",
          accountPlanId: "plan-shared",
          targetType: "EXPENSE",
          matchSource: "MANUAL",
        }),
      ]),
    );
  });

  it("re-clasifica MATCHED con link EXPENSE previo (MCP classify)", async () => {
    vi.mocked(prisma.financeFlowRow.findFirst).mockResolvedValue({
      id: "row-devol",
      name: "Devolución a socios",
      section: "FINANCIAMIENTO",
      categoryId: "cat-devol",
    } as never);
    vi.mocked(prisma.financeBankTransaction.findFirst).mockResolvedValue({
      id: "tx-matched",
      amount: -2_000_000,
      description: "TRF CARLOS IRIGOYEN",
      reconciliationStatus: "MATCHED",
      bankAccountId: "acc-1",
    } as never);
    vi.mocked(prisma.financeBankTransactionLink.findMany).mockResolvedValue([
      { targetType: "EXPENSE" },
    ] as never);
    vi.mocked(resolveAccountPlanIdForFlowRow).mockResolvedValue("plan-shared");
    vi.mocked(setTransactionLinks).mockResolvedValue(undefined as never);
    vi.mocked(prisma.financeBankTransactionLink.findFirst).mockResolvedValue({
      id: "link-1",
      flowRowId: "row-devol",
      accountPlanId: "plan-shared",
    } as never);

    const applied = (await toolClassifyBankToFlowRow("t1", "u1", permsFull, {
      transactionId: "tx-matched",
      flowRowId: "row-devol",
      learnRule: "NONE",
    })) as {
      ok: true;
      data: { persistedFlowRowId: string; flowRowId: string };
    };

    expect(applied.ok).toBe(true);
    expect(applied.data.flowRowId).toBe("row-devol");
    expect(setTransactionLinks).toHaveBeenCalledWith(
      "t1",
      "tx-matched",
      "u1",
      expect.arrayContaining([
        expect.objectContaining({
          flowRowId: "row-devol",
          accountPlanId: "plan-shared",
          targetType: "EXPENSE",
        }),
      ]),
    );
  });
});

describe("preview authorize dry-run", () => {
  beforeEach(() => {
    vi.mocked(listBankAccounts).mockReset();
    vi.mocked(prisma.financeBankTransaction.findMany).mockReset();
    vi.mocked(prisma.financeAccountPlan.findMany).mockResolvedValue([]);
    vi.mocked(prisma.financeAutoMatchRule.findMany).mockResolvedValue([]);
    vi.mocked(prisma.aiActionLog.create).mockResolvedValue({} as never);
    vi.mocked(setTransactionLinks).mockClear();
  });

  it("devuelve dryRun sin persistir", async () => {
    vi.mocked(listBankAccounts).mockResolvedValue([
      { id: "acc-1", bankName: "Santander", accountNumber: "00" },
    ] as never);
    vi.mocked(prisma.financeBankTransaction.findMany).mockResolvedValue([
      {
        id: "tx-te",
        transactionDate: new Date("2026-08-05T12:00:00Z"),
        amount: -80000,
        description: "TE GUARDIA X",
        suggestedAccountPlanId: "plan-te",
        suggestedRuleId: null,
        bankAccountId: "acc-1",
      },
    ] as never);

    const r = (await toolPreviewAuthorizeBankMovements("t1", "u1", permsFull, {
      accountName: "Santander",
    })) as {
      ok: true;
      data: { dryRun: boolean; count: number; candidates: unknown[] };
    };

    expect(r.ok).toBe(true);
    expect(r.data.dryRun).toBe(true);
    expect(r.data.count).toBe(1);
    expect(setTransactionLinks).not.toHaveBeenCalled();
  });
});
