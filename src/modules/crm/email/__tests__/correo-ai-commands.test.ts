import { describe, expect, it } from "vitest";
import {
  resolveCorreoAiCommands,
  radarVerticalLabel,
  CORREO_AI_COMMANDS,
  primaryCommandForCategory,
  resolvePrimaryCorreoAiCommand,
} from "../correo-ai-commands";
import type { RadarCapability } from "../radar-types";

const caps = (...c: RadarCapability[]) => new Set<RadarCapability>(c);
const all = caps(
  "radar_comercial",
  "radar_operaciones",
  "radar_rrhh",
  "radar_finanzas",
);

describe("resolveCorreoAiCommands", () => {
  it("analizar siempre primero en comercial", () => {
    const { primary } = resolveCorreoAiCommands("comercial", all);
    expect(primary[0]?.id).toBe("analizar");
    expect(primary.map((c) => c.id)).toEqual(["analizar", "crm_completo", "lead"]);
  });

  it("contratos prioriza crm_completo y lead", () => {
    const { primary } = resolveCorreoAiCommands("contratos", all);
    expect(primary.map((c) => c.id)).toEqual(["analizar", "crm_completo", "lead"]);
  });

  it("operaciones prioriza ticket_operativo", () => {
    const { primary } = resolveCorreoAiCommands("operaciones", all);
    expect(primary.map((c) => c.id)).toEqual(["analizar", "ticket_operativo"]);
  });

  it("incidentes prioriza ticket_operativo", () => {
    const { primary } = resolveCorreoAiCommands("incidentes", all);
    expect(primary.map((c) => c.id)).toEqual(["analizar", "ticket_operativo"]);
  });

  it("rrhh prioriza candidato", () => {
    const { primary } = resolveCorreoAiCommands("rrhh", all);
    expect(primary.map((c) => c.id)).toEqual(["analizar", "candidato"]);
  });

  it("finanzas y cobranza priorizan cobranza", () => {
    expect(resolveCorreoAiCommands("finanzas", all).primary.map((c) => c.id)).toEqual([
      "analizar",
      "cobranza",
    ]);
    expect(resolveCorreoAiCommands("cobranza", all).primary.map((c) => c.id)).toEqual([
      "analizar",
      "cobranza",
    ]);
  });

  it("otro/null prioriza analizar + resumen", () => {
    expect(resolveCorreoAiCommands("otro", all).primary.map((c) => c.id)).toEqual([
      "analizar",
      "resumen",
    ]);
    expect(resolveCorreoAiCommands(null, all).primary.map((c) => c.id)).toEqual([
      "analizar",
      "resumen",
    ]);
  });

  it("tope de 3 en primary", () => {
    const { primary } = resolveCorreoAiCommands("comercial", all);
    expect(primary.length).toBeLessThanOrEqual(3);
  });

  it("filtra por capability: sin radar_comercial no ve analizar ni crm", () => {
    const { primary, more } = resolveCorreoAiCommands(
      "comercial",
      caps("radar_operaciones"),
    );
    const ids = [...primary, ...more].map((c) => c.id);
    expect(ids).not.toContain("analizar");
    expect(ids).not.toContain("crm_completo");
    expect(ids).not.toContain("lead");
    expect(ids).toContain("ticket_operativo");
  });

  it("sin ninguna capability de radar: grupo vacío", () => {
    const { primary, more } = resolveCorreoAiCommands("comercial", caps());
    expect(primary).toEqual([]);
    expect(more).toEqual([]);
  });

  it("sin edit oculta comandos de escritura", () => {
    const { primary, more } = resolveCorreoAiCommands("comercial", all, {
      canEditCorreos: false,
    });
    const ids = [...primary, ...more].map((c) => c.id);
    expect(ids).toContain("analizar");
    expect(ids).not.toContain("crm_completo");
    expect(ids).not.toContain("lead");
    expect(ids).not.toContain("ticket_operativo");
  });

  it("more contiene el resto de visibles no prioritarios", () => {
    const { primary, more } = resolveCorreoAiCommands("comercial", all);
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
  it("respeta capability: sin radar_comercial no ofrece lead", () => {
    const cmd = resolvePrimaryCorreoAiCommand(
      "consulta_comercial",
      "comercial",
      caps("radar_operaciones"),
    );
    expect(cmd?.id).toBe("ticket_operativo");
  });

  it("sin caps no muestra acción principal", () => {
    expect(resolvePrimaryCorreoAiCommand("licitacion", "comercial", caps())).toBeNull();
  });

  it("licitación con radar_comercial → analizar", () => {
    const cmd = resolvePrimaryCorreoAiCommand("licitacion", "contratos", all);
    expect(cmd?.id).toBe("analizar");
  });
});

describe("radarVerticalLabel", () => {
  it("traduce verticales conocidas", () => {
    expect(radarVerticalLabel("comercial")).toBe("Comercial");
    expect(radarVerticalLabel(null)).toBe("sin señal");
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
