import { describe, expect, it, vi } from "vitest";
import { ensureTipoForLegacyType } from "@/lib/docs/ensure-tipo";

describe("ensureTipoForLegacyType", () => {
  it("rechaza códigos vacíos, undefined y null sin tocar la BD", async () => {
    const db = {
      tipoDocumento: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
    };

    await expect(
      ensureTipoForLegacyType(db as never, "tenant-1", "", false)
    ).rejects.toThrow("tipo de documento inválido");
    await expect(
      ensureTipoForLegacyType(db as never, "tenant-1", "undefined", false)
    ).rejects.toThrow("tipo de documento inválido");
    await expect(
      ensureTipoForLegacyType(db as never, "tenant-1", "null", true)
    ).rejects.toThrow("tipo de documento inválido");
    await expect(
      ensureTipoForLegacyType(db as never, "tenant-1", "  UNDEFINED  ", false)
    ).rejects.toThrow("tipo de documento inválido");

    expect(db.tipoDocumento.findUnique).not.toHaveBeenCalled();
    expect(db.tipoDocumento.create).not.toHaveBeenCalled();
  });
});
