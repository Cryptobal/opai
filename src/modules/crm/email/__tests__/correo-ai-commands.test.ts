import { describe, expect, it } from "vitest";
import {
  resolveCorreoAiCommands,
  CORREO_AI_COMMANDS,
  primaryCommandForCategory,
  resolvePrimaryCorreoAiCommand,
} from "../correo-ai-commands";
import type { RolePermissions } from "@/lib/permissions";
import type { ModuleKey } from "@/lib/permissions";

function perms(opts: {
  copiloto?: boolean;
  modules?: Partial<Record<ModuleKey, "view" | "edit" | "full" | "none">>;
  submodules?: Record<string, "view" | "edit" | "full" | "none">;
}): RolePermissions {
  return {
    modules: {
      productividad: "edit",
      ...opts.modules,
    },
    submodules: opts.submodules ?? {},
    capabilities: opts.copiloto === false ? {} : { copiloto_correos: true },
  };
}

const full = perms({
  modules: { ops: "edit", finance: "view", crm: "edit" },
  submodules: {
    "ops.tickets": "edit",
    "ops.ats": "edit",
  },
});

describe("resolveCorreoAiCommands", () => {
  it("orden fijo de primary: analizar → resumen → crm_completo", () => {
    const { primary } = resolveCorreoAiCommands(full);
    expect(primary.map((c) => c.id)).toEqual(["analizar", "resumen", "crm_completo"]);
  });

  it("sin copiloto_correos: grupo vacío", () => {
    const { primary, more } = resolveCorreoAiCommands(perms({ copiloto: false }));
    expect(primary).toEqual([]);
    expect(more).toEqual([]);
  });

  it("sin acceso a ops.tickets oculta ticket_operativo", () => {
    const { primary, more } = resolveCorreoAiCommands(
      perms({ modules: { ops: "none", finance: "view" } }),
    );
    const ids = [...primary, ...more].map((c) => c.id);
    expect(ids).not.toContain("ticket_operativo");
    expect(ids).not.toContain("candidato");
    expect(ids).toContain("analizar");
    expect(ids).toContain("cobranza");
  });

  it("sin acceso a finance oculta cobranza", () => {
    const { more } = resolveCorreoAiCommands(
      perms({
        modules: { ops: "edit", finance: "none" },
        submodules: { "ops.tickets": "view", "ops.ats": "view" },
      }),
    );
    expect(more.map((c) => c.id)).not.toContain("cobranza");
    expect(more.map((c) => c.id)).toContain("ticket_operativo");
  });

  it("sin edit oculta comandos de escritura", () => {
    const { primary, more } = resolveCorreoAiCommands(full, {
      canEditCorreos: false,
    });
    const ids = [...primary, ...more].map((c) => c.id);
    expect(ids).toContain("analizar");
    expect(ids).toContain("resumen");
    expect(ids).not.toContain("crm_completo");
    expect(ids).not.toContain("lead");
    expect(ids).not.toContain("ticket_operativo");
  });

  it("more contiene el resto de visibles no prioritarios", () => {
    const { primary, more } = resolveCorreoAiCommands(full);
    const primaryIds = new Set(primary.map((c) => c.id));
    expect(more.every((c) => !primaryIds.has(c.id))).toBe(true);
    expect(more.some((c) => c.id === "investigar")).toBe(true);
  });
});

describe("primaryCommandForCategory", () => {
  it("mapea categorías a comandos", () => {
    expect(primaryCommandForCategory("licitacion")).toBe("analizar");
    expect(primaryCommandForCategory("cotizacion")).toBe("analizar");
    expect(primaryCommandForCategory("consulta_comercial")).toBe("lead");
    expect(primaryCommandForCategory("operacional")).toBe("ticket_operativo");
    expect(primaryCommandForCategory("facturacion")).toBe("cobranza");
    expect(primaryCommandForCategory("otro")).toBe("analizar");
    expect(primaryCommandForCategory(null)).toBe("analizar");
  });
});

describe("resolvePrimaryCorreoAiCommand", () => {
  it("sin copiloto no muestra acción principal", () => {
    expect(
      resolvePrimaryCorreoAiCommand("licitacion", perms({ copiloto: false })),
    ).toBeNull();
  });

  it("licitación con copiloto → analizar", () => {
    const cmd = resolvePrimaryCorreoAiCommand("licitacion", full);
    expect(cmd?.id).toBe("analizar");
  });

  it("consulta_comercial → lead cuando hay edit", () => {
    const cmd = resolvePrimaryCorreoAiCommand("consulta_comercial", full);
    expect(cmd?.id).toBe("lead");
  });
});

describe("CORREO_AI_COMMANDS", () => {
  it("tiene ids únicos y endpoints/prompts coherentes con kind", () => {
    const ids = CORREO_AI_COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CORREO_AI_COMMANDS) {
      if (c.kind === "panel") expect(c.endpoint).toBeTypeOf("function");
      if (c.kind === "chat") expect(c.prompt).toBeTruthy();
    }
  });
});
