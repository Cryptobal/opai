import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.RESEND_API_KEY ??= "test_resend_key_for_tests";
});

const {
  computeDteAmountsMock,
  prismaMock,
} = vi.hoisted(() => {
  const computeDteAmountsMock = vi.fn();
  const prismaMock = {
    crmAccount: { findMany: vi.fn() },
    tenantDteConfig: { findUnique: vi.fn() },
    financeDte: { findFirst: vi.fn(), create: vi.fn() },
    // Lookups del término de pago (resolveIssuedDueDate) — corren antes de
    // la transacción de emisión.
    financeDteRecurringTemplate: { findFirst: vi.fn() },
    financeCashflowConfig: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  };
  return { computeDteAmountsMock, prismaMock };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("../dte-amounts.helper", () => ({
  computeDteAmounts: (...a: unknown[]) => computeDteAmountsMock(...a),
}));
vi.mock("../shared/validators/rut.validator", () => ({
  validateRut: () => ({ valid: true }),
  cleanRut: (r: string) => r.replace(/[^0-9kK]/g, "").toUpperCase(),
}));
vi.mock("@/lib/chile-rut", () => ({
  cleanRut: (r: string) => r.replace(/[^0-9kK]/g, "").toUpperCase(),
  toSiiRut: (r: string) => {
    const c = r.replace(/[^0-9kK]/g, "").toUpperCase();
    return `${c.slice(0, -1)}-${c.slice(-1)}`;
  },
}));
vi.mock("../dte-xml-compliance", () => ({
  enrichDteEmailRecipientsFromCrm: vi.fn(async () => ({
    adjusted: false,
    to: null,
    cc: [],
  })),
  enrichDteReceiverFromCrm: vi.fn(async (input: {
    current?: {
      giro?: string;
      direccion?: string;
      comuna?: string;
      ciudad?: string;
    } | null;
  }) => ({
    giro: input.current?.giro,
    direccion: input.current?.direccion,
    comuna: input.current?.comuna,
    ciudad: input.current?.ciudad,
    adjusted: false,
  })),
  normalizeAdditionalReferencesForSii: vi.fn(() => []),
}));
vi.mock("../inherit-template-link", () => ({
  applyTemplateLinkInheritance: vi.fn(async () => ({
    recurringTemplateId: null,
    billingPeriod: null,
  })),
  countActiveAccountTemplates: vi.fn(async () => 0),
}));
vi.mock("@/modules/finance/flow-v3/weekly-close.adapter", () => ({
  listClosedV3Weeks: vi.fn(async (_t: string, mondays: string[]) =>
    mondays.includes("2026-07-27") ? ["2026-07-27"] : [],
  ),
}));
vi.mock("@/lib/fx-date", async () => {
  const actual = await vi.importActual<typeof import("@/lib/fx-date")>("@/lib/fx-date");
  return { ...actual, todayChileStr: () => "2026-08-04" };
});

import {
  AnchoredIssueDateError,
  FutureIssueDateError,
  issueDte,
} from "../dte-issuer.service";

const baseInput = {
  issueDate: "2026-09-01",
  dteType: 33,
  receiverRut: "11.111.111-1",
  receiverName: "Cliente Test",
  lines: [
    {
      itemName: "Servicio",
      quantity: 1,
      unitPrice: 1000,
      isExempt: false,
    },
  ],
};

describe("issueDte — guard fecha futura", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    computeDteAmountsMock.mockResolvedValue({
      totalNet: 1000,
      totalExempt: 0,
      taxRate: 19,
      taxAmount: 190,
      totalAmount: 1190,
      ufValue: null,
      ufDate: null,
      lines: [
        {
          itemName: "Servicio",
          quantity: 1,
          unitPrice: 1000,
          netAmount: 1000,
          isExempt: false,
        },
      ],
    });
    prismaMock.crmAccount.findMany.mockResolvedValue([]);
    prismaMock.financeDteRecurringTemplate.findFirst.mockResolvedValue(null);
    prismaMock.financeCashflowConfig.findUnique.mockResolvedValue(null);
  });

  it("bloquea emisión con fecha futura sin confirmación", async () => {
    await expect(issueDte("t1", "u1", baseInput)).rejects.toBeInstanceOf(
      FutureIssueDateError,
    );
  });

  it("allowFutureDate permite continuar (llega al provider/tx)", async () => {
    prismaMock.$transaction.mockRejectedValue(new Error("no config (test)"));
    await expect(
      issueDte("t1", "u1", baseInput, { allowFutureDate: true }),
    ).rejects.toThrow("no config (test)");
  });

  it("forceIssueDateToToday reescribe a hoy y pasa el guard", async () => {
    prismaMock.$transaction.mockRejectedValue(new Error("no config (test)"));
    const input = { ...baseInput };
    await expect(
      issueDte("t1", "u1", input, { forceIssueDateToToday: true }),
    ).rejects.toThrow("no config (test)");
    expect(input.issueDate).toBe("2026-08-04");
  });
});

describe("issueDte — guard fecha sellada/pasada (v4.7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    computeDteAmountsMock.mockResolvedValue({
      totalNet: 1000,
      totalExempt: 0,
      taxRate: 19,
      taxAmount: 190,
      totalAmount: 1190,
      ufValue: null,
      ufDate: null,
      lines: [
        {
          itemName: "Servicio",
          quantity: 1,
          unitPrice: 1000,
          netAmount: 1000,
          isExempt: false,
        },
      ],
    });
    prismaMock.crmAccount.findMany.mockResolvedValue([]);
    prismaMock.financeDteRecurringTemplate.findFirst.mockResolvedValue(null);
    prismaMock.financeCashflowConfig.findUnique.mockResolvedValue(null);
  });

  it("bloquea emisión con fecha en semana sellada sin confirmación", async () => {
    // 2026-08-01 = sábado → lunes 2026-07-27 (S31 sellada en el mock).
    await expect(
      issueDte("t1", "u1", { ...baseInput, issueDate: "2026-08-01" }),
    ).rejects.toMatchObject({
      name: "AnchoredIssueDateError",
      code: "ANCHORED_ISSUE_DATE",
      reason: "sealed",
      weekLabel: "S31",
    });
  });

  it("bloquea emisión con fecha en semana pasada abierta", async () => {
    // 2026-07-20 = lunes de semana pasada (no sellada en el mock).
    await expect(
      issueDte("t1", "u1", { ...baseInput, issueDate: "2026-07-20" }),
    ).rejects.toBeInstanceOf(AnchoredIssueDateError);
  });

  it("allowAnchoredDate permite continuar", async () => {
    prismaMock.$transaction.mockRejectedValue(new Error("no config (test)"));
    await expect(
      issueDte("t1", "u1", { ...baseInput, issueDate: "2026-08-01" }, {
        allowAnchoredDate: true,
      }),
    ).rejects.toThrow("no config (test)");
  });

  it("forceIssueDateToToday reescribe fecha sellada a hoy", async () => {
    prismaMock.$transaction.mockRejectedValue(new Error("no config (test)"));
    const input = { ...baseInput, issueDate: "2026-08-01" };
    await expect(
      issueDte("t1", "u1", input, { forceIssueDateToToday: true }),
    ).rejects.toThrow("no config (test)");
    expect(input.issueDate).toBe("2026-08-04");
  });
});
