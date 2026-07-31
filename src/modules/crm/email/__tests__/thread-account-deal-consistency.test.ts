import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dealFindFirst: vi.fn(),
  threadUpdate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmDeal: { findFirst: mocks.dealFindFirst },
    crmEmailThread: { update: mocks.threadUpdate },
  },
}));

import { healThreadAccountToDealAccount } from "../thread-account-deal-consistency";

describe("healThreadAccountToDealAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no-op sin deal", async () => {
    const r = await healThreadAccountToDealAccount({
      tenantId: "t1",
      threadId: "th1",
      accountId: "acc1",
      dealId: null,
    });
    expect(r).toEqual({ accountId: "acc1", dealId: null });
    expect(mocks.dealFindFirst).not.toHaveBeenCalled();
  });

  it("no-op si cuenta del hilo = cuenta del deal", async () => {
    mocks.dealFindFirst.mockResolvedValue({ id: "d1", accountId: "acc1" });
    const r = await healThreadAccountToDealAccount({
      tenantId: "t1",
      threadId: "th1",
      accountId: "acc1",
      dealId: "d1",
    });
    expect(r).toEqual({ accountId: "acc1", dealId: "d1" });
    expect(mocks.threadUpdate).not.toHaveBeenCalled();
  });

  it("alinea accountId del hilo al del deal cuando difieren", async () => {
    mocks.dealFindFirst.mockResolvedValue({ id: "d1", accountId: "acc-suecia" });
    mocks.threadUpdate.mockResolvedValue({});
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
    mocks.threadUpdate.mockResolvedValue({});
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
});
