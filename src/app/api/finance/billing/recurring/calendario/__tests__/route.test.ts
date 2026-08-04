/**
 * Tests para GET/PATCH /api/finance/billing/recurring/calendario.
 *
 * Cubre ownership cross-tenant, normalización AL_EMITIR, recompute de
 * nextRunAt solo cuando cambia frecuencia/día/inicio, diasCobro null,
 * y endDate < startDate → 400.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeRecurringIssueYmd } from "@/modules/finance/billing/dte-recurring-schedule";
import { addDaysYmd } from "@/modules/finance/flow-v3/types";

const {
  requireAuthMock,
  resolveApiPermsMock,
  hasCapabilityMock,
  hasFacturacionCapabilityMock,
  findManyTemplates,
  updateTemplate,
  transactionMock,
  syncRecurringDteItemMock,
  accountFindMany,
  installationFindMany,
} = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  resolveApiPermsMock: vi.fn(),
  hasCapabilityMock: vi.fn(),
  hasFacturacionCapabilityMock: vi.fn(),
  findManyTemplates: vi.fn(),
  updateTemplate: vi.fn(),
  transactionMock: vi.fn(),
  syncRecurringDteItemMock: vi.fn(),
  accountFindMany: vi.fn(),
  installationFindMany: vi.fn(),
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
  parseBody: async (
    req: Request,
    schema: {
      safeParse: (raw: unknown) => {
        success: boolean;
        data?: unknown;
        error?: { issues: Array<{ path: (string | number)[]; message: string }> };
      };
    },
  ) => {
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
  hasFacturacionCapability: hasFacturacionCapabilityMock,
}));

vi.mock("@/modules/finance/cashflow/generators/recurring-dte-sync", () => ({
  syncRecurringDteItem: (...args: unknown[]) =>
    syncRecurringDteItemMock(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeDteRecurringTemplate: {
      findMany: (...args: unknown[]) => findManyTemplates(...args),
      update: (...args: unknown[]) => updateTemplate(...args),
    },
    crmAccount: {
      findMany: (...args: unknown[]) => accountFindMany(...args),
    },
    crmInstallation: {
      findMany: (...args: unknown[]) => installationFindMany(...args),
    },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));

import { PATCH } from "../route";

const TENANT = "11111111-1111-4111-8111-111111111111";
const TPL_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TPL_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function baseTpl(overrides: Record<string, unknown> = {}) {
  return {
    id: TPL_A,
    tenantId: TENANT,
    name: "Embajada Brasil",
    isActive: true,
    dteType: 33,
    frequency: "monthly",
    dayOfMonth: 20,
    dayOfWeek: null,
    monthOfYear: null,
    startDate: new Date("2026-01-01T00:00:00.000Z"),
    endDate: null,
    nextRunAt: new Date("2026-08-20T00:00:00.000Z"),
    lastRunAt: null,
    facturaTiming: "DIA_ESPECIFICO",
    facturaDay: 15,
    facturaMesRelativo: "MES_SIGUIENTE",
    diasCobroDesdeFactura: 20,
    crmAccountId: null,
    installationId: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthMock.mockResolvedValue({ tenantId: TENANT, userId: "u1" });
  resolveApiPermsMock.mockResolvedValue({});
  hasCapabilityMock.mockReturnValue(false);
  hasFacturacionCapabilityMock.mockReturnValue(true);
  syncRecurringDteItemMock.mockResolvedValue(undefined);
  transactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
    const tx = {
      financeDteRecurringTemplate: {
        update: updateTemplate,
      },
    };
    await fn(tx);
  });
  updateTemplate.mockResolvedValue({});
});

describe("PATCH /api/finance/billing/recurring/calendario", () => {
  it("rechaza id de otro tenant sin escribir nada", async () => {
    findManyTemplates.mockResolvedValue([baseTpl()]);
    const req = new Request("http://localhost/api", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          { id: TPL_A, diasCobroDesdeFactura: 10 },
          { id: TPL_B, diasCobroDesdeFactura: 10 },
        ],
      }),
    });
    const res = await PATCH(req as never);
    expect(res.status).toBe(403);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(updateTemplate).not.toHaveBeenCalled();
  });

  it("AL_EMITIR normaliza facturaDay a null y mes a MES_SIGUIENTE", async () => {
    findManyTemplates.mockResolvedValue([baseTpl()]);
    const req = new Request("http://localhost/api", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          {
            id: TPL_A,
            facturaTiming: "AL_EMITIR",
            facturaDay: 15,
            facturaMesRelativo: "MISMO_MES",
          },
        ],
      }),
    });
    const res = await PATCH(req as never);
    expect(res.status).toBe(200);
    expect(updateTemplate).toHaveBeenCalled();
    const arg = updateTemplate.mock.calls[0][0];
    expect(arg.data.facturaTiming).toBe("AL_EMITIR");
    expect(arg.data.facturaDay).toBeNull();
    expect(arg.data.facturaMesRelativo).toBe("MES_SIGUIENTE");
  });

  it("cambiar dayOfMonth recomputa nextRunAt; solo diasCobro no lo toca", async () => {
    findManyTemplates.mockResolvedValue([baseTpl()]);
    const reqFreq = new Request("http://localhost/api", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ id: TPL_A, dayOfMonth: 10 }],
      }),
    });
    const resFreq = await PATCH(reqFreq as never);
    expect(resFreq.status).toBe(200);
    const nextAfterFreq = updateTemplate.mock.calls[0][0].data.nextRunAt;
    expect(nextAfterFreq).not.toEqual(new Date("2026-08-20T00:00:00.000Z"));

    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue({ tenantId: TENANT, userId: "u1" });
    resolveApiPermsMock.mockResolvedValue({});
    hasFacturacionCapabilityMock.mockReturnValue(true);
    syncRecurringDteItemMock.mockResolvedValue(undefined);
    transactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      await fn({
        financeDteRecurringTemplate: { update: updateTemplate },
      });
    });
    updateTemplate.mockResolvedValue({});
    findManyTemplates.mockResolvedValue([baseTpl()]);

    const reqDias = new Request("http://localhost/api", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ id: TPL_A, diasCobroDesdeFactura: 45 }],
      }),
    });
    const resDias = await PATCH(reqDias as never);
    expect(resDias.status).toBe(200);
    const dataDias = updateTemplate.mock.calls[0][0].data;
    expect(dataDias.diasCobroDesdeFactura).toBe(45);
    expect(dataDias.nextRunAt).toEqual(new Date("2026-08-20T00:00:00.000Z"));
  });

  it("diasCobroDesdeFactura = null es válido", async () => {
    findManyTemplates.mockResolvedValue([baseTpl()]);
    const req = new Request("http://localhost/api", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ id: TPL_A, diasCobroDesdeFactura: null }],
      }),
    });
    const res = await PATCH(req as never);
    expect(res.status).toBe(200);
    expect(updateTemplate.mock.calls[0][0].data.diasCobroDesdeFactura).toBeNull();
  });

  it("endDate < startDate devuelve 400", async () => {
    findManyTemplates.mockResolvedValue([baseTpl()]);
    const req = new Request("http://localhost/api", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          {
            id: TPL_A,
            startDate: "2026-06-01",
            endDate: "2026-01-01",
          },
        ],
      }),
    });
    const res = await PATCH(req as never);
    expect(res.status).toBe(400);
    expect(transactionMock).not.toHaveBeenCalled();
  });
});

describe("columnas derivadas (caso Embajada Brasil)", () => {
  it("emisión 2026-09-15 y cobro 2026-10-05", () => {
    const nextRunAt = new Date("2026-08-20T00:00:00.000Z");
    const emision = computeRecurringIssueYmd(
      {
        facturaTiming: "DIA_ESPECIFICO",
        facturaDay: 15,
        facturaMesRelativo: "MES_SIGUIENTE",
        dayOfMonth: 20,
      },
      nextRunAt,
    );
    expect(emision).toBe("2026-09-15");
    expect(addDaysYmd(emision, 20)).toBe("2026-10-05");
  });
});
