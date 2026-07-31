import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));
vi.mock("@/lib/api-auth-productividad", () => ({
  requireCorreosAccess: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmEmailThread: { findFirst: vi.fn(), update: vi.fn() },
    crmAccount: { findFirst: vi.fn() },
    crmDeal: { findFirst: vi.fn() },
    crmEmailMessage: { findMany: vi.fn() },
    crmContact: { findMany: vi.fn() },
    tenant: { findUnique: vi.fn() },
    crmEmailAccount: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/audit-email", () => ({
  auditEmailAction: vi.fn(),
}));
vi.mock("@/modules/crm/email/share-materialize", () => ({
  materializeSharedThreadAttachments: vi.fn(),
}));
vi.mock("@/modules/crm/email/mailbox-scope", () => ({
  requireThreadMailbox: vi.fn(),
}));
vi.mock("@/lib/tenant-config", () => ({
  getTenantCompanyConfig: vi.fn().mockResolvedValue({
    companyName: "Gard Security",
    commercialName: "Gard Security",
    razonSocial: "Gard Security SpA",
    website: "https://www.gard.cl",
  }),
}));

import { auth } from "@/lib/auth";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { prisma } from "@/lib/prisma";
import { requireThreadMailbox } from "@/modules/crm/email/mailbox-scope";
import { POST } from "../route";

describe("POST /api/crm/correos/[threadId]/associate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireCorreosAccess).mockResolvedValue({ authorized: true } as never);
    vi.mocked(auth).mockResolvedValue({
      user: { id: "u1", tenantId: "t1", email: "u@test.com" },
    } as never);
    vi.mocked(requireThreadMailbox).mockResolvedValue({
      ok: true,
      thread: { id: "th1", emailAccountId: "ea1" },
      account: {
        id: "ea1",
        email: "a@test.com",
        color: "teal",
        displayLabel: "Test",
        isDefault: true,
        sortIndex: 0,
        status: "active",
        grantedScopes: null,
      },
    });
    vi.mocked(prisma.crmEmailThread.findFirst).mockResolvedValue({
      id: "th1",
      accountId: "acc1",
      dealId: null,
      sharedWithAccount: true,
    } as never);
    vi.mocked(prisma.crmAccount.findFirst).mockResolvedValue({
      id: "acc1",
      name: "Ns Construcciones Spa",
      website: null,
    } as never);
    vi.mocked(prisma.crmEmailMessage.findMany).mockResolvedValue([]);
    vi.mocked(prisma.crmContact.findMany).mockResolvedValue([]);
    vi.mocked(prisma.crmEmailThread.update).mockResolvedValue({} as never);
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
      name: "Gard Security",
    } as never);
    vi.mocked(prisma.crmEmailAccount.findMany).mockResolvedValue([
      { email: "owner@gard.cl" },
    ] as never);
  });

  it("rechaza asociar a la cuenta propia del tenant", async () => {
    vi.mocked(prisma.crmAccount.findFirst).mockResolvedValue({
      id: "acc-gard",
      name: "Gard Security",
      website: "https://www.gard.cl",
    } as never);

    const req = new NextRequest("http://localhost/api/crm/correos/th1/associate", {
      method: "POST",
      body: JSON.stringify({ accountId: "acc-gard", dealId: null }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, { params: Promise.resolve({ threadId: "th1" }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/propia empresa/i);
    expect(prisma.crmEmailThread.update).not.toHaveBeenCalled();
  });

  it("asocia un negocio cerrado (lost) a la cuenta del hilo", async () => {
    vi.mocked(prisma.crmDeal.findFirst).mockResolvedValue({
      id: "deal-lost",
      title: "Oportunidad Ns Construcciones Spa",
    } as never);

    const req = new NextRequest("http://localhost/api/crm/correos/th1/associate", {
      method: "POST",
      body: JSON.stringify({ accountId: "acc1", dealId: "deal-lost" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, { params: Promise.resolve({ threadId: "th1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      accountId: "acc1",
      dealId: "deal-lost",
      dealTitle: "Oportunidad Ns Construcciones Spa",
    });
    expect(prisma.crmDeal.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "deal-lost", tenantId: "t1", accountId: "acc1" },
      }),
    );
    const dealWhere = vi.mocked(prisma.crmDeal.findFirst).mock.calls[0]?.[0]?.where as {
      status?: string;
    };
    expect(dealWhere.status).toBeUndefined();
    expect(prisma.crmEmailThread.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dealId: "deal-lost", accountId: "acc1" }),
      }),
    );
  });

  it("asocia un negocio ganado (won)", async () => {
    vi.mocked(prisma.crmDeal.findFirst).mockResolvedValue({
      id: "deal-won",
      title: "Deal ganado",
    } as never);

    const req = new NextRequest("http://localhost/api/crm/correos/th1/associate", {
      method: "POST",
      body: JSON.stringify({ accountId: "acc1", dealId: "deal-won" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, { params: Promise.resolve({ threadId: "th1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dealId).toBe("deal-won");
  });

  it("rechaza un negocio que no pertenece a la cuenta", async () => {
    vi.mocked(prisma.crmDeal.findFirst).mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/crm/correos/th1/associate", {
      method: "POST",
      body: JSON.stringify({ accountId: "acc1", dealId: "deal-other" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, { params: Promise.resolve({ threadId: "th1" }) });
    expect(res.status).toBe(404);
    expect(prisma.crmEmailThread.update).not.toHaveBeenCalled();
  });
});
