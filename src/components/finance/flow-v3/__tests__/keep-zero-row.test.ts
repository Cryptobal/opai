import { describe, expect, it } from "vitest";
import { keepZeroFlowRow } from "../keep-zero-row";

describe("keepZeroFlowRow", () => {
  it("mantiene canónicas (aporte socios) aunque estén en cero", () => {
    expect(
      keepZeroFlowRow({
        id: "1",
        section: "FINANCIAMIENTO",
        mapping: "ACCOUNTS",
        canonicalKey: "APORTE_SOCIO",
      }),
    ).toBe(true);
  });

  it("mantiene provisión (financiamiento sin llave)", () => {
    expect(
      keepZeroFlowRow({
        id: "2",
        section: "FINANCIAMIENTO",
        mapping: "ACCOUNTS",
        canonicalKey: null,
      }),
    ).toBe(true);
  });

  it("no fuerza bandejas", () => {
    expect(
      keepZeroFlowRow({
        id: "3",
        section: "GAV",
        mapping: "MANUAL",
        canonicalKey: "BANDEJA_EGRESO",
      }),
    ).toBe(false);
  });

  it("mantiene GAV configurado en cero", () => {
    expect(
      keepZeroFlowRow({
        id: "4",
        section: "GAV",
        mapping: "ACCOUNTS",
        canonicalKey: null,
      }),
    ).toBe(true);
  });
});
