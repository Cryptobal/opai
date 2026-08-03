import { describe, it, expect } from "vitest";
import { normalizeArithmeticBody, tryEvalArithmetic } from "../eval-arithmetic";

describe("normalizeArithmeticBody", () => {
  it("quita puntos de miles y convierte coma decimal", () => {
    expect(normalizeArithmeticBody("1.234.567,5")).toBe("1234567.5");
  });

  it("deja punto decimal simple", () => {
    expect(normalizeArithmeticBody("24.5*2")).toBe("24.5*2");
  });
});

describe("tryEvalArithmetic", () => {
  it("null si no empieza con =", () => {
    expect(tryEvalArithmetic("890000")).toBeNull();
  });

  it("evalúa producto y redondea a entero", () => {
    expect(tryEvalArithmetic("=890000*3")).toEqual({ ok: true, value: 2_670_000 });
  });

  it("acepta paréntesis y suma", () => {
    expect(tryEvalArithmetic("=(100+50)*2")).toEqual({ ok: true, value: 300 });
  });

  it("rechaza letras / identificadores", () => {
    const r = tryEvalArithmetic("=alert(1)");
    expect(r?.ok).toBe(false);
  });

  it("rechaza expresión vacía", () => {
    expect(tryEvalArithmetic("=")).toEqual({ ok: false, reason: "Expresión vacía" });
  });

  it("acepta formato es-CL con miles", () => {
    expect(tryEvalArithmetic("=1.000*2")).toEqual({ ok: true, value: 2000 });
  });
});
