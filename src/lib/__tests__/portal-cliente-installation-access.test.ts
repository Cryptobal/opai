import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock de prisma ANTES de importar el helper (hoisted).
vi.mock("@/lib/prisma", () => {
  const findFirst = vi.fn();
  return {
    prisma: {
      crmInstallation: { findFirst },
    },
  };
});

// cookies() no se usa aquí, pero el módulo portal-cliente.ts es "server-only"
// y en jsdom ese import explota. Lo neutralizamos.
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));

import { ensureInstallationAccess } from "../portal-cliente";
import { prisma } from "@/lib/prisma";

const findFirstMock = prisma.crmInstallation.findFirst as unknown as ReturnType<typeof vi.fn>;

describe("ensureInstallationAccess", () => {
  const session = { accountId: "acc-A", tenantId: "tenant-A" };

  beforeEach(() => {
    findFirstMock.mockReset();
  });

  it("retorna false si no se pasa installationId", async () => {
    await expect(ensureInstallationAccess(session, null)).resolves.toBe(false);
    await expect(ensureInstallationAccess(session, undefined)).resolves.toBe(false);
    await expect(ensureInstallationAccess(session, "")).resolves.toBe(false);
    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it("consulta la BD filtrando por id + accountId + tenantId (defensa en profundidad)", async () => {
    findFirstMock.mockResolvedValue({ id: "inst-1" });

    const ok = await ensureInstallationAccess(session, "inst-1");

    expect(ok).toBe(true);
    expect(findFirstMock).toHaveBeenCalledTimes(1);
    expect(findFirstMock).toHaveBeenCalledWith({
      where: {
        id: "inst-1",
        accountId: "acc-A",
        tenantId: "tenant-A",
      },
      select: { id: true },
    });
  });

  it("retorna false si la instalación existe en otro tenant (cross-tenant)", async () => {
    // Prisma retorna null porque tenant-A no tiene esa instalación aunque exista en BD.
    findFirstMock.mockResolvedValue(null);
    const ok = await ensureInstallationAccess(session, "inst-de-tenant-B");
    expect(ok).toBe(false);
  });

  it("retorna false si la instalación existe en otra cuenta del mismo tenant", async () => {
    findFirstMock.mockResolvedValue(null);
    const ok = await ensureInstallationAccess(session, "inst-de-otra-cuenta");
    expect(ok).toBe(false);
  });
});
