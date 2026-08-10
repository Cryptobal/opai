import { describe, expect, it } from "vitest";
import {
  hasPartnerSocioPair,
  resolvePartnerSocioRow,
} from "../partner-account-route";

describe("partner-account-route", () => {
  const pair = [
    { rowId: "a", canonicalKey: "APORTE_SOCIO" },
    { rowId: "d", canonicalKey: "DEVOL_PRESTAMO_SOCIO" },
  ];

  it("abono → aporte", () => {
    expect(resolvePartnerSocioRow(pair, true)).toBe("a");
  });

  it("cargo → devolución", () => {
    expect(resolvePartnerSocioRow(pair, false)).toBe("d");
  });

  it("sin pair → null", () => {
    expect(resolvePartnerSocioRow([{ rowId: "x", canonicalKey: "SUELDO" }], true)).toBeNull();
  });

  it("hasPartnerSocioPair", () => {
    expect(hasPartnerSocioPair(pair)).toBe(true);
    expect(hasPartnerSocioPair([{ rowId: "x", canonicalKey: "SUELDO" }])).toBe(false);
  });
});
