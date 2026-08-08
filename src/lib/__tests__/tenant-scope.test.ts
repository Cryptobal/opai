import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmInstallation: { findFirst: vi.fn() },
    opsGuardia: { findFirst: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  requireInstallationAccess,
  requireGuardiaAccess,
  isGlobalCatalogWriter,
} from "../tenant-scope";
import type { AuthContext } from "@/lib/api-auth";

const findInstallation = prisma.crmInstallation.findFirst as unknown as ReturnType<
  typeof vi.fn
>;
const findGuardia = prisma.opsGuardia.findFirst as unknown as ReturnType<typeof vi.fn>;

const ctx: AuthContext = {
  userId: "user-1",
  tenantId: "tenant-A",
  userEmail: "a@example.com",
  userRole: "admin",
};

const OWN_INSTALLATION = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OTHER_INSTALLATION = "ffffffff-1111-4222-8333-444444444444";
const OWN_GUARDIA = "11111111-2222-4333-8444-555555555555";

describe("requireInstallationAccess", () => {
  beforeEach(() => {
    findInstallation.mockReset();
  });

  it("retorna ok cuando la instalación pertenece al tenant", async () => {
    findInstallation.mockResolvedValue({ id: OWN_INSTALLATION });

    const result = await requireInstallationAccess(ctx, OWN_INSTALLATION);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.installationId).toBe(OWN_INSTALLATION);
    }
    expect(findInstallation).toHaveBeenCalledWith({
      where: { id: OWN_INSTALLATION, tenantId: "tenant-A" },
      select: { id: true },
    });
  });

  it("retorna 404 cuando la instalación es de otro tenant", async () => {
    findInstallation.mockResolvedValue(null);

    const result = await requireInstallationAccess(ctx, OTHER_INSTALLATION);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(404);
      const body = await result.response.json();
      expect(body).toEqual({
        success: false,
        error: "Instalación no encontrada",
      });
    }
  });

  it("retorna 404 cuando el id no existe", async () => {
    findInstallation.mockResolvedValue(null);

    const result = await requireInstallationAccess(ctx, OWN_INSTALLATION);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(404);
    }
  });

  it("retorna 404 sin consultar la BD si el id está malformado", async () => {
    const result = await requireInstallationAccess(ctx, "not-a-uuid");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(404);
    }
    expect(findInstallation).not.toHaveBeenCalled();
  });
});

describe("requireGuardiaAccess", () => {
  beforeEach(() => {
    findGuardia.mockReset();
  });

  it("retorna ok cuando el guardia pertenece al tenant", async () => {
    findGuardia.mockResolvedValue({ id: OWN_GUARDIA });

    const result = await requireGuardiaAccess(ctx, OWN_GUARDIA);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.guardiaId).toBe(OWN_GUARDIA);
    }
    expect(findGuardia).toHaveBeenCalledWith({
      where: { id: OWN_GUARDIA, tenantId: "tenant-A" },
      select: { id: true },
    });
  });

  it("retorna 404 sin consultar la BD si el id está malformado", async () => {
    const result = await requireGuardiaAccess(ctx, "cuid_style_id");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(404);
      const body = await result.response.json();
      expect(body.error).toBe("Guardia no encontrado");
    }
    expect(findGuardia).not.toHaveBeenCalled();
  });
});

describe("isGlobalCatalogWriter", () => {
  const original = process.env.PAYROLL_PARAMS_WRITE_TENANT_SLUGS;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.PAYROLL_PARAMS_WRITE_TENANT_SLUGS;
    } else {
      process.env.PAYROLL_PARAMS_WRITE_TENANT_SLUGS = original;
    }
  });

  it("retorna false si la variable está ausente", () => {
    delete process.env.PAYROLL_PARAMS_WRITE_TENANT_SLUGS;
    expect(isGlobalCatalogWriter("gard")).toBe(false);
  });

  it("retorna false si la variable está vacía", () => {
    process.env.PAYROLL_PARAMS_WRITE_TENANT_SLUGS = "  ";
    expect(isGlobalCatalogWriter("gard")).toBe(false);
  });

  it("acepta slugs de la lista (case-insensitive)", () => {
    process.env.PAYROLL_PARAMS_WRITE_TENANT_SLUGS = "gard, otro";
    expect(isGlobalCatalogWriter("Gard")).toBe(true);
    expect(isGlobalCatalogWriter("otro")).toBe(true);
    expect(isGlobalCatalogWriter("google")).toBe(false);
  });
});
