import { describe, it, expect, vi, beforeEach } from "vitest";

const { toggleFindUniqueMock } = vi.hoisted(() => ({
  toggleFindUniqueMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenantTransactionalEmailConfig: { findUnique: toggleFindUniqueMock },
  },
}));

import { isTransactionalKindEnabled } from "../is-kind-enabled";

describe("isTransactionalKindEnabled", () => {
  beforeEach(() => {
    toggleFindUniqueMock.mockReset();
  });

  it("habilita kinds desconocidos sin consultar el toggle", async () => {
    await expect(isTransactionalKindEnabled("t-1", "kind_inventado")).resolves.toBe(true);
    expect(toggleFindUniqueMock).not.toHaveBeenCalled();
  });

  it("habilita kinds required sin consultar el toggle", async () => {
    await expect(isTransactionalKindEnabled("t-1", "dte_invoice_sent")).resolves.toBe(true);
    expect(toggleFindUniqueMock).not.toHaveBeenCalled();
  });

  it("habilita si no hay fila de override", async () => {
    toggleFindUniqueMock.mockResolvedValue(null);
    await expect(isTransactionalKindEnabled("t-1", "rondas_monitor")).resolves.toBe(true);
    expect(toggleFindUniqueMock).toHaveBeenCalledWith({
      where: { tenantId_kind: { tenantId: "t-1", kind: "rondas_monitor" } },
      select: { enabled: true },
    });
  });

  it("deshabilita si el override está en false", async () => {
    toggleFindUniqueMock.mockResolvedValue({ enabled: false });
    await expect(isTransactionalKindEnabled("t-1", "cobertura_alert")).resolves.toBe(false);
  });

  it("fail-open si la consulta falla", async () => {
    toggleFindUniqueMock.mockRejectedValue(new Error("db down"));
    await expect(isTransactionalKindEnabled("t-1", "rondas_monitor")).resolves.toBe(true);
  });
});
