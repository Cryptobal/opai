import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  contactFindFirst: vi.fn(),
  dealFindFirst: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmContact: { findFirst: mocks.contactFindFirst },
    crmDeal: { findFirst: mocks.dealFindFirst },
  },
}));

import { resolveContactIdForCpqQuote } from "../resolve-quote-contact";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const CONTACT = "22222222-2222-4222-8222-222222222222";
const DEAL = "33333333-3333-4333-8333-333333333333";
const TENANT = "tenant-1";

describe("resolveContactIdForCpqQuote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("usa contactId explícito si pertenece a la cuenta", async () => {
    mocks.contactFindFirst.mockResolvedValueOnce({ id: CONTACT });

    const result = await resolveContactIdForCpqQuote({
      tenantId: TENANT,
      accountId: ACCOUNT,
      explicitContactId: CONTACT,
    });

    expect(result).toEqual({ ok: true, contactId: CONTACT, source: "explicit" });
    expect(mocks.contactFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CONTACT, tenantId: TENANT, accountId: ACCOUNT },
      }),
    );
    expect(mocks.dealFindFirst).not.toHaveBeenCalled();
  });

  it("rechaza contactId de otra cuenta", async () => {
    mocks.contactFindFirst.mockResolvedValueOnce(null);

    const result = await resolveContactIdForCpqQuote({
      tenantId: TENANT,
      accountId: ACCOUNT,
      explicitContactId: CONTACT,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/no existe|no está en esa cuenta/i);
    }
  });

  it("hereda primaryContactId del deal cuando no hay contactId", async () => {
    mocks.dealFindFirst.mockResolvedValueOnce({ primaryContactId: CONTACT });
    mocks.contactFindFirst.mockResolvedValueOnce({ id: CONTACT });

    const result = await resolveContactIdForCpqQuote({
      tenantId: TENANT,
      accountId: ACCOUNT,
      dealId: DEAL,
    });

    expect(result).toEqual({ ok: true, contactId: CONTACT, source: "deal" });
  });

  it("cae al contacto principal de la cuenta", async () => {
    mocks.dealFindFirst.mockResolvedValueOnce({ primaryContactId: null });
    mocks.contactFindFirst.mockResolvedValueOnce({ id: CONTACT });

    const result = await resolveContactIdForCpqQuote({
      tenantId: TENANT,
      accountId: ACCOUNT,
      dealId: DEAL,
    });

    expect(result).toEqual({ ok: true, contactId: CONTACT, source: "account_primary" });
    expect(mocks.contactFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT, accountId: ACCOUNT, isPrimary: true },
      }),
    );
  });

  it("cae al primer contacto de la cuenta si no hay principal", async () => {
    mocks.contactFindFirst
      .mockResolvedValueOnce(null) // isPrimary
      .mockResolvedValueOnce({ id: CONTACT }); // first

    const result = await resolveContactIdForCpqQuote({
      tenantId: TENANT,
      accountId: ACCOUNT,
    });

    expect(result).toEqual({ ok: true, contactId: CONTACT, source: "account_first" });
  });

  it("falla si la cuenta no tiene contactos", async () => {
    mocks.contactFindFirst.mockResolvedValue(null);

    const result = await resolveContactIdForCpqQuote({
      tenantId: TENANT,
      accountId: ACCOUNT,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/No hay contacto/i);
    }
  });
});
