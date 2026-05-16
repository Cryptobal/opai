/**
 * Tests para POST /api/finance/cashflow/items/from-bank-tx.
 *
 * Cubre:
 *  - Happy path: crea item + occurrence PAID + link al bank tx + MATCHED.
 *  - Bank tx no existe → 404.
 *  - Bank tx ya vinculada a otra occurrence → 409.
 *  - Categoría no existe → 404.
 *  - Sin permisos cashflow_manage → 403.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAuthMock = vi.fn();
const resolveApiPermsMock = vi.fn();
const hasCapabilityMock = vi.fn();

const bankTxFindFirst = vi.fn();
const bankTxUpdate = vi.fn();
const occurrenceFindFirst = vi.fn();
const occurrenceCreate = vi.fn();
const categoryFindFirst = vi.fn();
const itemCreate = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@/lib/api-auth", () => ({
  requireAuth: requireAuthMock,
  resolveApiPerms: resolveApiPermsMock,
  unauthorized: () =>
    new Response(JSON.stringify({ success: false, error: "No autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    }),
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
}));

vi.mock("@/lib/permissions", () => ({
  hasCapability: hasCapabilityMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeBankTransaction: {
      findFirst: bankTxFindFirst,
      update: bankTxUpdate,
    },
    financeCashflowOccurrence: {
      findFirst: occurrenceFindFirst,
      create: occurrenceCreate,
    },
    financeCashflowCategory: {
      findFirst: categoryFindFirst,
    },
    financeCashflowItem: {
      create: itemCreate,
    },
    $transaction: async (
      fn: (db: {
        financeCashflowItem: { create: typeof itemCreate };
        financeCashflowOccurrence: { create: typeof occurrenceCreate };
        financeBankTransaction: { update: typeof bankTxUpdate };
      }) => unknown,
    ) =>
      fn({
        financeCashflowItem: { create: itemCreate },
        financeCashflowOccurrence: { create: occurrenceCreate },
        financeBankTransaction: { update: bankTxUpdate },
      }),
  },
}));

const TX_UUID = "11111111-1111-4111-8111-111111111111";
const CAT_UUID = "22222222-2222-4222-8222-222222222222";

function makeRequest(body: unknown): Request {
  return new Request("http://x/api/finance/cashflow/items/from-bank-tx", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  requireAuthMock.mockReset();
  resolveApiPermsMock.mockReset();
  hasCapabilityMock.mockReset();
  bankTxFindFirst.mockReset();
  bankTxUpdate.mockReset();
  occurrenceFindFirst.mockReset();
  occurrenceCreate.mockReset();
  categoryFindFirst.mockReset();
  itemCreate.mockReset();

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

describe("POST /api/finance/cashflow/items/from-bank-tx", () => {
  it("401 sin sesión", async () => {
    requireAuthMock.mockResolvedValueOnce(null);
    const { POST } = await import("../route");
    const res = await POST(
      makeRequest({
        bankTransactionId: TX_UUID,
        categoryId: CAT_UUID,
        name: "Cobro Acme",
        recurrence: "MONTHLY",
      }) as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(401);
    expect(itemCreate).not.toHaveBeenCalled();
  });

  it("403 sin cashflow_manage", async () => {
    hasCapabilityMock.mockReturnValueOnce(false);
    const { POST } = await import("../route");
    const res = await POST(
      makeRequest({
        bankTransactionId: TX_UUID,
        categoryId: CAT_UUID,
        name: "Cobro Acme",
        recurrence: "MONTHLY",
      }) as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(403);
    expect(itemCreate).not.toHaveBeenCalled();
  });

  it("404 cuando el bank tx no existe en el tenant", async () => {
    bankTxFindFirst.mockResolvedValueOnce(null);
    const { POST } = await import("../route");
    const res = await POST(
      makeRequest({
        bankTransactionId: TX_UUID,
        categoryId: CAT_UUID,
        name: "Cobro Acme",
        recurrence: "MONTHLY",
      }) as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/Movimiento bancario/);
    expect(itemCreate).not.toHaveBeenCalled();
  });

  it("409 cuando el bank tx ya está vinculado a otra occurrence", async () => {
    bankTxFindFirst.mockResolvedValueOnce({
      id: TX_UUID,
      amount: -50000,
      transactionDate: new Date("2026-05-10T00:00:00Z"),
      description: "TGR Pago impuesto",
    });
    occurrenceFindFirst.mockResolvedValueOnce({ id: "occ-existing" });
    const { POST } = await import("../route");
    const res = await POST(
      makeRequest({
        bankTransactionId: TX_UUID,
        categoryId: CAT_UUID,
        name: "Impuesto F29",
        recurrence: "ONCE",
      }) as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(409);
    expect(itemCreate).not.toHaveBeenCalled();
  });

  it("404 cuando la categoría no existe", async () => {
    bankTxFindFirst.mockResolvedValueOnce({
      id: TX_UUID,
      amount: 100000,
      transactionDate: new Date("2026-05-10T00:00:00Z"),
      description: "Transferencia recibida",
    });
    occurrenceFindFirst.mockResolvedValueOnce(null);
    categoryFindFirst.mockResolvedValueOnce(null);
    const { POST } = await import("../route");
    const res = await POST(
      makeRequest({
        bankTransactionId: TX_UUID,
        categoryId: CAT_UUID,
        name: "Cobro nuevo",
        recurrence: "MONTHLY",
      }) as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/Categoría/);
    expect(itemCreate).not.toHaveBeenCalled();
  });

  it("happy path: crea item recurrente + occurrence PAID + link + MATCHED", async () => {
    bankTxFindFirst.mockResolvedValueOnce({
      id: TX_UUID,
      amount: -75000, // egreso de 75k
      transactionDate: new Date("2026-05-10T00:00:00Z"),
      description: "Pago Movistar plan empresa",
    });
    occurrenceFindFirst.mockResolvedValueOnce(null);
    categoryFindFirst.mockResolvedValueOnce({ id: CAT_UUID, kind: "EXPENSE" });
    itemCreate.mockResolvedValueOnce({ id: "item-new" });
    occurrenceCreate.mockResolvedValueOnce({ id: "occ-new" });
    bankTxUpdate.mockResolvedValueOnce({});

    const { POST } = await import("../route");
    const res = await POST(
      makeRequest({
        bankTransactionId: TX_UUID,
        categoryId: CAT_UUID,
        name: "Movistar plan empresa",
        recurrence: "MONTHLY",
        notes: "Detectado en cierre semanal",
      }) as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ itemId: "item-new", occurrenceId: "occ-new" });

    // Item creado con kind de la categoría, recurrence MONTHLY, monto absoluto
    expect(itemCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant-A",
        categoryId: CAT_UUID,
        kind: "EXPENSE",
        source: "MANUAL",
        name: "Movistar plan empresa",
        recurrence: "MONTHLY",
        currency: "CLP",
      }),
    });
    // Occurrence PAID con bankTransactionId vinculado
    expect(occurrenceCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        itemId: "item-new",
        status: "PAID",
        bankTransactionId: TX_UUID,
      }),
    });
    // Bank tx marcada MATCHED
    expect(bankTxUpdate).toHaveBeenCalledWith({
      where: { id: TX_UUID },
      data: { reconciliationStatus: "MATCHED" },
    });
  });

  it("happy path ONCE: monto puntual usa amount del tx por default", async () => {
    bankTxFindFirst.mockResolvedValueOnce({
      id: TX_UUID,
      amount: 250000,
      transactionDate: new Date("2026-05-11T00:00:00Z"),
      description: "Devolución proveedor",
    });
    occurrenceFindFirst.mockResolvedValueOnce(null);
    categoryFindFirst.mockResolvedValueOnce({ id: CAT_UUID, kind: "INCOME" });
    itemCreate.mockResolvedValueOnce({ id: "item-p" });
    occurrenceCreate.mockResolvedValueOnce({ id: "occ-p" });
    bankTxUpdate.mockResolvedValueOnce({});

    const { POST } = await import("../route");
    const res = await POST(
      makeRequest({
        bankTransactionId: TX_UUID,
        categoryId: CAT_UUID,
        name: "Devolución",
        recurrence: "ONCE",
      }) as Parameters<typeof POST>[0],
    );
    expect(res.status).toBe(201);
    // El monto guardado debe ser positivo (250000) — el endpoint toma valor
    // absoluto del tx cuando amountClp no viene en el body.
    const itemArgs = itemCreate.mock.calls[0][0] as {
      data: { amount: { toString(): string }; kind: string };
    };
    expect(Number(itemArgs.data.amount.toString())).toBe(250000);
    expect(itemArgs.data.kind).toBe("INCOME");
  });
});
