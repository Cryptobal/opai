import { describe, expect, it } from "vitest";
import {
  evaluateCondition,
  type RuleCondition,
} from "../automatch-rule.service";
import {
  extractAllCanonicalRutsFromBankText,
  extractCanonicalRutFromBankText,
} from "../rut-extract";

const RUT_A = "55294666"; // 5.529.466-6
const RUT_B = "130512461"; // 13.051.246-1
const RUT_K = "1000005k"; // 1.000.005-K

function rutCond(value: string | string[]): RuleCondition {
  return {
    field: "BENEFICIARY_RUT",
    operator: "RUT_MATCHES",
    value,
  };
}

describe("extractAllCanonicalRutsFromBankText", () => {
  it("captura las cuatro formas reales del brief (formateada y densa con ceros)", () => {
    expect(
      extractCanonicalRutFromBankText("Transf.Internet a 5.529.466-6"),
    ).toBe(RUT_A);
    expect(
      extractCanonicalRutFromBankText("0055294666 Transf. Carlos Irigoyen"),
    ).toBe(RUT_A);
    expect(
      extractCanonicalRutFromBankText("Transf.Internet a 13.051.246-1"),
    ).toBe(RUT_B);
    expect(
      extractCanonicalRutFromBankText("0130512461 Transf a Jorge Monteneg"),
    ).toBe(RUT_B);
  });

  it("devuelve todos los RUT distintos en orden de aparición", () => {
    const found = extractAllCanonicalRutsFromBankText(
      "Transf de 76.111.111-1 a 5.529.466-6",
    );
    // Solo incluye los que pasen DV; 5.529.466-6 sí.
    expect(found).toContain(RUT_A);
  });

  it("acepta dígito verificador K en mayúscula y minúscula", () => {
    expect(extractCanonicalRutFromBankText("Pago 1.000.005-K OK")).toBe(RUT_K);
    expect(extractCanonicalRutFromBankText("Pago 1.000.005-k OK")).toBe(RUT_K);
    expect(extractCanonicalRutFromBankText("Pago 1000005-K OK")).toBe(RUT_K);
  });
});

describe("RUT_MATCHES con extractor canónico", () => {
  it("matchea las cuatro glosas reales con valor escalar legacy", () => {
    const cond = rutCond(RUT_A);
    expect(
      evaluateCondition(cond, {
        amount: -1000,
        description: "Transf.Internet a 5.529.466-6",
        reference: null,
      }),
    ).toBe(true);
    expect(
      evaluateCondition(cond, {
        amount: -1000,
        description: "0055294666 Transf. Carlos Irigoyen",
        reference: null,
      }),
    ).toBe(true);
    expect(
      evaluateCondition(cond, {
        amount: -1000,
        description: "Transf.Internet a 13.051.246-1",
        reference: null,
      }),
    ).toBe(false);
  });

  it("acepta lista de RUT en un solo criterio", () => {
    const cond = rutCond([RUT_A, RUT_B]);
    expect(
      evaluateCondition(cond, {
        amount: -500,
        description: "0055294666 Transf. Carlos Irigoyen",
        reference: null,
      }),
    ).toBe(true);
    expect(
      evaluateCondition(cond, {
        amount: -500,
        description: "0130512461 Transf a Jorge Monteneg",
        reference: null,
      }),
    ).toBe(true);
    expect(
      evaluateCondition(cond, {
        amount: -500,
        description: "Pago sin rut",
        reference: null,
      }),
    ).toBe(false);
  });

  it("matchea RUT con DV K vía lista", () => {
    expect(
      evaluateCondition(rutCond(["1.000.005-K"]), {
        amount: -1,
        description: "Pago 1.000.005-k Transf. socio",
        reference: null,
      }),
    ).toBe(true);
  });

  it("matchea si alguno de los RUT de la glosa está en la lista esperada", () => {
    const cond = rutCond([RUT_A]);
    expect(
      evaluateCondition(cond, {
        amount: -1,
        description: "Transf de 7.799.999-9 a 5.529.466-6",
        reference: null,
      }),
    ).toBe(true);
  });
});
