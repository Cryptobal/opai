import { describe, it, expect } from "vitest";
import { roundUfTo2, ufToClpNet } from "../uf-utils";

describe("roundUfTo2", () => {
  it("deja 2 decimales intactos", () => {
    expect(roundUfTo2(163.21)).toBe(163.21);
  });

  it("half-up desde 4 decimales", () => {
    expect(roundUfTo2(163.2052)).toBe(163.21);
    expect(roundUfTo2(26.3158)).toBe(26.32);
  });

  it("entero queda en .00 numérico", () => {
    expect(roundUfTo2(40)).toBe(40);
  });

  it("no-finito → 0", () => {
    expect(roundUfTo2(Number.NaN)).toBe(0);
    expect(roundUfTo2(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("ufToClpNet", () => {
  it("redondea el neto CLP después de 2 decimales de UF", () => {
    expect(ufToClpNet(163.2052, 40_874)).toBe(6_671_046);
  });

  it("T/C 0 o vacío → 0", () => {
    expect(ufToClpNet(40, 0)).toBe(0);
  });
});
