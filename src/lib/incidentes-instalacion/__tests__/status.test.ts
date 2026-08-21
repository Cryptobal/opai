// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mergeTicketMetadata, readValidation } from "../metadata";
import { canIncidenteTransitionTo, incidenteUiStatus } from "../status";

describe("mergeTicketMetadata", () => {
  it("fusiona nested objects sin pisar el resto", () => {
    const merged = mergeTicketMetadata(
      { publicReport: { category: "acceso" }, keep: 1 },
      { validation: { auto: true, validatedAt: "2026-01-01" } },
    );
    expect(merged.keep).toBe(1);
    expect((merged.publicReport as { category: string }).category).toBe("acceso");
    expect((merged.validation as { auto: boolean }).auto).toBe(true);
  });
});

describe("readValidation", () => {
  it("lee validation.auto", () => {
    const v = readValidation({ validation: { auto: true, validatedAt: "2026-08-21T00:00:00.000Z" } });
    expect(v?.auto).toBe(true);
  });
});

describe("incidenteUiStatus", () => {
  it("mapea estados de ticket a etiquetas del flujo", () => {
    expect(incidenteUiStatus("open")).toBe("nuevo");
    expect(incidenteUiStatus("in_progress")).toBe("en_atencion");
    expect(incidenteUiStatus("resolved")).toBe("por_validar");
    expect(incidenteUiStatus("closed")).toBe("validado");
  });
});

describe("canIncidenteTransitionTo", () => {
  it("permite resolved → closed y resolved → in_progress", () => {
    expect(canIncidenteTransitionTo("resolved", "closed")).toBe(true);
    expect(canIncidenteTransitionTo("resolved", "in_progress")).toBe(true);
    expect(canIncidenteTransitionTo("closed", "in_progress")).toBe(false);
    expect(canIncidenteTransitionTo("open", "resolved")).toBe(false);
  });
});
