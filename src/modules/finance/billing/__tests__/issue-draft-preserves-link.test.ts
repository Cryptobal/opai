import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const findDraft = vi.fn();
const deleteDte = vi.fn();
const findRun = vi.fn();
const issueDteMock = vi.fn();
const rebindMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeDte: {
      findFirst: (...a: unknown[]) => findDraft(...a),
      delete: (...a: unknown[]) => deleteDte(...a),
    },
    financeDteRecurringRun: {
      findFirst: (...a: unknown[]) => findRun(...a),
    },
  },
}));

vi.mock("../dte-issuer.service", () => ({
  issueDte: (...a: unknown[]) => issueDteMock(...a),
}));

vi.mock("@/modules/finance/cashflow/draft-occurrence-matcher.service", () => ({
  matchDraftToOccurrence: vi.fn(),
  rebindDraftOccurrencesToIssued: (...a: unknown[]) => rebindMock(...a),
}));

import { issueDraftDte } from "../dte-draft.service";

describe("issueDraftDte — conserva vínculo de programación", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findRun.mockResolvedValue(null);
    rebindMock.mockResolvedValue(undefined);
    deleteDte.mockResolvedValue({});
    issueDteMock.mockResolvedValue({ id: "issued-1", folio: 100 });
  });

  it("pasa recurringTemplateId y billingPeriod del borrador a issueDte", async () => {
    findDraft.mockResolvedValue({
      id: "draft-1",
      dteType: 33,
      date: new Date("2026-08-05T00:00:00.000Z"),
      receiverRut: "11.111.111-1",
      receiverName: "Cliente",
      receiverEmail: null,
      receiverEmailCc: [],
      receiverGiro: null,
      receiverDireccion: null,
      receiverComuna: null,
      receiverCiudad: null,
      crmAccountId: "acc-A",
      installationId: "inst-1",
      currency: "CLP",
      notes: null,
      accountId: null,
      ufValueAtIssue: null,
      recurringTemplateId: "tpl-A",
      billingPeriod: "2026-08",
      referenceType: null,
      referenceFolio: null,
      referenceDate: null,
      referenceCode: null,
      referenceDteId: null,
      referenceReason: null,
      additionalReferences: null,
      lines: [],
    });

    await issueDraftDte("tenant-1", "draft-1", "user-1");

    expect(issueDteMock).toHaveBeenCalledTimes(1);
    const input = issueDteMock.mock.calls[0][2] as {
      recurringTemplateId: string | null;
      billingPeriod: string | null;
    };
    expect(input.recurringTemplateId).toBe("tpl-A");
    expect(input.billingPeriod).toBe("2026-08");
  });

  it("pasa null explícito (factura extra) sin perderlo", async () => {
    findDraft.mockResolvedValue({
      id: "draft-2",
      dteType: 33,
      date: new Date("2026-08-05T00:00:00.000Z"),
      receiverRut: "11.111.111-1",
      receiverName: "Cliente",
      receiverEmail: null,
      receiverEmailCc: [],
      receiverGiro: null,
      receiverDireccion: null,
      receiverComuna: null,
      receiverCiudad: null,
      crmAccountId: "acc-A",
      installationId: null,
      currency: "CLP",
      notes: null,
      accountId: null,
      ufValueAtIssue: null,
      recurringTemplateId: null,
      billingPeriod: null,
      referenceType: null,
      referenceFolio: null,
      referenceDate: null,
      referenceCode: null,
      referenceDteId: null,
      referenceReason: null,
      additionalReferences: null,
      lines: [],
    });

    await issueDraftDte("tenant-1", "draft-2", "user-1");
    const input = issueDteMock.mock.calls[0][2] as {
      recurringTemplateId: string | null;
      billingPeriod: string | null;
    };
    expect(input.recurringTemplateId).toBeNull();
    expect(input.billingPeriod).toBeNull();
  });
});
