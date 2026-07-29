import { describe, expect, it } from "vitest";
import {
  applyCopilotoCorreosCompat,
  validatePermissions,
  type RolePermissions,
} from "../permissions";

function perms(capabilities: Record<string, boolean>): RolePermissions {
  return { modules: {}, submodules: {}, capabilities };
}

describe("applyCopilotoCorreosCompat", () => {
  it("otorga copiloto_correos si el template tenía radar_comercial", () => {
    const out = applyCopilotoCorreosCompat(
      perms({ radar_comercial: true } as unknown as Record<string, boolean>),
    );
    expect(out.capabilities.copiloto_correos).toBe(true);
  });

  it("no inventa copiloto si no había radar_comercial", () => {
    const out = applyCopilotoCorreosCompat(perms({ te_approve: true }));
    expect(out.capabilities.copiloto_correos).toBeUndefined();
  });

  it("respeta copiloto_correos: false explícito", () => {
    const out = applyCopilotoCorreosCompat(
      perms({
        copiloto_correos: false,
        ...( { radar_comercial: true } as object ),
      } as Record<string, boolean>),
    );
    expect(out.capabilities.copiloto_correos).toBe(false);
  });

  it("no pisa copiloto_correos ya true", () => {
    const out = applyCopilotoCorreosCompat(perms({ copiloto_correos: true }));
    expect(out.capabilities.copiloto_correos).toBe(true);
  });
});

describe("validatePermissions legacy radar_*", () => {
  it("acepta JSON con caps radar_* y las filtra del resultado", () => {
    const result = validatePermissions({
      modules: { productividad: "edit" },
      submodules: {},
      capabilities: {
        radar_comercial: true,
        radar_operaciones: true,
        copiloto_correos: true,
      },
    });
    expect(result.valid).toBe(true);
    expect(result.permissions?.capabilities).toEqual({ copiloto_correos: true });
    expect(result.permissions?.capabilities).not.toHaveProperty("radar_comercial");
  });
});
