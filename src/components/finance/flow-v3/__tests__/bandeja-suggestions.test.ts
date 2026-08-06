import { describe, expect, it } from "vitest";
import {
  formatGuardiaStateBadge,
  formatSuggestionDestino,
  formatSuggestionMotivo,
  learnRuleForSuggestionSource,
  suggestionHasFlowDestination,
  type BandejaTxSuggestion,
} from "../bandeja-suggestions";

describe("bandeja-suggestions helpers", () => {
  it("learnRule NONE para payroll y te", () => {
    expect(learnRuleForSuggestionSource("payroll")).toBe("NONE");
    expect(learnRuleForSuggestionSource("te")).toBe("NONE");
    expect(learnRuleForSuggestionSource("rule")).toBe("NONE");
    expect(learnRuleForSuggestionSource("heuristic")).toBe("NONE");
  });

  it("formatSuggestionDestino nunca vacío", () => {
    expect(formatSuggestionDestino(undefined)).toBe("Sin sugerencia");
    expect(
      formatSuggestionDestino({
        kind: "NONE",
        label: null,
        reason: "Sin identidad",
        source: null,
      }),
    ).toBe("Sin sugerencia");
    expect(
      formatSuggestionDestino({
        kind: "FLOW_ROW",
        flowRowId: "x",
        label: "Sueldos líquidos",
        reason: "calza",
        source: "payroll",
      }),
    ).toBe("Sueldos líquidos");
  });

  it("formatSuggestionMotivo nunca vacío", () => {
    expect(formatSuggestionMotivo(undefined).length).toBeGreaterThan(0);
    expect(
      formatSuggestionMotivo({
        kind: "NONE",
        label: null,
        reason: "",
        source: null,
      }),
    ).toBe("Sin motivo");
  });

  it("suggestionHasFlowDestination", () => {
    const ok: BandejaTxSuggestion = {
      kind: "FLOW_ROW",
      flowRowId: "abc",
      label: "X",
      reason: "r",
      source: "te",
    };
    expect(suggestionHasFlowDestination(ok)).toBe(true);
    expect(
      suggestionHasFlowDestination({
        kind: "NONE",
        label: null,
        reason: "n",
        source: null,
      }),
    ).toBe(false);
  });

  it("formatGuardiaStateBadge", () => {
    expect(
      formatGuardiaStateBadge({
        status: "activo",
        lifecycleStatus: "activo",
        terminatedAt: null,
        installationName: "Polpaico",
        availableExtraShifts: true,
      }),
    ).toBe("Guardia activo · Polpaico");
    expect(
      formatGuardiaStateBadge({
        status: "inactivo",
        lifecycleStatus: "inactivo",
        terminatedAt: "2026-07-31",
        installationName: null,
        availableExtraShifts: false,
      }),
    ).toBe("Finiquitado 31/07/26");
  });
});
