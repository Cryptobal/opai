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
  normalizeAdditionalReferencesForSii: vi.fn(() => []),
}));
vi.mock("../inherit-template-link", () => ({
  applyTemplateLinkInheritance: vi.fn(async () => ({
    recurringTemplateId: null,
    billingPeriod: null,
  })),
}));
vi.mock("@/lib/fx-date", async () => {
  const actual = await vi.importActual<typeof import("@/lib/fx-date")>("@/lib/fx-date");
  return { ...actual, todayChileStr: () => "2026-08-04" };
});

import {
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
