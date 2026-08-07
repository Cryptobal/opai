import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    admin: {
      findFirst: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { resolveInboundActorId } from "../inbound-actor";

const findFirst = prisma.admin.findFirst as unknown as ReturnType<typeof vi.fn>;

describe("resolveInboundActorId", () => {
  beforeEach(() => {
    findFirst.mockReset();
  });

  it("prefiere owner activo", async () => {
    findFirst.mockResolvedValueOnce({ id: "owner-1" });
    await expect(resolveInboundActorId("tenant-A")).resolves.toBe("owner-1");
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "tenant-A", status: "active", role: "owner" },
      }),
    );
  });

  it("cae a cualquier admin activo si no hay owner", async () => {
    findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "admin-2" });
    await expect(resolveInboundActorId("tenant-A")).resolves.toBe("admin-2");
    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it("retorna null si no hay admins activos", async () => {
    findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    await expect(resolveInboundActorId("tenant-A")).resolves.toBeNull();
  });
});
