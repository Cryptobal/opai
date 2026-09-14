/**
 * Tests para POST /api/finance/cashflow/bank-balance/adjust.
 *
 * Cubre:
 *  - Sin sesión → 401.
 *  - Sin `banking_manage` → 403.
 *  - Cuenta inexistente / cross-tenant → 404.
 *  - Cuenta no-CLP (UF/USD) → 400.
 *  - Happy path: registra una lectura MANUAL y NO mueve el saldo: `balance`
 *    devuelto es el ledger (saldo inicial + movimientos) y currentBalance
 *    queda en el ledger, no en la lectura.
 *  - Historial: dos llamadas crean dos lecturas (no se actualiza la vieja).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAuthMock = vi.fn();
const resolveApiPermsMock = vi.fn();
const hasCapabilityMock = vi.fn();

const bankAccountFindFirst = vi.fn();
const bankAccountUpdate = vi.fn();
const balanceCreate = vi.fn();
const balanceFindMany = vi.fn();
const balanceFindFirst = vi.fn();
const bankTxAggregate = vi.fn();
const cashflowConfigFindUnique = vi.fn();

const OPENING = {
  id: "opening-1",
  asOfDate: new Date("2026-01-01T00:00:00.000Z"),
  balance: 10_000_000,
  note: null,
  createdAt: new Date("2026-01-02T00:00:00Z"),
};

vi.mock("server-only", () => ({}));

// Mock completo de api-auth para evitar la cadena transitiva
// next-auth → @/lib/auth que no resuelve "next/server" en jsdom.
vi.mock("@/lib/api-auth", () => {
  return {
    requireAuth: requireAuthMock,
    resolveApiPerms: resolveApiPermsMock,
    unauthorized: () =>
      new Response(
        JSON.stringify({ success: false, error: "No autorizado" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      ),
    parseBody: async (req: Request, schema: { safeParse: (raw: unknown) => { success: boolean; data?: unknown; error?: { issues: Array<{ path: (string | number)[]; message: string }> } } }) => {
      try {
        const raw = await req.json();
        const result = schema.safeParse(raw);
        if (!result.success) {
          const issues = (result.error?.issues ?? [])
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ");
          return {
            error: new Response(
              JSON.stringify({ success: false, error: issues }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            ),
          };
        }
        return { data: result.data };
      } catch {
        return {
          error: new Response(
            JSON.stringify({ success: false, error: "Body JSON inválido" }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          ),
        };
      }
    },
  };
});

vi.mock("@/lib/permissions", () => ({
  hasCapability: hasCapabilityMock,
}));

// revalidatePath requiere el static-generation store de Next, ausente en
// tests unitarios. Lo mockeamos como no-op.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeBankAccount: {
      findFirst: bankAccountFindFirst,
      update: bankAccountUpdate,
    },
    financeBankAccountBalance: {
      create: balanceCreate,
      findMany: balanceFindMany,
      findFirst: balanceFindFirst,
    },
    financeBankTransaction: {
      aggregate: bankTxAggregate,
    },
    financeCashflowConfig: {
      findUnique: cashflowConfigFindUnique,
    },
  },
}));

function makeRequest(body: unknown): Request {
  return new Request("http://x/api/finance/cashflow/bank-balance/adjust", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  requireAuthMock.mockReset();
  resolveApiPermsMock.mockReset();
  hasCapabilityMock.mockReset();
  bankAccountFindFirst.mockReset();
  bankAccountUpdate.mockReset();
  balanceCreate.mockReset();
  balanceFindMany.mockReset();
  balanceFindFirst.mockReset();
  bankTxAggregate.mockReset();
  cashflowConfigFindUnique.mockReset();
  // Umbral alto: estos tests cubren lecturas, no el gate de discrepancia.
  cashflowConfigFindUnique.mockResolvedValue({
    bankBalanceDiscrepancyThresholdClp: 1_000_000_000,
  });

  // Ledger: OPENING 10M + Σ tx 2.5M = 12.5M, independiente de las lecturas.
  balanceFindFirst.mockResolvedValue(OPENING);
  balanceFindMany.mockResolvedValue([]);
  balanceCreate.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
    id: `snap-${balanceCreate.mock.calls.length}`,
    ...args.data,
    createdAt: new Date(),
  }));
  bankTxAggregate.mockResolvedValue({ _sum: { amount: 2_500_000 }, _count: { _all: 4 } });

  requireAuthMock.mockResolvedValue({
    userId: "user-1",
    tenantId: "tenant-A",
    userEmail: "u@acme.cl",
    userRole: "admin",
    roleTemplateId: null,
  });
  resolveApiPermsMock.mockResolvedValue({});
  hasCapabilityMock.mockReturnValue(true);
});

describe("POST /api/finance/cashflow/bank-balance/adjust", () => {
  it("401 sin sesión", async () => {
    requireAuthMock.mockResolvedValueOnce(null);
    const { POST } = await import("../adjust/route");
    const res = await POST(
      makeRequest({
        bankAccountId: "11111111-1111-4111-8111-111111111111",
        balance: 1000,
      }) as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(401);
    expect(balanceCreate).not.toHaveBeenCalled();
  });

  it("403 sin banking_manage", async () => {
    hasCapabilityMock.mockReturnValueOnce(false);
    const { POST } = await import("../adjust/route");
    const res = await POST(
      makeRequest({
        bankAccountId: "11111111-1111-4111-8111-111111111111",
        balance: 1000,
      }) as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(403);
    expect(hasCapabilityMock).toHaveBeenCalledWith(
      expect.anything(),
      "banking_manage",
    );
    expect(balanceCreate).not.toHaveBeenCalled();
  });

  it("400 cuando bankAccountId no es uuid", async () => {
    const { POST } = await import("../adjust/route");
    const res = await POST(
      makeRequest({
        bankAccountId: "not-a-uuid",
        balance: 1000,
      }) as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(400);
    expect(balanceCreate).not.toHaveBeenCalled();
  });

  it("404 cuando la cuenta no pertenece al tenant", async () => {
    bankAccountFindFirst.mockResolvedValueOnce(null);
    const { POST } = await import("../adjust/route");
    const res = await POST(
      makeRequest({
        bankAccountId: "11111111-1111-4111-8111-111111111111",
        balance: 1000,
      }) as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(404);
    expect(bankAccountFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "11111111-1111-4111-8111-111111111111",
          tenantId: "tenant-A",
          isActive: true,
        }),
      }),
    );
    expect(balanceCreate).not.toHaveBeenCalled();
  });

  it("400 cuando la cuenta es UF (no CLP)", async () => {
    bankAccountFindFirst.mockResolvedValueOnce({
      id: "11111111-1111-4111-8111-111111111111",
      currency: "UF",
    });
    const { POST } = await import("../adjust/route");
    const res = await POST(
      makeRequest({
        bankAccountId: "11111111-1111-4111-8111-111111111111",
        balance: 1000,
      }) as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/CLP/);
    expect(balanceCreate).not.toHaveBeenCalled();
  });

  it("registra lectura MANUAL que cuadra: delta 0 y balance = ledger (happy path)", async () => {
    bankAccountFindFirst.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      currency: "CLP",
      currentBalance: 0,
    });
    bankAccountUpdate.mockResolvedValue({});
    const { POST } = await import("../adjust/route");
    const res = await POST(
      makeRequest({
        bankAccountId: "11111111-1111-4111-8111-111111111111",
        balance: 12_500_000,
        note: "saldo informado por el banco",
      }) as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.snapshotId).toBe("snap-1");
    expect(body.data.balance).toBe(12_500_000);
    expect(body.data.readingBalance).toBe(12_500_000);
    expect(body.data.discrepancy.delta).toBe(0);
    expect(body.data.asOfDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    expect(balanceCreate).toHaveBeenCalledTimes(1);
    expect(balanceCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant-A",
        bankAccountId: "11111111-1111-4111-8111-111111111111",
        source: "MANUAL",
        note: "saldo informado por el banco",
        createdById: "user-1",
        asOfDate: expect.any(Date),
      }),
    });
    expect(Number(balanceCreate.mock.calls[0][0].data.balance)).toBe(12_500_000);
    expect(Number(balanceCreate.mock.calls[0][0].data.deltaClp)).toBe(0);
    const updateData = bankAccountUpdate.mock.calls[0][0].data as {
      currentBalance: unknown;
    };
    expect(Number(updateData.currentBalance)).toBe(12_500_000);
  });

  it("una lectura distinta NO mueve el saldo: currentBalance sigue en el ledger y el delta se informa", async () => {
    bankAccountFindFirst.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      currency: "CLP",
      currentBalance: 0,
    });
    bankAccountUpdate.mockResolvedValue({});

    const { POST } = await import("../adjust/route");
    await POST(
      makeRequest({
        bankAccountId: "11111111-1111-4111-8111-111111111111",
        balance: 1_000_000,
      }) as Parameters<typeof POST>[0],
    );
    const res2 = await POST(
      makeRequest({
        bankAccountId: "11111111-1111-4111-8111-111111111111",
        balance: 2_000_000,
      }) as Parameters<typeof POST>[0],
    );
    const body2 = await res2.json();

    expect(balanceCreate).toHaveBeenCalledTimes(2);
    expect(Number(balanceCreate.mock.calls[0][0].data.balance)).toBe(1_000_000);
    expect(Number(balanceCreate.mock.calls[1][0].data.balance)).toBe(2_000_000);
    expect(balanceCreate.mock.calls.every((c) => c[0].data.source === "MANUAL")).toBe(true);
    expect(body2.data.balance).toBe(12_500_000);
    expect(body2.data.discrepancy.delta).toBe(2_000_000 - 12_500_000);
    const lastUpdate = bankAccountUpdate.mock.calls.at(-1)?.[0].data as {
      currentBalance: unknown;
    };
    expect(Number(lastUpdate.currentBalance)).toBe(12_500_000);
  });
});
