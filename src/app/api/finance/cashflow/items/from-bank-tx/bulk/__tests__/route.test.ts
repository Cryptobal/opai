import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAuthMock = vi.fn();
const resolveApiPermsMock = vi.fn();
const hasCapabilityMock = vi.fn();
const assignMock = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ hasCapability: hasCapabilityMock }));
vi.mock("@/lib/api-auth", () => ({
  requireAuth: requireAuthMock,
  resolveApiPerms: resolveApiPermsMock,
  unauthorized: () => new Response(JSON.stringify({ success: false }), { status: 401 }),
  parseBody: async (req: Request, schema: { safeParse: (r: unknown) => { success: boolean; data?: unknown } }) => {
    const raw = await req.json();
    const res = schema.safeParse(raw);
    if (!res.success) return { error: new Response(JSON.stringify({ success: false }), { status: 400 }) };
    return { data: res.data };
  },
}));

class AssignErr extends Error {
  status: number;
  constructor(m: string, s: number) { super(m); this.status = s; this.name = "AssignToCategoryError"; }
}
vi.mock("@/modules/finance/cashflow/assign-to-category.service", () => ({
  assignBankTxToCategory: assignMock,
  AssignToCategoryError: AssignErr,
}));

const uuid = (n: number) => `${n}${n}${n}${n}${n}${n}${n}${n}-${n}${n}${n}${n}-4${n}${n}${n}-8${n}${n}${n}-${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}`;
const CAT = uuid(2);

function makeRequest(body: unknown): Request {
  return new Request("http://x/api/finance/cashflow/items/from-bank-tx/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthMock.mockResolvedValue({ userId: "u1", tenantId: "tenant-A" });
  resolveApiPermsMock.mockResolvedValue({});
  hasCapabilityMock.mockReturnValue(true);
});

describe("POST /api/finance/cashflow/items/from-bank-tx/bulk", () => {
  it("agrega el resumen: consumed / created y saltea los ya vinculados sin abortar el lote", async () => {
    assignMock
      .mockResolvedValueOnce({ mode: "consumed", occurrenceId: "o1", itemId: "i1" })
      .mockResolvedValueOnce({ mode: "created", occurrenceId: "o2", itemId: "i2" })
      .mockRejectedValueOnce(new AssignErr("Ese movimiento bancario ya está vinculado", 409));

    const { POST } = await import("../route");
    const res = await POST(
      makeRequest({ bankTransactionIds: [uuid(1), uuid(3), uuid(4)], categoryId: CAT }) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.consumed).toBe(1);
    expect(body.data.created).toBe(1);
    expect(body.data.total).toBe(3);
    expect(body.data.skipped).toEqual([{ id: uuid(4), reason: "Ese movimiento bancario ya está vinculado" }]);
    expect(assignMock).toHaveBeenCalledTimes(3);
  });

  it("403 sin cashflow_manage", async () => {
    hasCapabilityMock.mockReturnValueOnce(false);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bankTransactionIds: [uuid(1)], categoryId: CAT }) as never);
    expect(res.status).toBe(403);
    expect(assignMock).not.toHaveBeenCalled();
  });
});
