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
    crmAccount: { findFirst: vi.fn() },
    crmDeal: { findMany: vi.fn() },
  },
}));

import { auth } from "@/lib/auth";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { prisma } from "@/lib/prisma";
import { GET } from "../route";

describe("GET /api/crm/correos/deals-for-account", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireCorreosAccess).mockResolvedValue({ authorized: true } as never);
    vi.mocked(auth).mockResolvedValue({ user: { tenantId: "t1" } } as never);
    vi.mocked(prisma.crmAccount.findFirst).mockResolvedValue({ id: "acc1" } as never);
  });

  it("devuelve negocios cerrados y los ordena después de los abiertos", async () => {
    const older = new Date("2026-01-01T00:00:00Z");
    const newer = new Date("2026-06-01T00:00:00Z");
    vi.mocked(prisma.crmDeal.findMany).mockResolvedValue([
      { id: "lost1", title: "Perdido", status: "lost", updatedAt: newer },
      { id: "open2", title: "Abierto B", status: "open", updatedAt: older },
      { id: "won1", title: "Ganado", status: "won", updatedAt: newer },
      { id: "open1", title: "Abierto A", status: "open", updatedAt: newer },
    ] as never);

    const req = new NextRequest(
      "http://localhost/api/crm/correos/deals-for-account?accountId=acc1",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items.map((i: { id: string }) => i.id)).toEqual([
      "open1",
      "open2",
      "won1",
      "lost1",
    ]);
    expect(body.items.every((i: { status: string }) => typeof i.status === "string")).toBe(
      true,
    );
    expect(prisma.crmDeal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "t1", accountId: "acc1" },
        take: 100,
      }),
    );
  });
});
