/**
 * Tests del helper puro gestionFromDte: deriva el resumen de gestión de cobro
 * (proforma/EP/OC) desde el FinanceDte vinculado. Sin DB — sólo mockea los
 * imports de módulo (server-only, prisma) que arrastra projection.service.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { gestionFromDte } from "../projection.service";

const SENT_AT = new Date("2026-07-07T13:30:00Z");

/** Base sin gestión: todo apagado. Cada test enciende lo que necesita. */
function baseDte(overrides: Record<string, unknown> = {}) {
  return {
    requireProforma: false,
    proformaStatus: "NONE",
    proformaSentAt: null,
    proformaLastRecipient: null,
    requireEstadoPago: false,
    estadoPagoStatus: "NONE",
    estadoPagoSentAt: null,
    additionalReferences: null,
    ...overrides,
  };
}

describe("gestionFromDte", () => {
  it("(a) proforma SENT + OC 801 → summary correcto", () => {
    const g = gestionFromDte(
      baseDte({
        requireProforma: true,
        proformaStatus: "SENT",
        proformaSentAt: SENT_AT,
        proformaLastRecipient: "mmunoz@transmat.cl",
        additionalReferences: [
          { tipoDocRef: "801", folioRef: "4500-8812", fchRef: "2026-07-07" },
        ],
      }),
    );
    expect(g).not.toBeNull();
    expect(g).toEqual({
      proformaRequired: true,
      proformaStatus: "SENT",
      proformaSentAt: SENT_AT.toISOString(),
      proformaLastRecipient: "mmunoz@transmat.cl",
      epRequired: false,
      epStatus: "NONE",
      epSentAt: null,
      ocFolio: "4500-8812",
    });
  });

  it("(b) sin gestión (nada requerido, sin OC) → null", () => {
    expect(gestionFromDte(baseDte())).toBeNull();
  });

  it("(c) refs 802/803 sin 801 → ocFolio null (summary vive por requireEstadoPago)", () => {
    const g = gestionFromDte(
      baseDte({
        requireEstadoPago: true,
        estadoPagoStatus: "VIEWED",
        additionalReferences: [
          { tipoDocRef: "802", folioRef: "PED-1" },
          { tipoDocRef: "803", folioRef: "CTR-9" },
        ],
      }),
    );
    expect(g).not.toBeNull();
    expect(g?.ocFolio).toBeNull();
    expect(g?.epRequired).toBe(true);
    expect(g?.epStatus).toBe("VIEWED");
  });

  it("(d) additionalReferences malformado → no lanza, ocFolio null", () => {
    // No-array, entradas nulas, folio vacío: ninguna debe hacer throw.
    for (const refs of [
      "no-soy-array",
      { garbage: true },
      [null, 42, { tipoDocRef: "801" }, { tipoDocRef: "801", folioRef: "  " }],
    ]) {
      const g = gestionFromDte(
        baseDte({ requireProforma: true, additionalReferences: refs }),
      );
      expect(g).not.toBeNull();
      expect(g?.ocFolio).toBeNull();
    }
    // Sin flags y con Json basura → null (sin gestión).
    expect(
      gestionFromDte(baseDte({ additionalReferences: { nope: 1 } })),
    ).toBeNull();
  });
});
