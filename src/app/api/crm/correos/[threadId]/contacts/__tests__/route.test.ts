import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/api-auth", () => ({
  requireAuth: vi.fn(),
  unauthorized: () => new Response(JSON.stringify({ error: "No autorizado" }), { status: 401 }),
}));
vi.mock("@/lib/api-auth-productividad", () => ({
  requireCorreosAccess: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmEmailThread: { findFirst: vi.fn(), update: vi.fn() },
    crmContact: { findFirst: vi.fn() },
    crmEmailThreadContact: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { requireAuth } from "@/lib/api-auth";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { prisma } from "@/lib/prisma";
import { DELETE, POST } from "../route";

describe("thread contacts API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireCorreosAccess).mockResolvedValue({ authorized: true } as never);
    vi.mocked(requireAuth).mockResolvedValue({ tenantId: "t1", userId: "u1" } as never);
  });

  it("al quitar el principal promueve otro o deja null", async () => {
    vi.mocked(prisma.crmEmailThread.findFirst).mockResolvedValue({
      id: "th1",
      contactId: "c1",
    } as never);
    vi.mocked(prisma.crmEmailThreadContact.deleteMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.crmEmailThreadContact.findFirst).mockResolvedValue({
      contactId: "c2",
    } as never);
    vi.mocked(prisma.crmEmailThread.update).mockResolvedValue({} as never);

    const req = new NextRequest(
      "http://localhost/api/crm/correos/th1/contacts?contactId=c1",
      { method: "DELETE" },
    );
    const res = await DELETE(req, { params: Promise.resolve({ threadId: "th1" }) });
    expect(res.status).toBe(200);
    expect(prisma.crmEmailThread.update).toHaveBeenCalledWith({
      where: { id: "th1" },
      data: { contactId: "c2" },
    });
  });

  it("exige force para contacto fuera de la cuenta", async () => {
    vi.mocked(prisma.crmEmailThread.findFirst).mockResolvedValue({
      id: "th1",
      accountId: "acc1",
      contactId: null,
    } as never);
    vi.mocked(prisma.crmContact.findFirst).mockResolvedValue({
      id: "c9",
      accountId: "acc-other",
      firstName: "Ana",
      lastName: "Pérez",
      email: null,
    } as never);

    const req = new NextRequest("http://localhost/api/crm/correos/th1/contacts", {
      method: "POST",
      body: JSON.stringify({ contactId: "c9" }),
    });
    const res = await POST(req, { params: Promise.resolve({ threadId: "th1" }) });
    expect(res.status).toBe(409);
    expect(prisma.crmEmailThreadContact.upsert).not.toHaveBeenCalled();
  });
});
