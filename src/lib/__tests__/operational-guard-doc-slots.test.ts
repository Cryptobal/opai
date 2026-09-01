import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tipoDocumento: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { getOperationalGuardDocSlots } from "@/lib/operational-guard-doc-slots";
import {
  FALLBACK_GUARD_TIPOS,
  isValidGuardDocCode,
} from "@/lib/operational-guard-doc-slots-shared";

describe("isValidGuardDocCode", () => {
  it("acepta códigos de catálogo y custom slugificados", () => {
    expect(isValidGuardDocCode("historial_penal")).toBe(true);
    expect(isValidGuardDocCode("contrato_guardia")).toBe(true);
    expect(isValidGuardDocCode("custom_historial_penal")).toBe(true);
  });

  it("rechaza códigos inválidos", () => {
    expect(isValidGuardDocCode("")).toBe(false);
    expect(isValidGuardDocCode("undefined")).toBe(false);
    expect(isValidGuardDocCode("null")).toBe(false);
    expect(isValidGuardDocCode("tipo_desconocido")).toBe(false);
    expect(isValidGuardDocCode("sin_clasificar_guardia")).toBe(false);
    expect(isValidGuardDocCode("sin_clasificar")).toBe(false);
    expect(isValidGuardDocCode("Historial Penal")).toBe(false);
  });
});

describe("getOperationalGuardDocSlots", () => {
  beforeEach(() => {
    vi.mocked(prisma.tipoDocumento.findMany).mockReset();
  });

  it("excluye códigos inválidos y conserva FALLBACK_GUARD_TIPOS", async () => {
    vi.mocked(prisma.tipoDocumento.findMany).mockResolvedValue([
      {
        codigo: "undefined",
        nombre: "Undefined",
        normativa: null,
        obligatorio: true,
        tieneVencimiento: true,
        diasAlerta: 30,
        order: 1,
      },
      {
        codigo: "sin_clasificar_guardia",
        nombre: "Sin clasificar",
        normativa: null,
        obligatorio: false,
        tieneVencimiento: false,
        diasAlerta: 0,
        order: 2,
      },
      {
        codigo: "historial_penal",
        nombre: "Historial Penal",
        normativa: "D.S. 867",
        obligatorio: true,
        tieneVencimiento: true,
        diasAlerta: 30,
        order: 26,
      },
    ] as never);

    const slots = await getOperationalGuardDocSlots("tenant-1");
    const codes = slots.map((s) => s.codigo);

    expect(codes).not.toContain("undefined");
    expect(codes).not.toContain("sin_clasificar_guardia");
    expect(codes).toContain("historial_penal");
    for (const fallback of FALLBACK_GUARD_TIPOS) {
      expect(codes).toContain(fallback.codigo);
    }
  });
});
