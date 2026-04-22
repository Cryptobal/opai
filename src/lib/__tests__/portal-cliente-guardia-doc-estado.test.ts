import { describe, it, expect } from "vitest";
import {
  computeDocEstado,
  computeOs10Estado,
} from "@/lib/portal-cliente-guardia-doc-estado";

describe("computeDocEstado", () => {
  const fixedNow = new Date("2026-04-22T00:00:00Z");

  it("devuelve 'pendiente' cuando status es null/pending y no hay vencimiento", () => {
    expect(computeDocEstado({ status: null, expiresAt: null, now: fixedNow })).toBe(
      "pendiente",
    );
    expect(
      computeDocEstado({ status: "pending", expiresAt: null, now: fixedNow }),
    ).toBe("pendiente");
  });

  it("devuelve 'vencido' cuando status=rejected", () => {
    expect(
      computeDocEstado({ status: "rejected", expiresAt: null, now: fixedNow }),
    ).toBe("vencido");
  });

  it("devuelve 'no_aplica' cuando validated sin vencimiento", () => {
    expect(
      computeDocEstado({ status: "validated", expiresAt: null, now: fixedNow }),
    ).toBe("no_aplica");
    expect(
      computeDocEstado({ status: "approved", expiresAt: null, now: fixedNow }),
    ).toBe("no_aplica");
  });

  it("devuelve 'vigente' cuando validated + expires lejos", () => {
    expect(
      computeDocEstado({
        status: "validated",
        expiresAt: new Date("2027-01-01T00:00:00Z"),
        now: fixedNow,
      }),
    ).toBe("vigente");
  });

  it("devuelve 'por_vencer' cuando expires dentro de alertDays (30 default)", () => {
    expect(
      computeDocEstado({
        status: "validated",
        expiresAt: new Date("2026-05-10T00:00:00Z"), // ~18 días
        now: fixedNow,
      }),
    ).toBe("por_vencer");
  });

  it("devuelve 'vencido' cuando expires < now", () => {
    expect(
      computeDocEstado({
        status: "validated",
        expiresAt: new Date("2026-04-01T00:00:00Z"),
        now: fixedNow,
      }),
    ).toBe("vencido");
  });

  it("respeta alertDays custom", () => {
    expect(
      computeDocEstado({
        status: "validated",
        expiresAt: new Date("2026-06-10T00:00:00Z"), // ~49 días
        now: fixedNow,
        alertDays: 60,
      }),
    ).toBe("por_vencer");
  });
});

describe("computeOs10Estado", () => {
  const fixedNow = new Date("2026-04-22T00:00:00Z");

  it("devuelve 'vencido' cuando os10 === false", () => {
    expect(
      computeOs10Estado({ os10: false, os10ExpiresAt: null, now: fixedNow }),
    ).toBe("vencido");
  });

  it("devuelve 'pendiente' cuando os10 es null/undefined", () => {
    expect(
      computeOs10Estado({ os10: null, os10ExpiresAt: null, now: fixedNow }),
    ).toBe("pendiente");
  });

  it("devuelve 'no_aplica' cuando os10=true sin vencimiento registrado", () => {
    expect(
      computeOs10Estado({ os10: true, os10ExpiresAt: null, now: fixedNow }),
    ).toBe("no_aplica");
  });

  it("devuelve 'por_vencer' cerca del vencimiento", () => {
    expect(
      computeOs10Estado({
        os10: true,
        os10ExpiresAt: new Date("2026-05-10T00:00:00Z"),
        now: fixedNow,
      }),
    ).toBe("por_vencer");
  });

  it("devuelve 'vencido' cuando ya expiró", () => {
    expect(
      computeOs10Estado({
        os10: true,
        os10ExpiresAt: new Date("2026-01-01T00:00:00Z"),
        now: fixedNow,
      }),
    ).toBe("vencido");
  });
});
