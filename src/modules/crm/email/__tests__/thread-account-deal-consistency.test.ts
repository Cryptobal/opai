import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dealFindFirst: vi.fn(),
  accountFindFirst: vi.fn(),
  threadUpdate: vi.fn(),
  tenantFindUnique: vi.fn(),
  emailAccountFindMany: vi.fn(),
  getTenantCompanyConfig: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmDeal: { findFirst: mocks.dealFindFirst },
    crmAccount: { findFirst: mocks.accountFindFirst },
    crmEmailThread: { update: mocks.threadUpdate },
    tenant: { findUnique: mocks.tenantFindUnique },
    crmEmailAccount: { findMany: mocks.emailAccountFindMany },
  },
}));

vi.mock("@/lib/tenant-config", () => ({
  getTenantCompanyConfig: mocks.getTenantCompanyConfig,
}));

import { healThreadAccountToDealAccount } from "../thread-account-deal-consistency";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getTenantCompanyConfig.mockResolvedValue({
    companyName: "Gard Security",
    commercialName: "Gard Security",
    razonSocial: "Gard Security SpA",
    website: "https://www.gard.cl",
  });
  mocks.tenantFindUnique.mockResolvedValue({ name: "Gard Security" });
  mocks.emailAccountFindMany.mockResolvedValue([{ email: "owner@gard.cl" }]);
  mocks.threadUpdate.mockResolvedValue({});
});

describe("healThreadAccountToDealAccount", () => {
  it("no-op sin deal ni cuenta propia", async () => {
    mocks.accountFindFirst.mockResolvedValue({
      id: "acc1",
      name: "Corrupac",
      website: null,
    });
    const r = await healThreadAccountToDealAccount({
      tenantId: "t1",
      threadId: "th1",
      accountId: "acc1",
      dealId: null,
    });
    expect(r).toEqual({ accountId: "acc1", dealId: null });
    expect(mocks.threadUpdate).not.toHaveBeenCalled();
  });

  it("alinea accountId del hilo al del deal cuando difieren", async () => {
    mocks.dealFindFirst.mockResolvedValue({ id: "d1", accountId: "acc-suecia" });
    mocks.accountFindFirst.mockResolvedValue({
      id: "acc-suecia",
      name: "Embajada De Suecia",
      website: null,
    });
    const r = await healThreadAccountToDealAccount({
      tenantId: "t1",
      threadId: "th1",
      accountId: "acc-gard",
      dealId: "d1",
    });
    expect(r).toEqual({ accountId: "acc-suecia", dealId: "d1" });
    expect(mocks.threadUpdate).toHaveBeenCalledWith({
      where: { id: "th1" },
      data: { accountId: "acc-suecia" },
    });
  });

  it("limpia dealId si el negocio no existe", async () => {
    mocks.dealFindFirst.mockResolvedValue(null);
    mocks.accountFindFirst.mockResolvedValue({
      id: "acc1",
      name: "Corrupac",
      website: null,
    });
    const r = await healThreadAccountToDealAccount({
      tenantId: "t1",
      threadId: "th1",
      accountId: "acc1",
      dealId: "missing",
    });
    expect(r).toEqual({ accountId: "acc1", dealId: null });
    expect(mocks.threadUpdate).toHaveBeenCalledWith({
      where: { id: "th1" },
      data: { dealId: null },
    });
  });

  it("desasocia si la cuenta es la propia empresa del tenant", async () => {
    mocks.accountFindFirst.mockResolvedValue({
      id: "acc-gard",
      name: "Gard Security",
      website: "https://www.gard.cl",
    });
    const r = await healThreadAccountToDealAccount({
      tenantId: "t1",
      threadId: "th1",
      accountId: "acc-gard",
      dealId: null,
    });
    expect(r).toEqual({ accountId: null, dealId: null });
    expect(mocks.threadUpdate).toHaveBeenCalledWith({
      where: { id: "th1" },
      data: { accountId: null, dealId: null },
    });
  });
});
